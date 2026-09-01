import { useState } from 'react';
import { api, ApiError, post } from '../api/client';
import { useResource } from '../api/useResource';
import { useSession } from '../auth/AuthContext';
import type { CartMandate, CatalogItem, Mandate } from '../api/types';
import { BudgetMeter } from '../components/BudgetMeter';
import { Button, Empty, Icon, Notice, Panel, clockTime, money, statusColor } from '../components/ui';

async function loadActive(token: string): Promise<Mandate | null> {
  try {
    return await api.checkout<Mandate>('/intent-mandates/active', token);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export function Approvals() {
  const session = useSession();
  const pending = useResource<CartMandate[]>(
    (token) => api.checkout('/cart-mandates?status=pending_approval', token),
    [],
    4000,
  );
  const history = useResource<CartMandate[]>((token) => api.checkout('/cart-mandates', token), [], 8000);
  const mandate = useResource<Mandate | null>(loadActive, [], 8000);
  const catalog = useResource<CatalogItem[]>((token) => api.checkout('/catalog?category=groceries', token), []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const names = new Map((catalog.data ?? []).map((item) => [item.id, item.name]));

  async function resolve(cart: CartMandate, decision: 'approve' | 'decline') {
    setBusy(cart.id);
    setError(null);
    try {
      await api.checkout(`/cart-mandates/${cart.id}/resolve`, session.token, post({ decision }));
      if (decision === 'approve') {
        await api.checkout('/payment-mandates', session.token, post({ cart_mandate_id: cart.id }));
      }
      pending.reload();
      history.reload();
      mandate.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const queue = pending.data ?? [];
  const resolved = (history.data ?? []).filter((cart) => cart.status !== 'pending_approval').slice(0, 6);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <span className="label">Escalated by the guardrail</span>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Pending your approval</h1>
        </div>
        <span className="mono" style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--ink-ghost)' }}>
          POLLING · 4s
        </span>
      </div>

      {error && <Notice tone="bad">{error}</Notice>}

      {queue.length === 0 ? (
        <Panel>
          <Empty>Nothing is waiting on you. The agent has not hit the escalation threshold.</Empty>
        </Panel>
      ) : (
        queue.map((cart) => (
          <Panel key={cart.id} tone="warn" style={{ padding: '24px 28px' }}>
            <div style={{ display: 'flex', gap: 36, flexWrap: 'wrap' }}>
              <div style={{ flexGrow: 1, minWidth: 380, display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  {Icon.warn('var(--amber)', 19)}
                  <span style={{ fontSize: 16, fontWeight: 600, color: '#f0c67e' }}>
                    {cart.rejection_reason ?? 'Requires approval'}
                  </span>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--ink-faint)', letterSpacing: '0.1em' }}>
                    CART #{cart.id}
                  </span>
                </div>

                <div style={{ border: '1px solid var(--line)' }}>
                  <div
                    className="mono"
                    style={{ display: 'flex', padding: '9px 16px', background: 'var(--panel-sunken)', borderBottom: '1px solid var(--line)', fontSize: 9, letterSpacing: '0.18em', color: 'var(--ink-ghost)' }}
                  >
                    <span style={{ flexGrow: 1 }}>ITEM</span>
                    <span style={{ width: 50, textAlign: 'right' }}>QTY</span>
                    <span style={{ width: 92, textAlign: 'right' }}>UNIT</span>
                    <span style={{ width: 92, textAlign: 'right' }}>LINE</span>
                  </div>
                  {cart.cart_items.map((item) => (
                    <div
                      key={item.catalog_id}
                      style={{ display: 'flex', padding: '11px 16px', borderBottom: '1px solid var(--line-soft)', fontSize: 13, color: 'var(--ink-2)' }}
                    >
                      <span style={{ flexGrow: 1 }}>{names.get(item.catalog_id) ?? `Item #${item.catalog_id}`}</span>
                      <span className="mono" style={{ width: 50, textAlign: 'right' }}>{item.quantity}</span>
                      <span className="mono" style={{ width: 92, textAlign: 'right', color: 'var(--ink-dim)' }}>
                        {item.unit_price.toFixed(2)}
                      </span>
                      <span className="mono" style={{ width: 92, textAlign: 'right' }}>
                        {(item.unit_price * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', padding: '12px 16px', background: 'var(--panel-sunken)' }}>
                    <span style={{ flexGrow: 1, fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', color: 'var(--ink-dim)', paddingTop: 5 }}>
                      CART TOTAL
                    </span>
                    <span className="mono" style={{ fontSize: 19, color: 'var(--amber)' }}>
                      {money(cart.total_amount)}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <Button variant="ok" onClick={() => resolve(cart, 'approve')} disabled={busy === cart.id}>
                    {Icon.check('#05130d')}
                    APPROVE &amp; PAY
                  </Button>
                  <Button variant="danger" onClick={() => resolve(cart, 'decline')} disabled={busy === cart.id}>
                    {Icon.cross('var(--bad)')}
                    DECLINE
                  </Button>
                  <span className="mono" style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--ink-ghost)' }}>
                    proposed {clockTime(cart.created_at)}
                  </span>
                </div>
              </div>

              {mandate.data && (
                <div style={{ width: 380, borderLeft: '1px solid var(--line)', paddingLeft: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <span className="label">If you approve</span>
                  <BudgetMeter
                    spent={mandate.data.spent_this_period}
                    cap={mandate.data.monthly_cap}
                    escalationPct={mandate.data.escalation_threshold_pct}
                    pending={cart.total_amount}
                    height={44}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 6 }}>
                    <Row label="already paid" value={money(mandate.data.spent_this_period)} />
                    <Row label="this cart" value={`+ ${money(cart.total_amount)}`} tone="var(--amber)" />
                    <div style={{ height: 1, background: 'var(--line)' }} />
                    <Row
                      label={`of ${money(mandate.data.monthly_cap)} cap`}
                      value={money(mandate.data.spent_this_period + cart.total_amount)}
                    />
                    <Row
                      label="left after"
                      value={money(mandate.data.remaining_monthly_budget - cart.total_amount)}
                      tone="var(--bad)"
                    />
                  </div>
                </div>
              )}
            </div>
          </Panel>
        ))
      )}

      {resolved.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span className="label">Recently resolved</span>
          <Panel>
            {resolved.map((cart) => (
              <div
                key={cart.id}
                style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '13px 20px', borderBottom: '1px solid var(--line-soft)', opacity: 0.75 }}
              >
                <span
                  className="mono"
                  style={{ fontSize: 10, color: statusColor(cart.status), width: 130, letterSpacing: '0.1em', textTransform: 'uppercase' }}
                >
                  {cart.status.replace(/_/g, ' ')}
                </span>
                <span style={{ flexGrow: 1, fontSize: 13, color: 'var(--ink-dim)' }}>
                  Cart #{cart.id} · {money(cart.total_amount)}
                  {cart.rejection_reason ? ` · ${cart.rejection_reason}` : ''}
                </span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--ink-ghost)' }}>
                  {clockTime(cart.created_at)}
                </span>
              </div>
            ))}
          </Panel>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="mono" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
      <span style={{ color: 'var(--ink-dim)' }}>{label}</span>
      <span style={{ color: tone ?? 'var(--ink-2)' }}>{value}</span>
    </div>
  );
}
