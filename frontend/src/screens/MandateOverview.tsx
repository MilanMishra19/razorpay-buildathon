import { useState, type FormEvent } from 'react';
import { api, ApiError, post } from '../api/client';
import { useResource } from '../api/useResource';
import { useSession } from '../auth/AuthContext';
import type {
  AgentRunResult,
  AuditEntry,
  CartMandate,
  CatalogItem,
  ChainVerification,
  Mandate,
  RestockEntry,
} from '../api/types';
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
  const carts = useResource<CartMandate[]>((token) => api.checkout('/cart-mandates', token), []);
  const catalog = useResource<CatalogItem[]>((token) => api.checkout('/catalog?category=groceries', token), []);

  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<AgentRunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  function refreshAll() {
    mandate.reload();
    audit.reload();
    chain.reload();
    restock.reload();
    carts.reload();
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
  const queueEmpty = (restock.data ?? []).length === 0;

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
            <Button variant="ghost" onClick={() => setEditing((open) => !open)}>
              CHANGE LIMITS
            </Button>
            <Button variant="ghost" onClick={() => revoke(m.id)}>
              REVOKE
            </Button>
            <Button variant="primary" onClick={runAgent} disabled={running || queueEmpty}>
              {Icon.play('var(--bg)')}
              {running ? 'RUNNING…' : 'RUN AGENT'}
            </Button>
          </div>
        </div>

        {editing && (
          <Panel title="CHANGE THE LIMITS" style={{ padding: 0 }}>
            <div style={{ padding: 24 }}>
              <p style={{ margin: '0 0 20px', fontSize: 12, lineHeight: 1.6, color: 'var(--ink-dim)' }}>
                This revokes the current mandate and issues a new one — both are recorded in the ledger. The caps are
                the whole control surface: change them and the next cart hits a different guardrail.
              </p>
              <MandateForm
                initial={{
                  instruction: m.standing_instruction ?? DEFAULT_INSTRUCTION,
                  perOrder: String(m.per_order_cap),
                  monthly: String(m.monthly_cap),
                  threshold: String(m.escalation_threshold_pct),
                }}
                submitLabel="REVOKE & RE-ISSUE"
                onCancel={() => setEditing(false)}
                onSubmit={async (limits) => {
                  await api.checkout(`/intent-mandates/${m.id}/revoke`, session.token, post({}));
                  await issueMandate(session.token, limits);
                  setEditing(false);
                  setRunResult(null);
                  refreshAll();
                }}
              />
            </div>
          </Panel>
        )}

        {queueEmpty && (
          <Notice tone="ok">
            The restock queue is empty, so there is nothing for the agent to buy. Mark items as low on the Catalog
            screen first.
          </Notice>
        )}

        <Panel title="STANDING INSTRUCTION">
          <div style={{ padding: '18px 20px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <span style={{ width: 3, alignSelf: 'stretch', background: 'var(--amber)', flexShrink: 0 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--ink-2)' }}>
                {m.standing_instruction ?? (
                  <span style={{ color: 'var(--ink-faint)', fontStyle: 'italic' }}>
                    None set — the agent falls back to a generic restock instruction. Use CHANGE LIMITS to say what you
                    actually want.
                  </span>
                )}
              </span>
              <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
                The only part the model interprets. The caps below are enforced in code, whatever it decides.
              </span>
            </div>
          </div>
        </Panel>

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

        <Purchases carts={carts.data ?? []} catalog={catalog.data ?? []} />

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

function Purchases({ carts, catalog }: { carts: CartMandate[]; catalog: CatalogItem[] }) {
  const names = new Map(catalog.map((item) => [item.id, item.name]));
  const bought = carts.filter((cart) => cart.status === 'approved');

  const totals = new Map<number, { quantity: number; spent: number }>();
  for (const cart of bought) {
    for (const line of cart.cart_items) {
      const current = totals.get(line.catalog_id) ?? { quantity: 0, spent: 0 };
      totals.set(line.catalog_id, {
        quantity: current.quantity + line.quantity,
        spent: current.spent + line.quantity * line.unit_price,
      });
    }
  }
  const rows = [...totals.entries()].sort((a, b) => b[1].spent - a[1].spent);

  return (
    <Panel
      title="WHERE THE MONEY WENT"
      actions={
        <span className="mono" style={{ fontSize: 10, color: 'var(--ink-faint)' }}>
          {bought.length} approved {bought.length === 1 ? 'cart' : 'carts'}
        </span>
      }
    >
      {rows.length === 0 ? (
        <Empty>Nothing bought yet.</Empty>
      ) : (
        rows.map(([catalogId, totalsForItem]) => (
          <div
            key={catalogId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: '12px 20px',
              borderBottom: '1px solid var(--line-soft)',
            }}
          >
            <span className="mono" style={{ width: 30, fontSize: 11, color: '#3d4954' }}>
              {String(catalogId).padStart(2, '0')}
            </span>
            <span style={{ flexGrow: 1, fontSize: 13, color: 'var(--ink-2)' }}>
              {names.get(catalogId) ?? `Item #${catalogId}`}
            </span>
            <span className="mono" style={{ width: 60, textAlign: 'right', fontSize: 12, color: 'var(--ink-dim)' }}>
              x{totalsForItem.quantity}
            </span>
            <span className="mono" style={{ width: 100, textAlign: 'right', fontSize: 13 }}>
              {money(totalsForItem.spent)}
            </span>
          </div>
        ))
      )}
    </Panel>
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
      {result.model_unavailable && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          {Icon.warn('var(--amber)', 15)}
          <span style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--ink-dim)' }}>
            The model was unavailable, so this cart was chosen deterministically instead. Guardrails, audit chain and
            payment all still ran for real.{' '}
            <span className="mono" style={{ color: 'var(--ink-ghost)' }}>{result.model_unavailable}</span>
          </span>
        </div>
      )}
    </Panel>
  );
}

const DEFAULT_INSTRUCTION =
  'Keep milk, bread and eggs stocked. Buy the smallest sensible quantity of each and stay well inside the budget.';

interface Limits {
  instruction: string;
  perOrder: string;
  monthly: string;
  threshold: string;
}

const PRESETS: { label: string; hint: string; limits: Limits }[] = [
  {
    label: 'Room to spend',
    hint: 'cart clears every check — approved and paid outright',
    limits: { instruction: DEFAULT_INSTRUCTION, perOrder: '500', monthly: '3000', threshold: '90' },
  },
  {
    label: 'Near the line',
    hint: 'cart crosses the escalation threshold — waits for you in Approvals',
    limits: { instruction: DEFAULT_INSTRUCTION, perOrder: '500', monthly: '300', threshold: '70' },
  },
  {
    label: 'Almost nothing left',
    hint: 'agent buys less to stay inside the cap, or nothing at all',
    limits: { instruction: DEFAULT_INSTRUCTION, perOrder: '500', monthly: '80', threshold: '90' },
  },
  {
    label: 'One item at a time',
    hint: 'per-order cap forces small carts across several runs',
    limits: { instruction: DEFAULT_INSTRUCTION, perOrder: '70', monthly: '3000', threshold: '90' },
  },
];

async function issueMandate(token: string, limits: Limits) {
  const expires = new Date();
  expires.setDate(expires.getDate() + 30);
  await api.checkout(
    '/intent-mandates',
    token,
    post({
      category: 'groceries',
      standing_instruction: limits.instruction,
      per_order_cap: Number(limits.perOrder),
      monthly_cap: Number(limits.monthly),
      escalation_threshold_pct: Number(limits.threshold),
      expires_at: expires.toISOString(),
    }),
  );
}

function MandateForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: Limits;
  submitLabel: string;
  onSubmit: (limits: Limits) => Promise<void>;
  onCancel?: () => void;
}) {
  const [limits, setLimits] = useState<Limits>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof Limits) => (event: { target: { value: string } }) =>
    setLimits((prev) => ({ ...prev, [key]: event.target.value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onSubmit(limits);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span className="label">Presets — each changes what the next agent run runs into</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          {PRESETS.map((preset) => {
            const active =
              preset.limits.perOrder === limits.perOrder &&
              preset.limits.monthly === limits.monthly &&
              preset.limits.threshold === limits.threshold;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => setLimits((prev) => ({ ...preset.limits, instruction: prev.instruction }))}
                style={{
                  textAlign: 'left',
                  padding: '11px 13px',
                  background: 'transparent',
                  border: `1px solid ${active ? 'var(--amber)' : 'var(--line)'}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 5,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600, color: active ? 'var(--amber)' : 'var(--ink-2)' }}>
                  {preset.label}
                </span>
                <span style={{ fontSize: 11, lineHeight: 1.4, color: 'var(--ink-faint)' }}>{preset.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <span className="label">What you want the agent to do</span>
        <textarea
          value={limits.instruction}
          onChange={(e) => setLimits((prev) => ({ ...prev, instruction: e.target.value }))}
          rows={3}
          placeholder="Plain language — e.g. keep milk, bread and eggs stocked, prefer the cheaper brand"
          style={{
            fontFamily: 'var(--sans)',
            fontSize: 13,
            lineHeight: 1.6,
            color: 'var(--ink)',
            background: 'var(--void)',
            border: '1px solid var(--line)',
            padding: '12px 14px',
            outline: 'none',
            resize: 'vertical',
          }}
        />
        <span style={{ fontSize: 11, color: 'var(--ink-faint)', lineHeight: 1.5 }}>
          This is the only thing the model interprets. Everything below is a hard limit it cannot cross.
        </span>
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <span className="label">Per-order ₹</span>
          <input value={limits.perOrder} onChange={set('perOrder')} inputMode="decimal" />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <span className="label">Monthly ₹</span>
          <input value={limits.monthly} onChange={set('monthly')} inputMode="decimal" />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <span className="label">Escalation %</span>
          <input value={limits.threshold} onChange={set('threshold')} inputMode="decimal" />
        </label>
      </div>

      {error && <Notice tone="bad">{error}</Notice>}

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          type="submit"
          disabled={busy}
          style={{ height: 46, flexGrow: 1, background: 'var(--amber)', color: 'var(--bg)', fontSize: 12, fontWeight: 700, letterSpacing: '0.16em' }}
        >
          {busy ? 'WORKING…' : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            style={{ height: 46, padding: '0 22px', background: 'transparent', border: '1px solid var(--line-hot)', color: 'var(--ink-dim)', fontSize: 12, fontWeight: 700, letterSpacing: '0.16em' }}
          >
            CANCEL
          </button>
        )}
      </div>
    </form>
  );
}

function IssueMandate({ onIssued }: { onIssued: () => void }) {
  const session = useSession();

  return (
    <div style={{ maxWidth: 620, display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span className="label">No active mandate</span>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Authorise the agent</h1>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-dim)', lineHeight: 1.6 }}>
          Set the limits the agent must buy within. It cannot spend outside these, and every attempt is recorded.
        </p>
      </div>

      <Panel style={{ padding: 26 }}>
        <MandateForm
          initial={PRESETS[0].limits}
          submitLabel="ISSUE MANDATE"
          onSubmit={async (limits) => {
            await issueMandate(session.token, limits);
            onIssued();
          }}
        />
      </Panel>
    </div>
  );
}
