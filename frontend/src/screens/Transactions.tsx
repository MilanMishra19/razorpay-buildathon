import { useState } from 'react';
import { api, post } from '../api/client';
import { useResource } from '../api/useResource';
import { useSession } from '../auth/AuthContext';
import type { AuditEntry, CartMandate, CatalogItem, Mandate } from '../api/types';
import { loadActiveMandates, mandateById, titleCase } from '../api/mandates';
import { BudgetMeter } from '../components/BudgetMeter';
import { BlockedExplainer, DecisionSplit } from '../components/DecisionSplit';
import { Button, Empty, Icon, Notice, Panel, clockTime, eventColor, money, statusColor } from '../components/ui';

type Filter = 'pending_approval' | 'all' | 'rejected';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending_approval', label: 'Awaiting you' },
  { key: 'rejected', label: 'Blocked' },
];

export function Transactions() {
  const session = useSession();
  const carts = useResource<CartMandate[]>((token) => api.checkout('/cart-mandates', token), [], 4000);
  const mandates = useResource<Mandate[]>(loadActiveMandates, [], 8000);
  const catalog = useResource<CatalogItem[]>((token) => api.checkout('/catalog', token), []);
  const audit = useResource<AuditEntry[]>((token) => api.checkout('/audit-log', token), [], 8000);
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const names = new Map((catalog.data ?? []).map((item) => [item.id, item.name]));
  const itemName = (id: number) => names.get(id) ?? `Item #${id}`;
  const all = carts.data ?? [];
  const rows = all.filter((cart) => (filter === 'all' ? true : cart.status === filter));

  async function resolve(cart: CartMandate, decision: 'approve' | 'decline') {
    setBusy(cart.id);
    setError(null);
    try {
      await api.checkout(`/cart-mandates/${cart.id}/resolve`, session.token, post({ decision }));
      if (decision === 'approve') {
        await api.checkout('/payment-mandates', session.token, post({ cart_mandate_id: cart.id }));
      }
      carts.reload();
      mandates.reload();
      audit.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="label">Every proposal the agent made, and what policy did with it</span>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Transactions</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {FILTERS.map((item) => {
            const active = filter === item.key;
            const count = item.key === 'all' ? all.length : all.filter((c) => c.status === item.key).length;
            return (
              <button
                key={item.key}
                onClick={() => setFilter(item.key)}
                style={{
                  height: 34,
                  padding: '0 14px',
                  borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${active ? 'var(--ink)' : 'var(--line)'}`,
                  background: active ? 'var(--ink)' : 'var(--panel)',
                  color: active ? '#fff' : 'var(--ink-dim)',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {item.label} {count}
              </button>
            );
          })}
        </div>
      </div>

      {error && <Notice tone="bad">{error}</Notice>}

      {rows.length === 0 ? (
        <Panel>
          <Empty>
            {filter === 'pending_approval'
              ? 'Nothing is waiting on you. The agent has not crossed a line that needs your judgement.'
              : 'No transactions yet.'}
          </Empty>
        </Panel>
      ) : (
        rows.map((cart) => {
          const covering = mandateById(mandates.data ?? [], cart.intent_mandate_id);
          const expanded = open === cart.id;
          const pending = cart.status === 'pending_approval';

          return (
            <Panel key={cart.id} tone={pending ? 'warn' : 'neutral'} style={{ padding: 0 }}>
              <button
                onClick={() => setOpen(expanded ? null : cart.id)}
                style={{
                  width: '100%',
                  background: 'none',
                  padding: '16px 22px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  textAlign: 'left',
                }}
              >
                <span
                  className="mono"
                  style={{
                    fontSize: 10,
                    letterSpacing: '0.1em',
                    color: statusColor(cart.status),
                    textTransform: 'uppercase',
                    width: 150,
                    flexShrink: 0,
                  }}
                >
                  {cart.status.replace(/_/g, ' ')}
                </span>
                <span style={{ fontSize: 13, color: 'var(--ink-2)', flexGrow: 1 }}>
                  Cart #{cart.id}
                  {covering ? ` · ${titleCase(covering.category)}` : ''}
                  {cart.rejection_reason ? ` · ${cart.rejection_reason}` : ''}
                </span>
                <span className="mono" style={{ fontSize: 14 }}>{money(cart.total_amount)}</span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--ink-ghost)', width: 66, textAlign: 'right' }}>
                  {clockTime(cart.created_at)}
                </span>
                <span style={{ color: 'var(--ink-faint)', fontSize: 11 }}>{expanded ? '▲' : '▼'}</span>
              </button>

              {expanded && (
                <div
                  style={{
                    borderTop: '1px solid var(--line)',
                    padding: '20px 22px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 18,
                    background: 'var(--panel-sunken)',
                  }}
                >
                  {cart.status === 'rejected' && <BlockedExplainer cart={cart} />}

                  <DecisionSplit cart={cart} name={itemName} />

                  {covering && pending && (
                    <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                      <div style={{ flex: '1 1 320px', minWidth: 300, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <span className="label">If you approve</span>
                        <BudgetMeter
                          spent={covering.spent_this_period}
                          cap={covering.monthly_cap}
                          escalationPct={covering.escalation_threshold_pct}
                          pending={cart.total_amount}
                          height={40}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center', paddingTop: 22 }}>
                        <Button variant="ok" onClick={() => resolve(cart, 'approve')} disabled={busy === cart.id}>
                          {Icon.check('#fff')}
                          APPROVE &amp; PAY
                        </Button>
                        <Button variant="danger" onClick={() => resolve(cart, 'decline')} disabled={busy === cart.id}>
                          {Icon.cross('var(--bad)')}
                          DECLINE
                        </Button>
                      </div>
                    </div>
                  )}

                  <CartTimeline cartId={cart.id} entries={audit.data ?? []} />
                </div>
              )}
            </Panel>
          );
        })
      )}
    </div>
  );
}

/**
 * The life of one transaction, pulled out of the same ledger the chain verifies. No separate store,
 * so a timeline can never claim something the audit log does not.
 */
function CartTimeline({ cartId, entries }: { cartId: number; entries: AuditEntry[] }) {
  const mine = entries.filter(
    (entry) => entry.type === 'cart_mandate' && entry.summary.includes(`#${cartId}`),
  );
  const relevant = mine.length > 0 ? mine : entries.filter((entry) => entry.summary.includes(`#${cartId}`));

  if (relevant.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span className="label">Timeline</span>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {relevant.map((entry, index) => (
          <div key={entry.id} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: eventColor(entry.event) }} />
              {index < relevant.length - 1 && (
                <span style={{ width: 1, flexGrow: 1, minHeight: 22, background: 'var(--line-hot)' }} />
              )}
            </div>
            <div style={{ paddingBottom: 14, display: 'flex', gap: 12, flexGrow: 1, alignItems: 'baseline' }}>
              <span className="mono" style={{ fontSize: 10, color: 'var(--ink-ghost)', width: 62, flexShrink: 0 }}>
                {clockTime(entry.timestamp)}
              </span>
              <span style={{ fontSize: 12.5, color: 'var(--ink-dim)', lineHeight: 1.5 }}>{entry.summary}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
