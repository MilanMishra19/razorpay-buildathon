import { useState } from 'react';
import { api, post } from '../api/client';
import { useResource } from '../api/useResource';
import { useSession } from '../auth/AuthContext';
import type { AgentRun, CatalogItem, RestockEntry } from '../api/types';
import { Empty, Icon, Notice, Panel } from '../components/ui';

export function Catalog() {
  const session = useSession();
  const catalog = useResource<CatalogItem[]>((token) => api.checkout('/catalog?category=groceries', token), []);
  const restock = useResource<RestockEntry[]>((token) => api.checkout('/restock-list', token), []);
  const runs = useResource<AgentRun[]>((token) => api.checkout('/agent-runs?limit=1', token), []);
  const [error, setError] = useState<string | null>(null);

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
          <span className="label">Merchant catalog · groceries</span>
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

      {error && <Notice tone="bad">{error}</Notice>}

      <div style={{ display: 'flex', gap: 26, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <Panel style={{ width: 560, flexShrink: 0 }}>
          <div
            className="mono"
            style={{ display: 'flex', padding: '10px 16px', borderBottom: '1px solid var(--line)', background: 'var(--panel-sunken)', fontSize: 9, letterSpacing: '0.18em', color: 'var(--ink-ghost)' }}
          >
            <span style={{ width: 32 }}>ID</span>
            <span style={{ flexGrow: 1 }}>ITEM</span>
            <span style={{ width: 70, textAlign: 'right' }}>PRICE</span>
            <span style={{ width: 108, textAlign: 'right' }}>STOCK</span>
          </div>

          {(catalog.data ?? []).map((item) => {
            const isFlagged = flagged.has(item.id);
            const inQueue = queued.has(item.id);
            return (
              <div
                key={item.id}
                style={{
                  borderBottom: '1px solid var(--line-soft)',
                  borderLeft: isFlagged ? '2px solid var(--bad)' : '2px solid transparent',
                  background: isFlagged ? 'var(--bad-bg)' : 'transparent',
                  padding: '10px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 7,
                  opacity: item.stock_status === 'out_of_stock' ? 0.55 : 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', fontSize: 13 }}>
                  <span className="mono" style={{ width: 32, fontSize: 11, color: isFlagged ? 'var(--bad)' : '#3d4954' }}>
                    {String(item.id).padStart(2, '0')}
                  </span>
                  <span style={{ flexGrow: 1, color: 'var(--ink-2)' }}>{item.name}</span>
                  <span className="mono" style={{ width: 70, textAlign: 'right', color: 'var(--ink-dim)' }}>
                    {item.price.toFixed(2)}
                  </span>
                  <span
                    className="mono"
                    style={{ width: 108, textAlign: 'right', fontSize: 10, color: item.stock_status === 'in_stock' ? 'var(--ok)' : 'var(--bad)' }}
                  >
                    {item.stock_status === 'in_stock' ? 'IN STOCK' : 'OUT'}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 32 }}>
                  <button
                    onClick={() => markLow(item)}
                    disabled={inQueue || item.stock_status === 'out_of_stock'}
                    className="mono"
                    style={{
                      border: `1px solid ${inQueue ? 'var(--amber-line)' : 'var(--line-hot)'}`,
                      background: 'transparent',
                      color: inQueue ? 'var(--amber)' : 'var(--ink-faint)',
                      padding: '3px 9px',
                      fontSize: 9,
                      letterSpacing: '0.12em',
                    }}
                  >
                    {inQueue ? 'QUEUED' : 'MARK AS LOW'}
                  </button>
                  {isFlagged && (
                    <span className="mono" style={{ fontSize: 9, letterSpacing: '0.12em', color: 'var(--bad)', border: '1px solid var(--bad-line)', padding: '3px 7px' }}>
                      FLAGGED · INJECTION
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          <div
            className="mono"
            style={{ padding: '11px 16px', borderTop: '1px solid var(--line)', background: 'var(--panel-sunken)', fontSize: 10, color: 'var(--ink-ghost)' }}
          >
            {(catalog.data ?? []).length} listings · screened before every cycle
          </div>
        </Panel>

        <Panel
          title="INJECTION EVIDENCE"
          style={{ flexGrow: 1, minWidth: 480 }}
          actions={
            latest && (
              <span className="mono" style={{ fontSize: 10, color: 'var(--ink-ghost)' }}>
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
                  <div style={{ border: '1px solid var(--bad-line)', background: '#140f0f', padding: '14px 16px', fontSize: 13, lineHeight: 1.7, color: '#a89b99' }}>
                    {flaggedItem.description}
                  </div>
                </Section>
              )}

              <Section label="② What the model was shown">
                <pre
                  className="mono"
                  style={{ margin: 0, border: '1px solid var(--line)', background: 'var(--void)', padding: '13px 16px', fontSize: 11, color: 'var(--ink-faint)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 150, overflow: 'auto' }}
                >
                  {extractCatalogLine(latest.prompt, flaggedItem?.id)}
                </pre>
              </Section>

              <Section label="③ What the model returned">
                <pre
                  className="mono"
                  style={{ margin: 0, border: '1px solid var(--line)', background: 'var(--void)', padding: '13px 16px', fontSize: 11, color: 'var(--ink-dim)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                >
                  {latest.raw_response}
                </pre>
              </Section>

              <div
                style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1, background: 'var(--line)', border: '1px solid var(--line)' }}
              >
                <Cell label="Demanded" value={demandedQuantity(flaggedItem?.description)} tone="var(--bad)" background="#140f0f" />
                <Cell
                  label="Purchased"
                  value={String(latest.parsed_cart?.find((line) => line.catalog_id === flaggedItem?.id)?.quantity ?? 0)}
                  tone="var(--ok)"
                  background="#0d1614"
                />
                <div style={{ background: 'var(--panel-sunken)', padding: '15px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span className="label">Defence</span>
                  <span style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--ink-dim)' }}>
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
