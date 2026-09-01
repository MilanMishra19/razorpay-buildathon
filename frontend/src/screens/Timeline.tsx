import { useState } from 'react';
import { api } from '../api/client';
import { useResource } from '../api/useResource';
import type { AuditEntry, AuditType, ChainVerification } from '../api/types';
import { Empty, Icon, Notice, Panel, clockTime, eventColor } from '../components/ui';

const FILTERS: { key: AuditType | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'intent_mandate', label: 'Mandate' },
  { key: 'cart_mandate', label: 'Cart' },
  { key: 'payment_mandate', label: 'Payment' },
];

export function Timeline() {
  const audit = useResource<AuditEntry[]>((token) => api.checkout('/audit-log', token), [], 6000);
  const chain = useResource<ChainVerification>((token) => api.checkout('/audit-log/verify', token), [], 6000);
  const [filter, setFilter] = useState<AuditType | 'all'>('all');

  const all = audit.data ?? [];
  const rows = [...all].reverse().filter((entry) => filter === 'all' || entry.type === filter);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <span className="label">Append-only · hash-chained</span>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>What the agent did, and why</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {FILTERS.map((item) => {
            const active = filter === item.key;
            const count = item.key === 'all' ? all.length : all.filter((e) => e.type === item.key).length;
            return (
              <button
                key={item.key}
                onClick={() => setFilter(item.key)}
                className="mono"
                style={{
                  padding: '7px 13px',
                  border: `1px solid ${active ? 'var(--amber)' : 'var(--line)'}`,
                  color: active ? 'var(--amber)' : 'var(--ink-faint)',
                  background: 'transparent',
                  fontSize: 10,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                }}
              >
                {item.label} {count}
              </button>
            );
          })}
        </div>
      </div>

      {audit.error && <Notice tone="bad">{audit.error}</Notice>}

      <Panel>
        <div
          className="mono"
          style={{ display: 'flex', padding: '11px 22px', borderBottom: '1px solid var(--line)', background: 'var(--panel-sunken)', fontSize: 9, letterSpacing: '0.18em', color: 'var(--ink-ghost)' }}
        >
          <span style={{ width: 56 }}>SEQ</span>
          <span style={{ width: 150 }}>EVENT</span>
          <span style={{ flexGrow: 1 }}>SUMMARY</span>
          <span style={{ width: 78, textAlign: 'right' }}>TIME</span>
        </div>

        {rows.length === 0 ? (
          <Empty>No events recorded yet.</Empty>
        ) : (
          rows.map((entry, index) => {
            const seq = rows.length - index;
            return (
              <div
                key={`${entry.timestamp}-${index}`}
                style={{ display: 'flex', alignItems: 'center', padding: '12px 22px', borderBottom: '1px solid var(--line-soft)' }}
              >
                <span style={{ width: 56, display: 'flex', alignItems: 'center', gap: 11 }}>
                  <span className="mono" style={{ fontSize: 11, color: '#3d4954' }}>
                    {String(seq).padStart(2, '0')}
                  </span>
                  <span style={{ width: 7, height: 7, background: eventColor(entry.event) }} />
                </span>
                <span
                  className="mono"
                  style={{ width: 150, fontSize: 10, letterSpacing: '0.1em', color: eventColor(entry.event), textTransform: 'uppercase' }}
                >
                  {entry.event.replace(/_/g, ' ')}
                </span>
                <span style={{ flexGrow: 1, fontSize: 13, color: 'var(--ink-2)' }}>{entry.summary}</span>
                <span className="mono" style={{ width: 78, textAlign: 'right', fontSize: 11, color: 'var(--ink-ghost)' }}>
                  {clockTime(entry.timestamp)}
                </span>
              </div>
            );
          })
        )}

        <div
          style={{ padding: '12px 22px', borderTop: '1px solid var(--line)', background: 'var(--panel-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <span className="mono" style={{ fontSize: 10, color: 'var(--ink-ghost)' }}>
            {all.length} entries
          </span>
          <span
            className="mono"
            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, letterSpacing: '0.12em', color: chain.data?.is_valid === false ? 'var(--bad)' : 'var(--ok)' }}
          >
            {chain.data?.is_valid === false ? Icon.cross('var(--bad)', 12) : Icon.check('var(--ok)', 12)}
            {chain.data?.is_valid === false ? 'CHAIN BROKEN' : 'CHAIN INTACT'}
          </span>
        </div>
      </Panel>
    </div>
  );
}
