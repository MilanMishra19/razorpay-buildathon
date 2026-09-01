import { useState, type FormEvent } from 'react';
import { api, ApiError, post } from '../api/client';
import { useResource } from '../api/useResource';
import { useSession } from '../auth/AuthContext';
import type { AgentRunResult, AuditEntry, ChainVerification, Mandate, RestockEntry } from '../api/types';
import { BudgetMeter } from '../components/BudgetMeter';
import { Button, Chip, Empty, Icon, Notice, Panel, clockTime, daysUntil, eventColor, money } from '../components/ui';

async function loadActive(token: string): Promise<Mandate | null> {
  try {
    return await api.checkout<Mandate>('/intent-mandates/active', token);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export function MandateOverview() {
  const session = useSession();
  const mandate = useResource<Mandate | null>(loadActive, []);
  const audit = useResource<AuditEntry[]>((token) => api.checkout('/audit-log', token), []);
  const chain = useResource<ChainVerification>((token) => api.checkout('/audit-log/verify', token), []);
  const restock = useResource<RestockEntry[]>((token) => api.checkout('/restock-list', token), []);
  const demo = useResource<{ enabled: boolean }>((token) => api.checkout('/demo/status', token), []);

  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<AgentRunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  function refreshAll() {
    mandate.reload();
    audit.reload();
    chain.reload();
    restock.reload();
  }

  async function runAgent() {
    setRunning(true);
    setRunError(null);
    setRunResult(null);
    try {
      const result = await api.agent<AgentRunResult>('/agent/run', post({ user_id: session.userId }));
      setRunResult(result);
      refreshAll();
    } catch (error) {
      setRunError((error as Error).message);
    } finally {
      setRunning(false);
    }
  }

  async function revoke(id: number) {
    await api.checkout(`/intent-mandates/${id}/revoke`, session.token, post({}));
    refreshAll();
  }

  if (mandate.loading) return <Empty>Loading mandate…</Empty>;
  if (mandate.error) return <Notice tone="bad">{mandate.error}</Notice>;
  if (!mandate.data) return <IssueMandate onIssued={refreshAll} />;

  const m = mandate.data;
  const events = audit.data ?? [];

  return (
    <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start' }}>
      <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 22, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span className="label">Intent Mandate</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <h1 style={{ margin: 0, fontSize: 30, fontWeight: 700, textTransform: 'capitalize' }}>{m.category}</h1>
              <span className="mono" style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
                #{m.id}
              </span>
              <Chip color="var(--ok)">{m.status}</Chip>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {demo.data?.enabled && (
              <Button
                variant="ghost"
                onClick={async () => {
                  await api.checkout('/demo/reset', session.token, post({}));
                  refreshAll();
                  setRunResult(null);
                }}
              >
                RESET DEMO
              </Button>
            )}
            <Button variant="ghost" onClick={() => revoke(m.id)}>
              REVOKE
            </Button>
            <Button variant="primary" onClick={runAgent} disabled={running}>
              {Icon.play('var(--bg)')}
              {running ? 'RUNNING…' : 'RUN AGENT'}
            </Button>
          </div>
        </div>

        {runError && <Notice tone="bad">Agent: {runError}</Notice>}
        {runResult && <RunSummary result={runResult} />}

        <Panel style={{ padding: '26px 28px 22px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span className="mono" style={{ fontSize: 40, color: 'var(--amber)', letterSpacing: '-0.02em' }}>
                {money(m.spent_this_period)}
              </span>
              <span className="mono" style={{ fontSize: 16, color: 'var(--ink-faint)' }}>
                / {money(m.monthly_cap)}
              </span>
            </div>
            <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span className="mono" style={{ fontSize: 20 }}>
                {((m.spent_this_period / m.monthly_cap) * 100).toFixed(1)}%
              </span>
              <span className="label">Drawn this period</span>
            </div>
          </div>

          <BudgetMeter
            spent={m.spent_this_period}
            cap={m.monthly_cap}
            escalationPct={m.escalation_threshold_pct}
          />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 1,
              background: 'var(--line)',
              border: '1px solid var(--line)',
            }}
          >
            <Stat label="Per-order cap" value={money(m.per_order_cap)} />
            <Stat label="Remaining" value={money(m.remaining_monthly_budget)} tone="var(--ok)" />
            <Stat label="Mandate expires" value={`${daysUntil(m.expires_at)}d`} note={new Date(m.expires_at).toLocaleDateString('en-GB')} />
          </div>
        </Panel>

        <Panel title="RECENT ACTIVITY">
          {events.length === 0 ? (
            <Empty>Nothing has happened yet.</Empty>
          ) : (
            [...events].reverse().slice(0, 5).map((entry, index) => (
              <div
                key={`${entry.timestamp}-${index}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '13px 20px',
                  borderBottom: '1px solid var(--line-soft)',
                }}
              >
                <span style={{ width: 3, height: 26, background: eventColor(entry.event), flexShrink: 0 }} />
                <span
                  className="mono"
                  style={{ fontSize: 10, letterSpacing: '0.1em', color: eventColor(entry.event), width: 130, textTransform: 'uppercase' }}
                >
                  {entry.event.replace(/_/g, ' ')}
                </span>
                <span style={{ flexGrow: 1, fontSize: 13, color: 'var(--ink-2)' }}>{entry.summary}</span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--ink-ghost)' }}>
                  {clockTime(entry.timestamp)}
                </span>
              </div>
            ))
          )}
        </Panel>
      </div>

      <div style={{ width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 22 }}>
        <Panel title="RESTOCK QUEUE">
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(restock.data ?? []).length === 0 ? (
              <span style={{ fontSize: 13, color: 'var(--ink-faint)' }}>
                Nothing queued. Mark items as low in the catalog.
              </span>
            ) : (
              (restock.data ?? []).map((entry) => (
                <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--ink-2)' }}>
                  <span style={{ width: 5, height: 5, background: 'var(--amber)', flexShrink: 0 }} />
                  {entry.catalog_name ?? `#${entry.catalog_id}`}
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel
          tone={chain.data?.is_valid === false ? 'bad' : 'ok'}
          title="AUDIT CHAIN"
          actions={
            <span
              className="mono"
              style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 10, letterSpacing: '0.12em', color: chain.data?.is_valid === false ? 'var(--bad)' : 'var(--ok)' }}
            >
              {chain.data?.is_valid === false ? Icon.cross('var(--bad)', 12) : Icon.check('var(--ok)', 12)}
              {chain.data?.is_valid === false ? 'BROKEN' : 'VERIFIED'}
            </span>
          }
        >
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              {events.slice(0, 14).map((_, index) => (
                <span key={index} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 12, height: 12, background: chain.data?.is_valid === false ? 'var(--bad)' : 'var(--ok)' }} />
                  {index < Math.min(events.length, 14) - 1 && <span style={{ width: 10, height: 1, background: 'var(--ok-line)' }} />}
                </span>
              ))}
            </div>
            <span className="mono" style={{ fontSize: 10, color: 'var(--ink-faint)' }}>
              {events.length} events
            </span>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Stat({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: string }) {
  return (
    <div style={{ background: 'var(--panel-sunken)', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 7 }}>
      <span className="label">{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span className="mono" style={{ fontSize: 21, color: tone ?? 'var(--ink)' }}>
          {value}
        </span>
        {note && (
          <span className="mono" style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
            {note}
          </span>
        )}
      </div>
    </div>
  );
}

function RunSummary({ result }: { result: AgentRunResult }) {
  const tone = result.outcome === 'approved' ? 'ok' : result.outcome === 'rejected' ? 'bad' : 'warn';
  const color = tone === 'ok' ? 'var(--ok)' : tone === 'bad' ? 'var(--bad)' : 'var(--amber)';
  return (
    <Panel tone={tone} style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
        <span className="mono" style={{ fontSize: 11, letterSpacing: '0.14em', color, textTransform: 'uppercase' }}>
          CYCLE {result.outcome.replace(/_/g, ' ')}
        </span>
        {result.reason && <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{result.reason}</span>}
        <span className="mono" style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
          {result.proposed_cart.length} items · {result.flagged_catalog_ids.length} flagged
          {result.payment_status ? ` · ${result.payment_status}` : ''}
        </span>
      </div>
    </Panel>
  );
}

function IssueMandate({ onIssued }: { onIssued: () => void }) {
  const session = useSession();
  const [perOrder, setPerOrder] = useState('500');
  const [monthly, setMonthly] = useState('3000');
  const [threshold, setThreshold] = useState('90');
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const expires = new Date();
    expires.setDate(expires.getDate() + 30);
    try {
      await api.checkout(
        '/intent-mandates',
        session.token,
        post({
          category: 'groceries',
          per_order_cap: Number(perOrder),
          monthly_cap: Number(monthly),
          escalation_threshold_pct: Number(threshold),
          expires_at: expires.toISOString(),
        }),
      );
      onIssued();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span className="label">No active mandate</span>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Authorise the agent</h1>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-dim)', lineHeight: 1.6 }}>
          Set the limits the agent must buy within. It cannot spend outside these, and every attempt is recorded.
        </p>
      </div>

      <Panel style={{ padding: 26 }}>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <span className="label">Per-order cap (₹)</span>
            <input value={perOrder} onChange={(e) => setPerOrder(e.target.value)} inputMode="decimal" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <span className="label">Monthly cap (₹)</span>
            <input value={monthly} onChange={(e) => setMonthly(e.target.value)} inputMode="decimal" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <span className="label">Escalation threshold (%)</span>
            <input value={threshold} onChange={(e) => setThreshold(e.target.value)} inputMode="decimal" />
          </label>
          {error && <Notice tone="bad">{error}</Notice>}
          <button
            type="submit"
            style={{ height: 46, background: 'var(--amber)', color: 'var(--bg)', fontSize: 12, fontWeight: 700, letterSpacing: '0.16em' }}
          >
            ISSUE MANDATE
          </button>
        </form>
      </Panel>
    </div>
  );
}
