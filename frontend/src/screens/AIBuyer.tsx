import { useState } from 'react';
import { api, post } from '../api/client';
import { useResource } from '../api/useResource';
import { useSession } from '../auth/AuthContext';
import type { AutopilotStatus, CycleRecord, Mandate } from '../api/types';
import { loadActiveMandates, titleCase } from '../api/mandates';
import { ChatPanel } from '../components/ChatPanel';
import { Empty, Icon, Notice, Panel, money, statusColor } from '../components/ui';

const OUTCOME: Record<string, { label: string; color: string }> = {
  approved: { label: 'purchased', color: 'var(--ok)' },
  pending_approval: { label: 'sent for approval', color: 'var(--brand)' },
  rejected: { label: 'refused by policy', color: 'var(--bad)' },
  nothing_proposed: { label: 'bought nothing', color: 'var(--ink-faint)' },
  skipped: { label: 'skipped', color: 'var(--ink-faint)' },
};

export function AIBuyer() {
  const session = useSession();
  const mandates = useResource<Mandate[]>(loadActiveMandates, [], 8000);
  const autopilot = useResource<AutopilotStatus>(() => api.agent('/agent/autopilot'), [], 5000);
  const [error, setError] = useState<string | null>(null);

  const state = autopilot.data;

  async function toggle(enabled: boolean, interval?: number) {
    setError(null);
    try {
      await api.agent(
        '/agent/autopilot',
        post({ user_id: session.userId, enabled, interval_seconds: interval ?? state?.interval_seconds }),
      );
      autopilot.reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span className="label">Standing intent</span>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Your AI buyer</h1>
      </div>

      {error && <Notice tone="bad">{error}</Notice>}

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 520px', minWidth: 440 }}>
          <ChatPanel
            onChanged={() => {
              mandates.reload();
              autopilot.reload();
            }}
          />
        </div>

        <div style={{ width: 380, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Panel tone={state?.enabled ? 'ok' : 'neutral'} style={{ padding: '20px 22px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="label" style={{ flexGrow: 1 }}>Autopilot</span>
                <Switch on={!!state?.enabled} onClick={() => toggle(!state?.enabled)} />
              </div>

              <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: 'var(--ink-dim)' }}>
                {state?.enabled
                  ? 'A cycle runs on its own schedule. Every guardrail, escalation and audit write is the same as a manual run.'
                  : 'Off. The agent only shops when you ask it to — nothing spends while you are not looking.'}
              </p>

              <div style={{ display: 'flex', gap: 8 }}>
                {[60, 120, 300].map((seconds) => (
                  <button
                    key={seconds}
                    onClick={() => toggle(!!state?.enabled, seconds)}
                    style={{
                      flexGrow: 1,
                      height: 32,
                      borderRadius: 'var(--radius-sm)',
                      border: `1px solid ${state?.interval_seconds === seconds ? 'var(--ink)' : 'var(--line)'}`,
                      background: state?.interval_seconds === seconds ? 'var(--ink)' : 'var(--panel)',
                      color: state?.interval_seconds === seconds ? '#fff' : 'var(--ink-dim)',
                      fontSize: 11,
                      fontFamily: 'var(--mono)',
                    }}
                  >
                    {seconds < 120 ? `${seconds}s` : `${seconds / 60}m`}
                  </button>
                ))}
              </div>

              {state?.enabled && state.next_run_at && <Countdown at={state.next_run_at} />}
              {state?.last_error && (
                <span className="mono" style={{ fontSize: 10, color: 'var(--bad)' }}>{state.last_error}</span>
              )}
            </div>
          </Panel>

          <Panel title="ACTIVE MANDATES">
            {(mandates.data ?? []).length === 0 ? (
              <Empty>None yet. Ask for one in the conversation.</Empty>
            ) : (
              (mandates.data ?? []).map((mandate) => (
                <div
                  key={mandate.id}
                  style={{
                    padding: '13px 18px',
                    borderBottom: '1px solid var(--line-soft)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 5,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{titleCase(mandate.category)}</span>
                    <span className="mono" style={{ marginLeft: 'auto', fontSize: 12 }}>
                      {money(mandate.spent_this_period)}
                      <span style={{ color: 'var(--ink-faint)' }}> / {money(mandate.monthly_cap)}</span>
                    </span>
                  </div>
                  <span style={{ fontSize: 11.5, color: 'var(--ink-faint)', lineHeight: 1.5 }}>
                    {mandate.standing_instruction ?? 'No standing instruction'}
                  </span>
                </div>
              ))
            )}
          </Panel>

          <Panel title="AGENT CYCLES" actions={
            <span className="mono" style={{ fontSize: 10, color: 'var(--ink-ghost)' }}>
              {state?.runs ?? 0} run{state?.runs === 1 ? '' : 's'}
            </span>
          }>
            {!state?.history?.length ? (
              <Empty>No autonomous cycle has run yet.</Empty>
            ) : (
              state.history.map((record, index) => <Cycle key={index} record={record} />)
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Cycle({ record }: { record: CycleRecord }) {
  const outcome = OUTCOME[record.outcome] ?? { label: record.outcome, color: 'var(--ink-dim)' };
  return (
    <div
      style={{
        padding: '11px 18px',
        borderBottom: '1px solid var(--line-soft)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, fontSize: 12.5 }}>
        <span style={{ width: 6, height: 6, background: outcome.color, flexShrink: 0 }} />
        <span style={{ textTransform: 'capitalize', color: 'var(--ink-2)' }}>{record.category}</span>
        <span style={{ color: outcome.color }}>{outcome.label}</span>
        <span className="mono" style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--ink-ghost)' }}>
          {new Date(record.at * 1000).toLocaleTimeString('en-GB', { hour12: false })}
        </span>
      </div>
      {record.reason && (
        <span style={{ fontSize: 11, color: 'var(--ink-faint)', paddingLeft: 15, lineHeight: 1.45 }}>
          {record.reason}
        </span>
      )}
    </div>
  );
}

function Countdown({ at }: { at: number }) {
  const seconds = Math.max(0, Math.round(at - Date.now() / 1000));
  return (
    <div
      className="mono"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        fontSize: 11,
        color: 'var(--ok)',
        borderTop: '1px solid var(--line)',
        paddingTop: 14,
      }}
    >
      {Icon.play('var(--ok)', 11)}
      NEXT CYCLE IN {seconds}s
    </div>
  );
}

function Switch({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      style={{
        width: 46,
        height: 26,
        borderRadius: 7,
        background: on ? 'var(--ok)' : 'var(--line-hot)',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 3,
          left: on ? 23 : 3,
          width: 20,
          height: 20,
          borderRadius: 5,
          background: '#fff',
          transition: 'left 0.16s ease',
          boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
        }}
      />
    </button>
  );
}

export { statusColor };
