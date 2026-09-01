import { useState } from 'react';
import { api } from '../api/client';
import { useResource } from '../api/useResource';
import { useSession } from '../auth/AuthContext';
import type { AuditEntry, ChainVerification } from '../api/types';
import { Icon, Panel, clockTime, eventColor } from '../components/ui';

type Phase = 'idle' | 'running' | 'valid' | 'broken';

export function ChainIntegrity() {
  const session = useSession();
  const audit = useResource<AuditEntry[]>((token) => api.checkout('/audit-log', token), []);
  const [phase, setPhase] = useState<Phase>('idle');
  const [checked, setChecked] = useState(0);
  const [result, setResult] = useState<ChainVerification | null>(null);

  const rows = audit.data ?? [];

  async function verify() {
    setPhase('running');
    setChecked(0);
    setResult(null);

    const verification = await api.checkout<ChainVerification>('/audit-log/verify', session.token);

    for (let i = 1; i <= rows.length; i += 1) {
      if (!verification.is_valid && i > rows.length) break;
      await new Promise((resolve) => setTimeout(resolve, 90));
      setChecked(i);
    }

    setResult(verification);
    setPhase(verification.is_valid ? 'valid' : 'broken');
  }

  const view = {
    idle: {
      label: 'NOT VERIFIED',
      color: 'var(--ink-dim)',
      blurb: 'Recompute every hash from the genesis row and confirm each link still matches.',
      button: 'VERIFY CHAIN',
      tone: 'neutral' as const,
    },
    running: {
      label: 'VERIFYING…',
      color: 'var(--amber)',
      blurb: 'Walking the chain from genesis, recomputing each row’s hash.',
      button: 'VERIFYING…',
      tone: 'warn' as const,
    },
    valid: {
      label: 'CHAIN INTACT',
      color: 'var(--ok)',
      blurb: `All ${rows.length} rows recomputed and linked. Nothing in this ledger has been altered.`,
      button: 'VERIFY AGAIN',
      tone: 'ok' as const,
    },
    broken: {
      label: 'CHAIN BROKEN',
      color: 'var(--bad)',
      blurb: `Row ${result?.broken_at_id ?? '?'} no longer matches the hash the next row recorded. Something edited the ledger.`,
      button: 'VERIFY AGAIN',
      tone: 'bad' as const,
    },
  }[phase];

  return (
    <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ flexGrow: 1, minWidth: 480, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="label">Every row seals the one before it</span>
          <h1 style={{ margin: 0, fontSize: 27, fontWeight: 700 }}>Chain integrity</h1>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {rows.map((entry, index) => {
            const n = index + 1;
            const isBad = phase === 'broken' && result?.broken_at_id === n;
            const isOk = !isBad && phase !== 'idle' && checked >= n && !(phase === 'broken' && n > (result?.broken_at_id ?? 0));
            const border = isBad ? 'var(--bad-line)' : isOk ? 'var(--ok-line)' : 'var(--line)';
            const background = isBad ? 'var(--bad-bg)' : isOk ? 'var(--ok-bg)' : 'var(--panel-sunken)';

            return (
              <div key={`${entry.timestamp}-${index}`}>
                <div
                  style={{ border: `1px solid ${border}`, background, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 18 }}
                >
                  <span className="mono" style={{ width: 26, fontSize: 14, color: isBad ? 'var(--bad)' : isOk ? 'var(--ink-dim)' : '#3d4954' }}>
                    {String(n).padStart(2, '0')}
                  </span>
                  <span
                    className="mono"
                    style={{ width: 150, fontSize: 10, letterSpacing: '0.1em', color: eventColor(entry.event), textTransform: 'uppercase' }}
                  >
                    {entry.event.replace(/_/g, ' ')}
                  </span>
                  <span style={{ flexGrow: 1, fontSize: 12, color: 'var(--ink-dim)' }}>{entry.summary}</span>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--ink-ghost)' }}>
                    {clockTime(entry.timestamp)}
                  </span>
                  <span style={{ width: 22, display: 'flex', justifyContent: 'center' }}>
                    {isOk && Icon.check('var(--ok)', 16)}
                    {isBad && Icon.cross('var(--bad)', 16)}
                    {!isOk && !isBad && <span style={{ width: 9, height: 9, border: '1px solid var(--line-hot)' }} />}
                  </span>
                </div>
                {index < rows.length - 1 && (
                  <div
                    style={{
                      height: 14,
                      marginLeft: 39,
                      borderLeft: `2px solid ${isOk && checked > n ? 'var(--ok-line)' : 'var(--line)'}`,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ width: 380, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Panel tone={view.tone} style={{ padding: 26 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', textAlign: 'center' }}>
              <div style={{ width: 52, height: 52, border: `1px solid ${view.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {phase === 'valid' && Icon.check('var(--ok)', 24)}
                {phase === 'broken' && Icon.cross('var(--bad)', 24)}
                {(phase === 'idle' || phase === 'running') && Icon.shield(view.color, 24)}
              </div>
              <span className="mono" style={{ fontSize: 15, letterSpacing: '0.16em', color: view.color }}>
                {view.label}
              </span>
              <p style={{ margin: 0, fontSize: 12, lineHeight: 1.55, color: 'var(--ink-dim)' }}>{view.blurb}</p>
            </div>

            <button
              onClick={verify}
              disabled={phase === 'running'}
              style={{ height: 46, background: 'var(--amber)', color: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontSize: 12, fontWeight: 700, letterSpacing: '0.16em' }}
            >
              {Icon.shield('var(--bg)')}
              {view.button}
            </button>
          </div>
        </Panel>

        <Panel title="VERIFICATION">
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 13 }}>
            <Row label="rows checked" value={`${checked} / ${rows.length}`} />
            <Row label="algorithm" value="SHA-256" />
            <Row
              label="broken at"
              value={phase === 'broken' ? `row ${result?.broken_at_id}` : phase === 'valid' ? 'none' : '—'}
              tone={phase === 'broken' ? 'var(--bad)' : phase === 'valid' ? 'var(--ok)' : 'var(--ink-faint)'}
            />
          </div>
        </Panel>

        <div style={{ border: '1px solid var(--line)', background: 'var(--panel-sunken)', padding: '18px 20px', fontSize: 12, lineHeight: 1.6, color: 'var(--ink-dim)' }}>
          Each row hashes its own contents together with the previous row&rsquo;s hash. Change any stored row and every
          hash after it stops matching &mdash; so tampering cannot be hidden, only detected.
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="mono" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
      <span style={{ color: 'var(--ink-dim)' }}>{label}</span>
      <span style={{ color: tone ?? 'var(--ink-2)' }}>{value}</span>
    </div>
  );
}
