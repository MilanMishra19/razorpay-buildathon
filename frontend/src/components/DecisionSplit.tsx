import type { CartItem, CartMandate, PolicyCheck } from '../api/types';
import { Icon, money } from './ui';
import { Stamp } from './Stamp';

const MARK: Record<string, { glyph: string; color: string }> = {
  PASS: { glyph: '✓', color: 'var(--ok)' },
  ESCALATE: { glyph: '§', color: 'var(--stamp)' },
  FAIL: { glyph: '✕', color: 'var(--bad)' },
};

/**
 * The whole argument of the product in one component. The agent's side is drawn in pencil and
 * dashed, because a proposal can be rubbed out. The policy's side is ruled and stamped, because its
 * mark is the record. You should be able to tell them apart with the text blurred.
 */
export function DecisionSplit({ cart, name }: { cart: CartMandate; name: (id: number) => string }) {
  const swap = cart.cart_items.find((item) => item.substitutes_for != null);
  const checks = cart.policy_decision?.checks ?? [];

  return (
    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'stretch' }}>
      <Side title="WRITTEN BY THE AGENT" tone="var(--pencil)" hand="pencil" delay={0}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {cart.cart_items.map((item, index) => (
            <ProposedLine key={index} item={item} name={name} />
          ))}
        </div>
        {swap && (
          <p style={{ margin: '14px 0 0', fontSize: 12, lineHeight: 1.6, color: 'var(--ink-dim)' }}>
            <strong style={{ color: 'var(--ink-2)', fontWeight: 600 }}>Why: </strong>
            {name(swap.substitutes_for!)} was unavailable
            {swap.rationale ? `. ${swap.rationale}` : '.'}
          </p>
        )}
        <span className="mono" style={{ display: 'block', marginTop: 16, fontSize: 10, color: 'var(--pencil)' }}>
          PROPOSAL ONLY · NO SPENDING AUTHORITY
        </span>
      </Side>

      <Side title="DECIDED BY POLICY" tone="var(--stamp)" hand="ink" delay={80}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {checks.map((check, index) => (
            <CheckRow key={check.name} check={check} delay={90 + index * 70} />
          ))}
          {!cart.policy_decision && (
            <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
              This cart predates decision recording.
            </span>
          )}
        </div>
        <div
          style={{
            marginTop: 18,
            paddingTop: 16,
            borderTop: '1px solid var(--line)',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <Stamp
            status={cart.status}
            checks={checks.length}
            reference={cart.id}
            delay={150 + checks.length * 70}
          />
          <span
            className="wide"
            style={{ marginLeft: 'auto', fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}
          >
            {money(cart.total_amount)}
          </span>
        </div>
      </Side>
    </div>
  );
}

function Side({
  title,
  tone,
  hand,
  delay,
  children,
}: {
  title: string;
  tone: string;
  hand: 'pencil' | 'ink';
  delay: number;
  children: React.ReactNode;
}) {
  const provisional = hand === 'pencil';
  return (
    <section
      className="rise"
      style={{
        animationDelay: `${delay}ms`,
        flex: '1 1 300px',
        minWidth: 280,
        border: provisional ? '1px dashed var(--pencil-line)' : '1px solid var(--line-hot)',
        borderTop: provisional ? '2px dashed var(--pencil-line)' : `2px solid ${tone}`,
        borderRadius: 'var(--radius)',
        background: 'var(--panel)',
        padding: '16px 18px',
      }}
    >
      <span
        className="mono"
        style={{ display: 'block', fontSize: 9, fontWeight: 500, letterSpacing: '0.2em', color: tone, marginBottom: 14 }}
      >
        {title}
      </span>
      {children}
    </section>
  );
}

function ProposedLine({ item, name }: { item: CartItem; name: (id: number) => string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 13 }}>
      {item.substitutes_for != null && (
        <span
          className="mono"
          style={{
            fontSize: 8,
            letterSpacing: '0.1em',
            color: 'var(--pencil)',
            border: '1px dashed var(--pencil-line)',
            borderRadius: 'var(--radius-sm)',
            padding: '2px 6px',
            flexShrink: 0,
          }}
        >
          SWAP
        </span>
      )}
      <span style={{ flexGrow: 1, color: 'var(--ink-2)' }}>{name(item.catalog_id)}</span>
      <span className="mono" style={{ fontSize: 11, color: 'var(--ink-faint)' }}>×{item.quantity}</span>
      <span className="mono" style={{ fontSize: 12 }}>{money(item.unit_price * item.quantity)}</span>
    </div>
  );
}

function CheckRow({ check, delay }: { check: PolicyCheck; delay: number }) {
  const mark = MARK[check.outcome] ?? MARK.PASS;
  const hasNumbers = check.limit != null && check.actual != null;

  return (
    <div
      className="tick"
      style={{ animationDelay: `${delay}ms`, display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 12.5 }}
    >
      <span className="mono" style={{ color: mark.color, width: 12, flexShrink: 0 }}>{mark.glyph}</span>
      <span style={{ color: 'var(--ink-2)', width: 132, flexShrink: 0 }}>{check.name}</span>
      <span style={{ flexGrow: 1, color: 'var(--ink-faint)', fontSize: 11.5, lineHeight: 1.45 }}>
        {check.detail}
      </span>
      {hasNumbers && (
        <span className="mono" style={{ fontSize: 11, color: mark.color, flexShrink: 0 }}>
          {money(check.actual!)} / {money(check.limit!)}
        </span>
      )}
    </div>
  );
}

/**
 * The rejection, spelled out. A number the user cannot recompute is a number they have to trust.
 */
export function BlockedExplainer({ cart }: { cart: CartMandate }) {
  const failed = (cart.policy_decision?.checks ?? []).find((check) => check.outcome === 'FAIL');
  if (!failed) return null;

  const excess = failed.limit != null && failed.actual != null ? failed.actual - failed.limit : null;

  return (
    <div
      style={{
        border: '1px solid var(--bad-line)',
        background: 'var(--bad-bg)',
        borderRadius: 'var(--radius)',
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {Icon.warn('var(--bad)', 16)}
        <span className="mono" style={{ fontSize: 11, letterSpacing: '0.14em', color: 'var(--bad)' }}>
          TRANSACTION BLOCKED · {failed.name.toUpperCase()}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
        {failed.limit != null && <Figure label="Allowed" value={money(failed.limit)} />}
        {failed.actual != null && <Figure label="Proposed" value={money(failed.actual)} />}
        {excess != null && excess > 0 && <Figure label="Excess" value={money(excess)} tone="var(--bad)" />}
      </div>
      <span style={{ fontSize: 12, color: 'var(--ink-dim)', lineHeight: 1.55 }}>{failed.detail}</span>
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="label">{label}</span>
      <span className="wide" style={{ fontSize: 19, fontWeight: 700, color: tone ?? 'var(--ink)' }}>{value}</span>
    </div>
  );
}
