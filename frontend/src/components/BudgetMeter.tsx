import { money } from './ui';

interface Props {
  spent: number;
  cap: number;
  escalationPct: number;
  pending?: number;
  height?: number;
}

export function BudgetMeter({ spent, cap, escalationPct, pending = 0, height = 54 }: Props) {
  const pct = (value: number) => (cap > 0 ? Math.min(100, (value / cap) * 100) : 0);
  const spentPct = pct(spent);
  const projectedPct = pct(spent + pending);

  return (
    <div>
      <div
        style={{
          position: 'relative',
          height,
          background: 'var(--panel-sunken)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-sm)',
          overflow: 'hidden',
        }}
      >
        <div
          className="fill"
          style={{
            position: 'absolute',
            inset: 0,
            width: `${spentPct}%`,
            background: pending ? 'var(--ink-2)' : 'var(--ok)',
          }}
        />
        {pending > 0 && (
          <div
            className="fill"
            style={{
              animationDelay: '180ms',
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${spentPct}%`,
              width: `${Math.max(0, projectedPct - spentPct)}%`,
              background: 'repeating-linear-gradient(135deg, var(--stamp) 0 6px, #5c3ea3 6px 12px)',
            }}
          />
        )}
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${escalationPct}%`,
            borderLeft: '1px dashed var(--caution)',
          }}
        />
        <div
          className="mono"
          style={{
            position: 'absolute',
            top: 6,
            left: `calc(${escalationPct}% + 9px)`,
            fontSize: 9,
            letterSpacing: '0.14em',
            color: 'var(--caution)',
          }}
        >
          ESC {escalationPct}%
        </div>
      </div>
      <div
        className="mono"
        style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, fontSize: 9, color: 'var(--ink-ghost)' }}
      >
        <span>0</span>
        <span>{money(cap / 4)}</span>
        <span>{money(cap / 2)}</span>
        <span>{money((cap * 3) / 4)}</span>
        <span>{money(cap)}</span>
      </div>
    </div>
  );
}
