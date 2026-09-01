import { useState } from 'react';
import { api, post } from '../api/client';
import { useResource } from '../api/useResource';
import { useSession } from '../auth/AuthContext';
import type { MerchantMetrics } from '../api/types';
import { Icon, Notice, Panel, money } from '../components/ui';

export function Merchant() {
  const session = useSession();
  const metrics = useResource<MerchantMetrics>((token) => api.checkout('/merchant/metrics', token), [], 8000);
  const demo = useResource<{ enabled: boolean }>((token) => api.checkout('/demo/status', token), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const m = metrics.data;
  const seeded = (m?.demo_rows ?? 0) > 0;

  async function history(action: 'seed-history' | 'clear-history') {
    setBusy(true);
    setError(null);
    try {
      await api.checkout(`/demo/${action}`, session.token, post({}));
      metrics.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="label">What the AI channel is worth</span>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Merchant analytics</h1>
        </div>
        {demo.data?.enabled && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => history('seed-history')}
              disabled={busy}
              style={pill('var(--ink)', '#fff')}
            >
              LOAD DEMO HISTORY
            </button>
            {seeded && (
              <button
                onClick={() => history('clear-history')}
                disabled={busy}
                style={pill('var(--panel)', 'var(--ink-dim)', 'var(--line-hot)')}
              >
                CLEAR
              </button>
            )}
          </div>
        )}
      </div>

      {error && <Notice tone="bad">{error}</Notice>}

      {seeded && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 11,
            border: '1px dashed var(--line-hot)',
            borderRadius: 'var(--radius)',
            background: 'var(--panel-sunken)',
            padding: '12px 16px',
          }}
        >
          {Icon.warn('var(--ink-faint)', 15)}
          <span style={{ fontSize: 12, color: 'var(--ink-dim)', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--ink-2)', fontWeight: 600 }}>Includes demo data.</strong>{' '}
            {m?.demo_rows} of {m?.ai_orders} orders below are seeded history belonging to a synthetic
            buyer, so this page has a shape to show. Live activity is counted the same way and is not
            separated out. Nothing seeded appears in your carts, approvals or audit chain.
          </span>
        </div>
      )}

      {!m ? (
        <Panel>
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-faint)' }}>Loading…</div>
        </Panel>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <Headline label="AI GMV" value={money(m.ai_gmv)} note="paid through the agent" tone="var(--ok)" />
            <Headline label="AI orders" value={String(m.ai_orders)} note="carts proposed" />
            <Headline label="Completed" value={String(m.successful_purchases)} note="proposals that became sales" />
            <Headline
              label="Revenue recovered"
              value={money(m.recovered_revenue)}
              note={`${m.recovered_orders} sale${m.recovered_orders === 1 ? '' : 's'} saved by a substitution`}
              tone="var(--brand)"
            />
          </div>

          <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <Panel title="WHAT POLICY DID" style={{ flex: '1 1 380px', minWidth: 340 }}>
              <div style={{ padding: '6px 0' }}>
                <Row label="Spend blocked by policy" value={money(m.rejected_spend)} tone="var(--bad)" />
                <Row label="Carts refused" value={String(m.policy_blocks)} />
                <Row label="Escalated and approved by a human" value={String(m.human_approvals)} />
                <Row label="Duplicate payments prevented" value={String(m.duplicates_prevented)} />
                <Row label="Failed payments" value={String(m.failed_payments)} />
              </div>
            </Panel>

            <Panel title="WHAT THE AGENT DID" style={{ flex: '1 1 380px', minWidth: 340 }}>
              <div style={{ padding: '6px 0' }}>
                <Row label="Shopping cycles run" value={String(m.agent_cycles)} />
                <Row label="Carts containing a substitution" value={String(m.substitutions)} />
                <Row label="Average order value" value={money(m.average_order_value)} />
                <Row
                  label="Conversion"
                  value={m.ai_orders ? `${((m.successful_purchases / m.ai_orders) * 100).toFixed(0)}%` : '—'}
                />
              </div>
            </Panel>
          </div>

          <Panel tone="ok" style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              {Icon.shield('var(--ok)', 18)}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>Safety and revenue are not opposed</span>
                <span style={{ fontSize: 12.5, lineHeight: 1.65, color: 'var(--ink-dim)' }}>
                  {money(m.rejected_spend)} of proposed spend was refused before it reached Razorpay, and{' '}
                  {money(m.recovered_revenue)} of sales that would have been lost to an empty shelf were
                  recovered through a substitution the buyer approved. A merchant can accept more
                  autonomous purchases precisely because the boundary holds.
                </span>
              </div>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

function Headline({ label, value, note, tone }: { label: string; value: string; note: string; tone?: string }) {
  return (
    <div
      style={{
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius)',
        background: 'var(--panel)',
        boxShadow: 'var(--lift)',
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <span className="label">{label}</span>
      <span style={{ fontFamily: 'var(--display)', fontSize: 30, fontWeight: 800, letterSpacing: '-0.035em', color: tone ?? 'var(--ink)' }}>
        {value}
      </span>
      <span style={{ fontSize: 11.5, color: 'var(--ink-faint)' }}>{note}</span>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '11px 20px',
        borderBottom: '1px solid var(--line-soft)',
        fontSize: 13,
      }}
    >
      <span style={{ color: 'var(--ink-dim)' }}>{label}</span>
      <span className="mono" style={{ color: tone ?? 'var(--ink)' }}>{value}</span>
    </div>
  );
}

function pill(background: string, color: string, border?: string): React.CSSProperties {
  return {
    height: 36,
    padding: '0 16px',
    borderRadius: 'var(--radius-pill)',
    background,
    color,
    border: `1px solid ${border ?? background}`,
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: '0.1em',
    fontFamily: 'var(--mono)',
  };
}
