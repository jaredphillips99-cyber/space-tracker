import { useLivePrice } from '../hooks/useLivePrice';
import { PriceTable } from '../components/PriceTable';
import { SidePanel } from '../components/SidePanel';
import { useStore } from '../store/useStore';

export function Dashboard() {
  useLivePrice();

  const pricesLoadingState = useStore((s) => s.pricesLoadingState);

  return (
    <div className="flex h-full" style={{ height: 'calc(100vh - 88px)' }}>
      {/* ── Main table area ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Sub-header */}
        <div
          className="flex items-center justify-between px-6 py-3 shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div>
            <h1
              className="text-lg font-bold"
              style={{ fontFamily: 'Space Mono, monospace', color: 'var(--text-primary)', margin: 0 }}
            >
              Watchlist
            </h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)', fontFamily: 'DM Sans, sans-serif' }}>
              Space economy, AI infrastructure, defense & clean energy
            </p>
          </div>
          {pricesLoadingState === 'error' && (
            <span
              className="text-xs px-2 py-1 rounded"
              style={{
                fontFamily: 'Space Mono, monospace',
                backgroundColor: '#ef444418',
                color: '#ef4444',
              }}
            >
              Price fetch failed — showing cached data
            </span>
          )}
        </div>

        {/* Scrollable table */}
        <div className="flex-1 overflow-auto">
          <PriceTable />
        </div>
      </div>

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <div className="w-64 shrink-0 overflow-hidden">
        <SidePanel />
      </div>
    </div>
  );
}
