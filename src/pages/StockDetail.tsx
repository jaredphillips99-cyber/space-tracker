import { useParams, Link } from 'react-router-dom';
import { useLivePrice } from '../hooks/useLivePrice';
import { StockCard } from '../components/StockCard';

export function StockDetail() {
  useLivePrice();

  const { ticker } = useParams<{ ticker: string }>();

  if (!ticker) {
    return (
      <div className="p-8 text-center" style={{ color: '#4a4e63' }}>
        No ticker specified.
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      {/* Back nav */}
      <div
        className="sticky top-0 px-6 py-2 flex items-center gap-2"
        style={{ backgroundColor: '#08090d', borderBottom: '1px solid #1e2030', zIndex: 10 }}
      >
        <Link
          to="/"
          className="text-xs flex items-center gap-1 no-underline transition-colors"
          style={{ fontFamily: 'Space Mono, monospace', color: '#4a4e63' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = '#8b8fa8'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = '#4a4e63'; }}
        >
          ← DASHBOARD
        </Link>
        <span style={{ color: '#1e2030' }}>/</span>
        <span className="text-xs" style={{ fontFamily: 'Space Mono, monospace', color: '#e2e4ef' }}>
          {ticker.toUpperCase()}
        </span>
      </div>

      <StockCard ticker={ticker.toUpperCase()} />
    </div>
  );
}
