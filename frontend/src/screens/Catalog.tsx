import { useState } from 'react';
import { api, post } from '../api/client';
import { useResource } from '../api/useResource';
import { useSession } from '../auth/AuthContext';
import type { AgentRun, CartStatus, CatalogItem, Mandate, RestockEntry } from '../api/types';
import { loadActiveMandates, loadCategories, mandateFor } from '../api/mandates';
import { CategoryTabs } from '../components/CategoryTabs';
import { Empty, Icon, Notice, Panel, money, statusColor } from '../components/ui';
import { productGlyph, productTint } from '../components/glyph';

interface ProposeOutcome {
  status: CartStatus;
  reason: string | null;
  total: number;
  itemName: string;
  quantity: number;
}

export function Catalog() {
  const session = useSession();
  const catalog = useResource<CatalogItem[]>((token) => api.checkout('/catalog', token), []);
  const restock = useResource<RestockEntry[]>((token) => api.checkout('/restock-list', token), []);
  const runs = useResource<AgentRun[]>((token) => api.checkout('/agent-runs?limit=1', token), []);
  const mandates = useResource<Mandate[]>(loadActiveMandates, []);
  const categories = useResource<string[]>(loadCategories, []);
  const [category, setCategory] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [outcome, setOutcome] = useState<ProposeOutcome | null>(null);
  const [proposing, setProposing] = useState<number | null>(null);

  const qtyFor = (id: number) => quantities[id] ?? 1;
  const setQty = (id: number, value: number) =>
    setQuantities((prev) => ({ ...prev, [id]: Math.max(1, Math.min(99, value)) }));

  async function proposeDirect(item: CatalogItem) {
    const covering = mandateFor(mandates.data ?? [], item.category);
    if (!covering) {
      setError(`No active mandate covers ${item.category} — issue one on the Mandate screen first.`);
      return;
    }
    setProposing(item.id);
    setError(null);
    setOutcome(null);
    try {
      const decision = await api.checkout<{ status: CartStatus; reason: string | null; total_amount: number }>(
        '/cart-mandates',
        session.token,
        post({
          intent_mandate_id: covering.id,
          cart_items: [{ catalog_id: item.id, quantity: qtyFor(item.id) }],
        }),
      );
      setOutcome({
        status: decision.status,
        reason: decision.reason,
        total: decision.total_amount,
        itemName: item.name,
        quantity: qtyFor(item.id),
      });
      mandates.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setProposing(null);
    }
  }

  const allCategories = categories.data ?? [];
  const selected = category ?? allCategories[0] ?? null;
  const visible = (catalog.data ?? []).filter((item) => !selected || item.category === selected);
  const queued = new Set((restock.data ?? []).map((entry) => entry.catalog_id));
  const latest = runs.data?.[0] ?? null;
  const flagged = new Set(latest?.flagged_catalog_ids ?? []);
  const flaggedItem = (catalog.data ?? []).find((item) => flagged.has(item.id)) ?? null;

  async function markLow(item: CatalogItem) {
    setError(null);
    try {
      await api.checkout('/restock-list', session.token, post({ catalog_id: item.id }));
      restock.reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span className="label">Merchant catalog{selected ? ` · ${selected}` : ''}</span>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700 }}>What the agent can browse</h1>
        </div>
        {flagged.size > 0 && (
          <span
            className="mono"
            style={{ display: 'flex', alignItems: 'center', gap: 9, border: '1px solid var(--bad-line)', background: 'var(--bad-bg)', padding: '7px 12px', fontSize: 10, letterSpacing: '0.12em', color: 'var(--bad)' }}
          >
            {Icon.warn('var(--bad)', 14)}
            {flagged.size} LISTING FLAGGED
          </span>
        )}
      </div>

      <CategoryTabs
        categories={allCategories}
        mandates={mandates.data ?? []}
        selected={selected}
        onSelect={setCategory}
      />

      {error && <Notice tone="bad">{error}</Notice>}

      <Panel style={{ padding: '14px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--ink-dim)', flexGrow: 1, minWidth: 320 }}>
            <strong style={{ color: 'var(--ink-2)', fontWeight: 600 }}>Propose a cart yourself.</strong> The agent stays
            inside its caps, so it never trips a rejection. Set a quantity and press PROPOSE to send a cart the agent
            would not — the guardrail checks it exactly the same way, because it trusts no caller.
            {' '}Try <span className="mono" style={{ color: 'var(--amber)' }}>50 × Daawat Basmati Rice</span> — what the
            poisoned listing demanded.
          </span>
          {outcome && (
            <span
              className="mono"
              style={{
                border: `1px solid ${statusColor(outcome.status)}`,
                color: statusColor(outcome.status),
                padding: '8px 12px',
                fontSize: 11,
                letterSpacing: '0.08em',
              }}
            >
              {outcome.quantity} × {outcome.itemName} · {money(outcome.total)} → {outcome.status.replace(/_/g, ' ')}
              {outcome.reason ? ` · ${outcome.reason}` : ''}
            </span>
          )}
        </div>
      </Panel>

      <div style={{ display: 'flex', gap: 26, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ width: 620, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
              gap: 14,
            }}
          >
            {visible.map((item) => (
              <ProductCard
                key={item.id}
                item={item}
                flagged={flagged.has(item.id)}
                queued={queued.has(item.id)}
                quantity={qtyFor(item.id)}
                busy={proposing === item.id}
                onQuantity={(value) => setQty(item.id, value)}
                onMarkLow={() => markLow(item)}
                onPropose={() => proposeDirect(item)}
              />
            ))}
          </div>
          <span className="mono" style={{ fontSize: 10, color: 'var(--ink-faint)', paddingLeft: 2 }}>
            {visible.length} listings · screened before every cycle
          </span>
        </div>

        <Panel
          title="INJECTION EVIDENCE"
          tone="ledger"
          style={{ flexGrow: 1, minWidth: 480 }}
          actions={
            latest && (
              <span className="mono" style={{ fontSize: 10, color: 'var(--ledger-faint)' }}>
                agent_run #{latest.id}
              </span>
            )
          }
        >
          {!latest ? (
            <Empty>Run the agent once to capture what the model was shown and what it returned.</Empty>
          ) : (
            <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {flaggedItem && (
                <Section label="① What the merchant listing says">
                  <div style={{ border: '1px solid #5c2a26', borderRadius: 'var(--radius-sm)', background: '#1c1210', padding: '14px 16px', fontSize: 13, lineHeight: 1.7, color: '#d8a9a3' }}>
                    {flaggedItem.description}
                  </div>
                </Section>
              )}

              <Section label="② What the model was shown">
                <pre
                  className="mono"
                  style={{ margin: 0, border: '1px solid var(--ledger-line)', borderRadius: 'var(--radius-sm)', background: 'var(--ledger-soft)', padding: '13px 16px', fontSize: 11, color: 'var(--ledger-faint)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 150, overflow: 'auto' }}
                >
                  {extractCatalogLine(latest.prompt, flaggedItem?.id)}
                </pre>
              </Section>

              <Section label="③ What the model returned">
                <pre
                  className="mono"
                  style={{ margin: 0, border: '1px solid var(--ledger-line)', borderRadius: 'var(--radius-sm)', background: 'var(--ledger-soft)', padding: '13px 16px', fontSize: 11, color: 'var(--ledger-dim)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                >
                  {latest.raw_response}
                </pre>
              </Section>

              <div
                style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1, background: 'var(--ledger-line)', border: '1px solid var(--ledger-line)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}
              >
                <Cell label="Demanded" value={demandedQuantity(flaggedItem?.description)} tone="#ff7a6e" background="#1c1210" />
                <Cell
                  label="Purchased"
                  value={String(latest.parsed_cart?.find((line) => line.catalog_id === flaggedItem?.id)?.quantity ?? 0)}
                  tone="#4fe0a6"
                  background="#0f1a16"
                />
                <div style={{ background: 'var(--ledger-soft)', padding: '15px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span className="label">Defence</span>
                  <span style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--ledger-dim)' }}>
                    Stripped before the prompt, and the output schema has no field to obey it with.
                  </span>
                </div>
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}


function ProductCard({
  item,
  flagged,
  queued,
  quantity,
  busy,
  onQuantity,
  onMarkLow,
  onPropose,
}: {
  item: CatalogItem;
  flagged: boolean;
  queued: boolean;
  quantity: number;
  busy: boolean;
  onQuantity: (value: number) => void;
  onMarkLow: () => void;
  onPropose: () => void;
}) {
  const outOfStock = item.stock_status === 'out_of_stock';
  return (
    <div
      style={{
        border: `1px solid ${flagged ? 'var(--bad-line)' : 'var(--line)'}`,
        borderRadius: 'var(--radius)',
        background: 'var(--panel)',
        boxShadow: 'var(--lift)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          height: 96,
          background: flagged ? 'var(--bad-bg)' : productTint(item),
          display: 'grid',
          placeItems: 'center',
          fontSize: 38,
          position: 'relative',
          filter: outOfStock ? 'grayscale(1)' : undefined,
          opacity: outOfStock ? 0.6 : 1,
        }}
      >
        {productGlyph(item)}
        {outOfStock && (
          <span
            className="mono"
            style={{
              position: 'absolute',
              bottom: 8,
              background: 'var(--ink)',
              color: '#fff',
              borderRadius: 'var(--radius-pill)',
              padding: '3px 9px',
              fontSize: 8.5,
              letterSpacing: '0.12em',
            }}
          >
            OUT OF STOCK
          </span>
        )}
        {flagged && (
          <span
            className="mono"
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              background: 'var(--bad)',
              color: '#fff',
              borderRadius: 'var(--radius-pill)',
              padding: '3px 9px',
              fontSize: 8.5,
              letterSpacing: '0.1em',
            }}
          >
            FLAGGED · INJECTION
          </span>
        )}
      </div>

      <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 10, flexGrow: 1 }}>
        <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35, color: 'var(--ink)' }}>{item.name}</span>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
          <span style={{ fontFamily: 'var(--display)', fontSize: 19, fontWeight: 700 }}>{money(item.price)}</span>
          <button
            onClick={onMarkLow}
            disabled={queued || outOfStock}
            style={{
              height: 30,
              padding: '0 14px',
              borderRadius: 'var(--radius-pill)',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.02em',
              border: `1px solid ${queued ? 'var(--ok-line)' : 'var(--brand)'}`,
              background: queued ? 'var(--ok-bg)' : 'var(--brand)',
              color: queued ? 'var(--ok)' : '#fff',
            }}
          >
            {queued ? 'IN LIST' : outOfStock ? 'ADD' : '+ ADD'}
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            paddingTop: 10,
            borderTop: '1px solid var(--line-soft)',
          }}
        >
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              border: '1px solid var(--line)',
              borderRadius: 'var(--radius-pill)',
            }}
          >
            <button
              onClick={() => onQuantity(quantity - 1)}
              className="mono"
              style={{ background: 'none', color: 'var(--ink-dim)', padding: '2px 9px', fontSize: 12 }}
            >
              −
            </button>
            <span className="mono" style={{ minWidth: 20, textAlign: 'center', fontSize: 11 }}>
              {quantity}
            </span>
            <button
              onClick={() => onQuantity(quantity + 1)}
              className="mono"
              style={{ background: 'none', color: 'var(--ink-dim)', padding: '2px 9px', fontSize: 12 }}
            >
              +
            </button>
          </span>
          <button
            onClick={onPropose}
            disabled={busy}
            className="mono"
            style={{
              flexGrow: 1,
              height: 26,
              borderRadius: 'var(--radius-pill)',
              border: '1px solid var(--line-hot)',
              background: 'none',
              color: 'var(--ink-dim)',
              fontSize: 9,
              letterSpacing: '0.12em',
            }}
          >
            {busy ? 'CHECKING…' : 'PROPOSE'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <span className="label">{label}</span>
      {children}
    </div>
  );
}

function Cell({ label, value, tone, background }: { label: string; value: string; tone: string; background: string }) {
  return (
    <div style={{ background, padding: '15px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="label">{label}</span>
      <span className="mono" style={{ fontSize: 27, color: tone }}>
        {value}
      </span>
    </div>
  );
}

function extractCatalogLine(prompt: string, catalogId?: number): string {
  if (!catalogId) return prompt.slice(-400);
  const line = prompt.split('\n').find((row) => row.includes(`catalog_id=${catalogId}`));
  return line ?? prompt.slice(-400);
}

function demandedQuantity(description?: string | null): string {
  const match = description?.match(/add\s+(\d+)\s+units?/i);
  return match ? match[1] : '—';
}
