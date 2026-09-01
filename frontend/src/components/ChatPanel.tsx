import { useRef, useState } from 'react';
import { api, post } from '../api/client';
import { useSession } from '../auth/AuthContext';
import type { ChatReply, MandateProposal } from '../api/types';
import { Icon, money } from './ui';

interface Turn {
  who: 'you' | 'aethis';
  text: string;
  proposal?: MandateProposal | null;
  degraded?: string | null;
}

const MEMORY = 6;

const OPENERS = [
  'Keep household essentials stocked, max ₹600 per order',
  'Run my next cycle',
  'How much have I spent this month?',
  'Why is that waiting for my approval?',
];

export function ChatPanel({ onChanged }: { onChanged: () => void }) {
  const session = useSession();
  const [turns, setTurns] = useState<Turn[]>([
    {
      who: 'aethis',
      text:
        'Tell me what to keep stocked and what you are willing to spend. I will propose the mandate — ' +
        'you issue it. I never give myself spending authority.',
    },
  ]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>(OPENERS);
  const [pending, setPending] = useState<MandateProposal | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  function append(turn: Turn) {
    setTurns((prev) => [...prev, turn]);
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }));
  }

  async function send(text: string) {
    if (!text.trim() || busy) return;
    append({ who: 'you', text });
    setDraft('');
    setBusy(true);
    try {
      const reply = await api.agent<ChatReply>(
        '/chat',
        post({
          user_id: session.userId,
          message: text,
          history: turns.slice(-MEMORY).map((turn) => ({
            role: turn.who === 'you' ? 'user' : 'assistant',
            content: turn.text,
          })),
          pending_proposal: pending,
        }),
      );
      append({ who: 'aethis', text: reply.reply, proposal: reply.proposal, degraded: reply.degraded });
      setPending(reply.proposal ?? null);
      setSuggestions(reply.suggestions ?? []);
      if (reply.intent === 'run_cycle' || reply.intent === 'control_autopilot') onChanged();
    } catch (error) {
      append({ who: 'aethis', text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function confirm(proposal: MandateProposal) {
    setBusy(true);
    try {
      const reply = await api.agent<ChatReply>(
        '/chat/confirm',
        post({ user_id: session.userId, proposal }),
      );
      append({ who: 'aethis', text: reply.reply });
      setPending(null);
      setSuggestions(reply.suggestions ?? []);
      onChanged();
    } catch (error) {
      append({ who: 'aethis', text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius)',
        background: 'var(--panel)',
        boxShadow: 'var(--lift)',
        display: 'flex',
        flexDirection: 'column',
        height: 560,
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--line)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span
          style={{
            width: 24,
            height: 24,
            borderRadius: 3,
            background: 'var(--stamp)',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          {Icon.logo('#fff', 14)}
        </span>
        <span style={{ fontWeight: 600, fontSize: 14 }}>Aethis AI Buyer</span>
        <span className="mono" style={{ marginLeft: 'auto', fontSize: 9, letterSpacing: '0.12em', color: 'var(--ink-ghost)' }}>
          READS INTENT · CANNOT AUTHORISE
        </span>
      </header>

      <div style={{ flexGrow: 1, overflowY: 'auto', padding: '18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {turns.map((turn, index) => (
          <Bubble key={index} turn={turn} onConfirm={confirm} busy={busy} />
        ))}
        {busy && (
          <span
            className="mono"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--ink-faint)' }}
          >
            reading intent
            {[0, 1, 2].map((dot) => (
              <span
                key={dot}
                className="pulse"
                style={{
                  width: 3,
                  height: 3,
                  background: 'var(--pencil)',
                  animationDelay: `${dot * 160}ms`,
                }}
              />
            ))}
          </span>
        )}
        <div ref={endRef} />
      </div>

      {suggestions.length > 0 && !busy && (
        <div style={{ padding: '0 18px 12px', display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => send(suggestion)}
              style={{
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--panel-sunken)',
                color: 'var(--ink-dim)',
                padding: '6px 12px',
                fontSize: 11.5,
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          send(draft);
        }}
        style={{ borderTop: '1px solid var(--line)', padding: 12, display: 'flex', gap: 10 }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask Aethis…"
          style={{ flexGrow: 1, height: 40, fontFamily: 'var(--sans)', fontSize: 13 }}
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          style={{
            height: 40,
            padding: '0 20px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--stamp)',
            color: '#fff',
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}

function Bubble({
  turn,
  onConfirm,
  busy,
}: {
  turn: Turn;
  onConfirm: (proposal: MandateProposal) => void;
  busy: boolean;
}) {
  const mine = turn.who === 'you';
  return (
    <div
      className="rise"
      style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', gap: 8 }}
    >
      <div
        style={{
          maxWidth: '84%',
          borderRadius: mine ? '5px 5px 1px 5px' : '5px 5px 5px 1px',
          background: mine ? 'var(--ink)' : 'var(--panel-sunken)',
          color: mine ? '#fff' : 'var(--ink-2)',
          padding: '11px 14px',
          fontSize: 13,
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
        }}
      >
        {turn.text}
      </div>

      {turn.degraded && (
        <span className="mono" style={{ fontSize: 10, color: 'var(--ink-ghost)' }}>
          {turn.degraded}
        </span>
      )}

      {turn.proposal && (
        <div
          style={{
            border: '1px solid var(--brand-line)',
            background: 'var(--brand-soft)',
            borderRadius: 'var(--radius)',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            maxWidth: '84%',
          }}
        >
          <span className="mono" style={{ fontSize: 9, letterSpacing: '0.16em', color: 'var(--brand)' }}>
            PROPOSED MANDATE · NOT YET ISSUED
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5 }}>
            <Field label="Category" value={turn.proposal.category} />
            <Field label="Per order" value={money(turn.proposal.per_order_cap)} />
            <Field label="Per month" value={money(turn.proposal.monthly_cap)} />
            <Field label="Ask me at" value={`${turn.proposal.escalation_threshold_pct}%`} />
          </div>
          <button
            onClick={() => onConfirm(turn.proposal!)}
            disabled={busy}
            style={{
              height: 34,
              borderRadius: 'var(--radius-sm)',
              background: 'var(--stamp)',
              color: '#fff',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.1em',
            }}
          >
            ISSUE THIS MANDATE
          </button>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
      <span style={{ color: 'var(--ink-dim)' }}>{label}</span>
      <span className="mono" style={{ color: 'var(--ink)', textTransform: 'capitalize' }}>{value}</span>
    </div>
  );
}
