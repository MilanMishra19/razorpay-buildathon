import type { CartStatus } from '../api/types';

const MARKS: Record<CartStatus, { word: string; ink: string; tint: string }> = {
  approved: { word: 'CLEARED', ink: 'var(--ok)', tint: 'var(--ok-bg)' },
  pending_approval: { word: 'REFERRED', ink: 'var(--stamp)', tint: 'var(--stamp-soft)' },
  rejected: { word: 'REFUSED', ink: 'var(--bad)', tint: 'var(--bad-bg)' },
  pending: { word: 'OPEN', ink: 'var(--ink-faint)', tint: 'var(--panel-sunken)' },
};

/**
 * The mark the policy engine leaves on a docket. It is the one loud thing in the interface, and it
 * earns that by being the moment the system actually exercises authority — everything before it is
 * a proposal, everything after it is a consequence.
 */
export function Stamp({
  status,
  checks,
  reference,
  delay = 0,
}: {
  status: CartStatus;
  checks: number;
  reference: number;
  delay?: number;
}) {
  const mark = MARKS[status] ?? MARKS.pending;

  return (
    <div
      className="stamp"
      role="img"
      aria-label={`Policy verdict: ${mark.word}, ${checks} checks, cart ${reference}`}
      style={{
        animationDelay: `${delay}ms`,
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
        padding: '7px 14px 6px',
        border: `2px solid ${mark.ink}`,
        outline: `1px solid ${mark.ink}`,
        outlineOffset: 2,
        background: mark.tint,
        color: mark.ink,
        transform: 'rotate(-1.6deg)',
        flexShrink: 0,
      }}
    >
      <span
        className="wide"
        style={{
          fontSize: 15,
          fontWeight: 800,
          letterSpacing: '0.22em',
          lineHeight: 1,
          paddingLeft: '0.22em',
          display: 'flex',
          alignItems: 'center',
          gap: 7,
        }}
      >
        <Tick ink={mark.ink} />
        {mark.word}
        <Tick ink={mark.ink} />
      </span>
      <span
        className="mono"
        style={{ fontSize: 8.5, letterSpacing: '0.1em', opacity: 0.82, lineHeight: 1 }}
      >
        {checks} CHECKS · CART {reference}
      </span>
    </div>
  );
}

function Tick({ ink }: { ink: string }) {
  return (
    <span
      aria-hidden
      style={{ width: 5, height: 5, border: `1px solid ${ink}`, opacity: 0.55, flexShrink: 0 }}
    />
  );
}
