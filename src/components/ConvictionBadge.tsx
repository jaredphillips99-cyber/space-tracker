import type { ConvictionRating } from '../hooks/useAnalysis';
import { CONVICTION_LABELS, CONVICTION_COLORS } from '../hooks/useAnalysis';

interface Props {
  rating:     ConvictionRating;
  rationale?: string;
  size?:      'sm' | 'md' | 'lg';
}

export function ConvictionBadge({ rating, rationale, size = 'md' }: Props) {
  const color = CONVICTION_COLORS[rating];
  const label = CONVICTION_LABELS[rating];

  const sizeClass: Record<string, string> = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-3 py-1',
    lg: 'text-base px-4 py-1.5',
  };

  return (
    <div className="flex flex-col gap-1">
      <span
        className={`inline-flex items-center gap-1.5 rounded font-mono font-semibold uppercase tracking-wider ${sizeClass[size]}`}
        style={{
          color,
          background: `${color}18`,
          border:     `1px solid ${color}40`,
        }}
      >
        <span
          className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: color }}
        />
        {label}
      </span>
      {rationale && (
        <p className="text-xs leading-snug max-w-xs" style={{ color: '#8b93a8' }}>
          {rationale}
        </p>
      )}
    </div>
  );
}