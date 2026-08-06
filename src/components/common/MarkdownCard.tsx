import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Shared AI-output Markdown renderer. Kept byte-for-byte in sync with the local
// MarkdownCard copies in PortfolioTab.tsx and NetWorthTab.tsx (both non-exported
// there). Overrides: h2 suppressed, h3 → uppercase mono label, styled p/strong/
// ul/li/table/hr/code. Used by RetirementTab. If either legacy copy is
// restyled, update this too.

export function MarkdownCard({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h2: () => null, // suppress top-level ## headings (card header already labels it)
        h3: ({ children }) => (
          <div style={{
            fontSize: 10,
            fontFamily: 'Space Mono, monospace',
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--text-secondary)',
            marginTop: 14,
            marginBottom: 6,
            paddingTop: 10,
            borderTop: '1px solid var(--border)',
          }}>{children}</div>
        ),
        p: ({ children }) => (
          <p style={{ margin: '0 0 8px 0', fontSize: 13, lineHeight: 1.7, color: 'var(--text-body)' }}>{children}</p>
        ),
        strong: ({ children }) => (
          <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{children}</strong>
        ),
        ul: ({ children }) => (
          <ul style={{ margin: '0 0 8px 0', paddingLeft: 0, listStyle: 'none' }}>{children}</ul>
        ),
        li: ({ children }) => (
          <li style={{ fontSize: 13, color: 'var(--text-body)', lineHeight: 1.65, marginBottom: 4, paddingLeft: 12, position: 'relative' }}>
            <span style={{ position: 'absolute', left: 0, color: 'var(--text-secondary)' }}>—</span>
            {children}
          </li>
        ),
        table: ({ children }) => (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 8 }}>{children}</table>
        ),
        thead: ({ children }) => <thead>{children}</thead>,
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr: ({ children }) => (
          <tr style={{ borderBottom: '1px solid var(--border)' }}>{children}</tr>
        ),
        th: ({ children }) => (
          <th style={{ textAlign: 'left', padding: '4px 8px 4px 0', fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'Space Mono, monospace', fontWeight: 400, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{children}</th>
        ),
        td: ({ children }) => (
          <td style={{ padding: '5px 8px 5px 0', fontSize: 12, color: 'var(--text-body)', fontFamily: 'Space Mono, monospace' }}>{children}</td>
        ),
        hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '10px 0' }} />,
        code: ({ children }) => (
          <code style={{ fontFamily: 'Space Mono, monospace', fontSize: 11, color: 'var(--text-primary)', background: 'var(--bg-elevated)', padding: '1px 4px', borderRadius: 3 }}>{children}</code>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
