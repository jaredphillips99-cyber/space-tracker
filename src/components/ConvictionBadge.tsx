import type { ConvictionRating } from '../hooks/useAnalysis';
import { CONVICTION_COLORS, CONVICTION_LABELS } from '../hooks/useAnalysis';

interface ConvictionBadgeProps {
  rating: ConvictionRating;
  rationale?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function ConvictionBadge({
  rating,
  rationale,
  size = 'md',
}: ConvictionBadgeProps) {
  const color = CONVICTION_COLORS[rating];
  const label = CONVICTION_LABELS[rating];

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm',
    lg: 'px-4 py-2 text-base',
  };

  return (
    <div className="flex flex-col gap-1">
      <div
        className={`${sizeClasses[size]} rounded inline-flex items-center gap-1.5`}
        style={{
          backgroundColor: `${color}18`,
          color: color,
          border: `1px solid ${color}66`,
          fontFamily: 'Space Mono, monospace',
          fontWeight: 600,
        }}
      >
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: color,
            display: 'inline-block',
          }}
        />
        {label}
      </div>
      {rationale && (
        <p
          style={{
            fontSize: '11px',
            color: '#8b93a8',
            fontFamily: 'DM Sans, sans-serif',
            margin: 0,
            lineHeight: 1.4,
          }}
        >
          {rationale}
        </p>
      )}
    </div>
  );
}
