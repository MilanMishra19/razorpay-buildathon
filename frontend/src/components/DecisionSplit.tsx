import type { CartItem, CartMandate, PolicyCheck } from '../api/types';
import { Icon, money } from './ui';

const MARK: Record<string, { glyph: string; color: string }> = {
  PASS: { glyph: '✓', color: 'var(--ok)' },
  ESCALATE: { glyph: '⚠', color: 'var(--brand)' },
  FAIL: { glyph: '✕', color: 'var(--bad)' },
};

const VERDICT: Record<string, { label: string; color: string }> = {
  approved: { label: 'APPROVED', color: 'var(--ok)' },
  pending_approval: { label: 'PENDING APPROVAL', color: 'var(--brand)' },
  rejected: { label: 'REJECTED', color: 'var(--bad)' },
  pending: { label: 'PENDING', color: 'var(--ink-dim)' },
};

/**
 * The whole argument of the product in one component: what the model chose on the left, what the
 * deterministic engine allowed on the right, and an arrow between them that only points one way.
 */
export function DecisionSplit({ cart, name }: { cart: CartMandate; name: (id: number) => string }) {
  const swap = cart.cart_items.find((item) => item.substitutes_for != null);
  const verdict = VERDICT[cart.status] ?? VERDICT.pending;

  return (
    <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap', alignItems: 'stretch' }}>
      <Side title="AI DECISION" tone="var(--ink-dim)">
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
        <span className="mono" style={{ display: 'block', marginTop: 16, fontSize: 10, color: 'var(--ink-faint)' }}>
          PROPOSAL ONLY · NO SPENDING AUTHORITY
        </span>
      </Side>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 6px',
          flexShrink: 0,
        }}
      >
        <span
          className="mono"
          style={{
            writingMode: 'horizontal-tb',
            fontSize: 9,
            letterSpacing: '0.14em',
            color: 'var(--ink-ghost)',
            transform: 'rotate(0deg)',
          }}
        >
          →
        </span>
      </div>

      <Side title="POLICY DECISION" tone={verdict.color}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {(cart.policy_decision?.checks ?? []).map((check) => (
            <CheckRow key={check.name} check={check} />
          ))}
          {!cart.policy_decision && (
            <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
              This cart predates decision recording.
            </span>
          )}
        </div>
        <div
          style={{
            marginTop: 16,
            paddingTop: 14,
            borderTop: '1px solid var(--line)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span className="mono" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', color: verdict.color }}>
            {verdict.label}
          </span>
          <span className="mono" style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--ink-2)' }}>
            {money(cart.total_amount)}
          </span>
        </div>
      </Side>
    </div>
  );
}

function Side({ title, tone, children }: { title: string; tone: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        flex: '1 1 300px',
        minWidth: 280,
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius)',
        background: 'var(--panel)',
        padding: '16px 18px',
      }}
    >
      <span className="mono" style={{ display: 'block', fontSize: 9, letterSpacing: '0.2em', color: tone, marginBottom: 14 }}>
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
            color: 'var(--brand)',
            border: '1px solid var(--brand-line)',
            borderRadius: 'var(--radius-pill)',
            padding: '2px 7px',
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

function CheckRow({ check }: { check: PolicyCheck }) {
  const mark = MARK[check.outcome] ?? MARK.PASS;
  const hasNumbers = check.limit != null && check.actual != null;

  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 12.5 }}>
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
      <span className="mono" style={{ fontSize: 17, color: tone ?? 'var(--ink)' }}>{value}</span>
    </div>
  );
}
