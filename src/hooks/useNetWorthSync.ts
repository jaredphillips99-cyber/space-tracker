import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type AccountKind = 'holdings_link' | 'cash' | 'balance' | 'crypto' | 'credit_card';

export interface NetWorthAccount {
  id: string;
  kind: AccountKind;
  label: string;
  balance: number | null;   // for credit_card: amount currently owed (positive)
  balanceUpdatedAt: string | null;
  linked: boolean;
  sortOrder: number;
  // credit_card only — absent/null for all other kinds
  apr?: number | null;
  dueDate?: string | null;          // 'YYYY-MM-DD'
  minPayment?: number | null;
  statementBalance?: number | null;
  // crypto only — null for all other kinds (and for legacy manual-balance crypto
  // rows created before live pricing). A crypto row is live-priced only when
  // BOTH of these are set; otherwise it falls back to its manual `balance`.
  cryptoSymbol?: string | null;     // Yahoo Finance ticker, e.g. 'BTC-USD'
  cryptoQuantity?: number | null;   // units held
}

// Optional credit-card fields accepted at creation time
export interface CreditCardFields {
  apr?: number | null;
  dueDate?: string | null;
  minPayment?: number | null;
  statementBalance?: number | null;
}

// Crypto holding fields accepted at creation time (live pricing)
export interface CryptoFields {
  symbol: string;
  quantity: number;
}

// ─── DB row shape (accounts table) ─────────────────────────────────────────────

interface AccountRow {
  id: string;
  user_id: string;
  kind: AccountKind;
  label: string;
  balance: number | null;
  balance_updated_at: string | null;
  linked: boolean;
  sort_order: number;
  created_at?: string;
  // credit_card columns — nullable, null for all other kinds
  apr?: number | null;
  due_date?: string | null;
  min_payment?: number | null;
  statement_balance?: number | null;
  // crypto columns — nullable, null for all other kinds
  crypto_symbol?: string | null;
  crypto_quantity?: number | null;
}

function mapRow(r: AccountRow): NetWorthAccount {
  return {
    id:               r.id,
    kind:             r.kind,
    label:            r.label,
    balance:          r.balance == null ? null : Number(r.balance),
    balanceUpdatedAt: r.balance_updated_at,
    linked:           r.linked,
    sortOrder:        r.sort_order,
    apr:              r.apr == null ? null : Number(r.apr),
    dueDate:          r.due_date ?? null,
    minPayment:       r.min_payment == null ? null : Number(r.min_payment),
    statementBalance: r.statement_balance == null ? null : Number(r.statement_balance),
    cryptoSymbol:     r.crypto_symbol ?? null,
    cryptoQuantity:   r.crypto_quantity == null ? null : Number(r.crypto_quantity),
  };
}

// The single synthetic row representing "whatever is in the Portfolio tab".
// Its displayed value is always derived live from Portfolio positions —
// the stored balance is never read.
const LINKED_ROW_DEFAULTS = {
  kind:   'holdings_link' as AccountKind,
  label:  'Portfolio holdings',
  linked: true,
};

function localLinkedRow(): NetWorthAccount {
  return {
    id: 'linked-local',
    ...LINKED_ROW_DEFAULTS,
    balance: null,
    balanceUpdatedAt: null,
    sortOrder: 0,
  };
}

// ─── Hook return shape ─────────────────────────────────────────────────────────

export interface NetWorthSyncReturn {
  accounts:        NetWorthAccount[] | null;   // null = not yet loaded
  loading:         boolean;
  isAuthenticated: boolean;
  syncError:       string | null;
  addAccount:            (kind: AccountKind, label: string, balance?: number, creditCard?: CreditCardFields, crypto?: CryptoFields) => Promise<void>;
  updateAccountBalance:  (id: string, balance: number) => Promise<void>;
  updateCreditCard:      (id: string, fields: Partial<{
    balance: number;
    apr: number | null;
    dueDate: string | null;
    minPayment: number | null;
    statementBalance: number | null;
  }>) => Promise<void>;
  updateCryptoHolding:   (id: string, symbol: string, quantity: number) => Promise<void>;
  removeAccount:         (id: string) => Promise<void>;
  reorderAccounts:       (orderedIds: string[]) => Promise<void>;
}

// ─── Hook ──────────────────────────────────────────────────────────────────────
// Mirrors usePortfolioSync: resolve user via supabase.auth, load on mount,
// debounce balance edits, and flush pending writes on visibilitychange/pagehide
// so a change made right before closing the tab isn't lost.
// Anonymous users get in-memory accounts only — nothing persists.

export function useNetWorthSync(): NetWorthSyncReturn {
  const [accounts,  setAccounts]  = useState<NetWorthAccount[] | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [userId,    setUserId]    = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // ── Resolve user ID on mount and on auth changes ──────────────────────────

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── Load accounts when userId is resolved ─────────────────────────────────

  useEffect(() => {
    if (userId === null) {
      // No session — in-memory state only, seeded with the synthetic linked row
      setAccounts(prev => prev ?? [localLinkedRow()]);
      setLoading(false);
      return;
    }

    async function load() {
      setLoading(true);
      try {
        const { data: rows, error } = await supabase
          .from('accounts')
          .select('*')
          .eq('user_id', userId)
          .order('sort_order', { ascending: true });

        if (error) {
          console.warn('[networth-sync] accounts load failed:', error.message);
          setSyncError(`Accounts failed to load: ${error.message}`);
          return;
        }

        let mapped = (rows as AccountRow[]).map(mapRow);

        // Auto-create the linked Portfolio row on first load if missing
        if (!mapped.some(a => a.kind === 'holdings_link')) {
          const { data: inserted, error: insErr } = await supabase
            .from('accounts')
            .insert({
              user_id:    userId,
              ...LINKED_ROW_DEFAULTS,
              balance:    0,   // never read — display value derives from Portfolio
              sort_order: 0,
            })
            .select()
            .single();

          if (insErr) {
            console.warn('[networth-sync] linked row create failed:', insErr.message);
            setSyncError(`Failed to initialize accounts: ${insErr.message}`);
            // Still show a local linked row so the page renders
            mapped = [localLinkedRow(), ...mapped];
          } else if (inserted) {
            mapped = [mapRow(inserted as AccountRow), ...mapped];
            setSyncError(null);
          }
        }

        setAccounts(mapped);
      } finally {
        setLoading(false);
      }
    }

    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // ── Write: balance edits ──────────────────────────────────────────────────
  // Debounced 800ms so typing doesn't hammer Supabase, with the same
  // pending-ref + flush-on-leave treatment as usePortfolioSync — the debounce
  // alone means an edit made right before closing the tab can be lost.

  const balanceTimer          = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingBalanceWrites  = useRef<Map<string, number>>(new Map());

  const writeBalancesNow = useCallback(async (uid: string, writes: Map<string, number>) => {
    for (const [id, balance] of writes) {
      const { error } = await supabase
        .from('accounts')
        .update({ balance, balance_updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', uid);
      if (error) return error;
    }
    return null;
  }, []);

  const flushBalances = useCallback(() => {
    if (!userId || pendingBalanceWrites.current.size === 0) return;
    if (balanceTimer.current) clearTimeout(balanceTimer.current);
    const writes = pendingBalanceWrites.current;
    pendingBalanceWrites.current = new Map();
    writeBalancesNow(userId, writes).then(error => {
      if (error) {
        console.warn('[networth-sync] balance save failed:', error.message);
        setSyncError(`Balance failed to save: ${error.message}`);
      } else {
        setSyncError(null);
      }
    });
  }, [userId, writeBalancesNow]);

  const updateAccountBalance = useCallback(async (id: string, balance: number) => {
    const now = new Date().toISOString();
    setAccounts(prev =>
      prev?.map(a => (a.id === id ? { ...a, balance, balanceUpdatedAt: now } : a)) ?? prev
    );

    if (!userId) return; // anonymous — in-memory only

    pendingBalanceWrites.current.set(id, balance);
    if (balanceTimer.current) clearTimeout(balanceTimer.current);
    balanceTimer.current = setTimeout(flushBalances, 800);
  }, [userId, flushBalances]);

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'hidden') flushBalances();
    }

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', flushBalances);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', flushBalances);
    };
  }, [flushBalances]);

  // ── Write: add / remove / reorder (immediate, not debounced) ──────────────

  const addAccount = useCallback(async (kind: AccountKind, label: string, balance = 0, creditCard?: CreditCardFields, crypto?: CryptoFields) => {
    const sortOrder = (accounts ?? []).reduce((max, a) => Math.max(max, a.sortOrder), 0) + 1;

    if (!userId) {
      setAccounts(prev => [
        ...(prev ?? []),
        {
          id: `local-${Date.now()}`,
          kind, label, balance,
          balanceUpdatedAt: new Date().toISOString(),
          linked: false,
          sortOrder,
          apr:              creditCard?.apr ?? null,
          dueDate:          creditCard?.dueDate ?? null,
          minPayment:       creditCard?.minPayment ?? null,
          statementBalance: creditCard?.statementBalance ?? null,
          cryptoSymbol:     crypto?.symbol ?? null,
          cryptoQuantity:   crypto?.quantity ?? null,
        },
      ]);
      return;
    }

    const { data, error } = await supabase
      .from('accounts')
      .insert({
        user_id:            userId,
        kind,
        label,
        balance,
        balance_updated_at: new Date().toISOString(),
        linked:             false,
        sort_order:         sortOrder,
        apr:                creditCard?.apr ?? null,
        due_date:           creditCard?.dueDate ?? null,
        min_payment:        creditCard?.minPayment ?? null,
        statement_balance:  creditCard?.statementBalance ?? null,
        crypto_symbol:      crypto?.symbol ?? null,
        crypto_quantity:    crypto?.quantity ?? null,
      })
      .select()
      .single();

    if (error) {
      console.warn('[networth-sync] account add failed:', error.message);
      setSyncError(`Account failed to save: ${error.message}`);
    } else if (data) {
      setAccounts(prev => [...(prev ?? []), mapRow(data as AccountRow)]);
      setSyncError(null);
    }
  }, [userId, accounts]);

  // ── Write: credit-card field edits ────────────────────────────────────────
  // Immediate (not debounced) — commits arrive on blur/Enter, one discrete
  // event per edit, so the keystroke-debounce machinery above isn't needed.
  // The balance debounce path stays balance-only; credit-card balance edits
  // route here instead so a single update carries balance_updated_at too.

  const updateCreditCard = useCallback(async (id: string, fields: Partial<{
    balance: number;
    apr: number | null;
    dueDate: string | null;
    minPayment: number | null;
    statementBalance: number | null;
  }>) => {
    const now = new Date().toISOString();

    setAccounts(prev =>
      prev?.map(a => a.id === id
        ? {
            ...a,
            ...('balance' in fields ? { balance: fields.balance ?? null, balanceUpdatedAt: now } : {}),
            ...('apr' in fields ? { apr: fields.apr ?? null } : {}),
            ...('dueDate' in fields ? { dueDate: fields.dueDate ?? null } : {}),
            ...('minPayment' in fields ? { minPayment: fields.minPayment ?? null } : {}),
            ...('statementBalance' in fields ? { statementBalance: fields.statementBalance ?? null } : {}),
          }
        : a
      ) ?? prev
    );

    if (!userId) return; // anonymous — in-memory only

    const patch: Record<string, unknown> = {};
    if ('balance' in fields) {
      patch.balance = fields.balance;
      patch.balance_updated_at = now;
    }
    if ('apr' in fields)              patch.apr = fields.apr;
    if ('dueDate' in fields)          patch.due_date = fields.dueDate;
    if ('minPayment' in fields)       patch.min_payment = fields.minPayment;
    if ('statementBalance' in fields) patch.statement_balance = fields.statementBalance;
    if (Object.keys(patch).length === 0) return;

    const { error } = await supabase
      .from('accounts')
      .update(patch)
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.warn('[networth-sync] credit card save failed:', error.message);
      setSyncError(`Card details failed to save: ${error.message}`);
    } else {
      setSyncError(null);
    }
  }, [userId]);

  // ── Write: crypto holding edits ───────────────────────────────────────────
  // Immediate (not debounced), like updateCreditCard — a symbol/quantity change
  // is a discrete commit (blur/Enter), not continuous typing. Reuses the
  // balance_updated_at timestamp semantics; no new timestamp column needed.
  const updateCryptoHolding = useCallback(async (id: string, symbol: string, quantity: number) => {
    const now = new Date().toISOString();
    const cleanSymbol = symbol.trim().toUpperCase();

    setAccounts(prev =>
      prev?.map(a => a.id === id
        ? { ...a, cryptoSymbol: cleanSymbol, cryptoQuantity: quantity, balanceUpdatedAt: now }
        : a
      ) ?? prev
    );

    if (!userId) return; // anonymous — in-memory only

    const { error } = await supabase
      .from('accounts')
      .update({ crypto_symbol: cleanSymbol, crypto_quantity: quantity, balance_updated_at: now })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.warn('[networth-sync] crypto holding save failed:', error.message);
      setSyncError(`Crypto holding failed to save: ${error.message}`);
    } else {
      setSyncError(null);
    }
  }, [userId]);

  const removeAccount = useCallback(async (id: string) => {
    // The linked Portfolio row is permanent — never deletable
    const target = accounts?.find(a => a.id === id);
    if (!target || target.kind === 'holdings_link') return;

    setAccounts(prev => prev?.filter(a => a.id !== id) ?? prev);
    pendingBalanceWrites.current.delete(id);

    if (!userId) return;

    const { error } = await supabase
      .from('accounts')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.warn('[networth-sync] account remove failed:', error.message);
      setSyncError(`Account failed to remove: ${error.message}`);
    } else {
      setSyncError(null);
    }
  }, [userId, accounts]);

  const reorderAccounts = useCallback(async (orderedIds: string[]) => {
    setAccounts(prev => {
      if (!prev) return prev;
      const byId = new Map(prev.map(a => [a.id, a]));
      const reordered = orderedIds
        .map((id, i) => {
          const a = byId.get(id);
          return a ? { ...a, sortOrder: i } : null;
        })
        .filter((a): a is NetWorthAccount => a !== null);
      // Keep any accounts not mentioned in orderedIds at the end
      const leftover = prev.filter(a => !orderedIds.includes(a.id));
      return [...reordered, ...leftover];
    });

    if (!userId) return;

    const results = await Promise.all(
      orderedIds.map((id, i) =>
        supabase.from('accounts').update({ sort_order: i }).eq('id', id).eq('user_id', userId)
      )
    );
    const failed = results.find(r => r.error);
    if (failed?.error) {
      console.warn('[networth-sync] reorder failed:', failed.error.message);
      setSyncError(`Account order failed to save: ${failed.error.message}`);
    } else {
      setSyncError(null);
    }
  }, [userId]);

  return {
    accounts,
    loading,
    isAuthenticated: !!userId,
    syncError,
    addAccount,
    updateAccountBalance,
    updateCreditCard,
    updateCryptoHolding,
    removeAccount,
    reorderAccounts,
  };
}