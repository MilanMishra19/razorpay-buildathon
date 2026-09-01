import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Icon, Notice } from '../components/ui';
import { Stamp } from '../components/Stamp';

export function Login() {
  const { signIn, register } = useAuth();
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signin') await signIn(email, password);
      else await register(name, email, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const tab = (value: 'signin' | 'register', label: string) => (
    <button
      type="button"
      onClick={() => {
        setMode(value);
        setError(null);
      }}
      style={{
        flexGrow: 1,
        height: 38,
        borderRadius: 'var(--radius-xs)',
        fontSize: 11.5,
        fontWeight: 600,
        letterSpacing: '0.1em',
        background: mode === value ? 'var(--ink)' : 'transparent',
        color: mode === value ? '#fff' : 'var(--ink-dim)',
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ minHeight: '100%', position: 'relative', overflow: 'hidden' }}>
      {/* Security-paper guilloche: concentric rings, the way value documents have always signalled
          that they are meant to be hard to forge. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'repeating-radial-gradient(circle at 8% 18%, transparent 0 44px, rgba(74, 45, 140, 0.05) 44px 45px),' +
            'repeating-radial-gradient(circle at 94% 84%, transparent 0 52px, rgba(30, 91, 58, 0.045) 52px 53px)',
        }}
      />

      <div
        style={{
          position: 'relative',
          minHeight: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 32px',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 64,
            alignItems: 'center',
            flexWrap: 'wrap-reverse',
            justifyContent: 'center',
            maxWidth: 1060,
            width: '100%',
          }}
        >
          <section
            className="rise"
            style={{ flex: '1 1 400px', maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 26 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
              <span
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 11,
                  background: 'var(--stamp)',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                {Icon.logo('#fff', 24)}
              </span>
              <span
                className="wide"
                style={{ fontSize: 29, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}
              >
                Aethis
              </span>
            </div>

            <h1
              style={{
                margin: 0,
                fontSize: 33,
                lineHeight: 1.16,
                fontWeight: 700,
                letterSpacing: '-0.02em',
                maxWidth: 450,
              }}
            >
              AI agents can decide what to buy. They should never decide what they are allowed to spend.
            </h1>

            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: 'var(--ink-dim)', maxWidth: 430 }}>
              The agent proposes a cart. A deterministic policy engine decides whether it may happen and
              says exactly why. Every mark it makes is recorded in a chain you can verify.
            </p>

            <Specimen />
          </section>

          <form
            onSubmit={submit}
            className="rise"
            style={{
              animationDelay: '90ms',
              flex: '0 1 380px',
              width: '100%',
              maxWidth: 380,
              border: '1px solid var(--line)',
              borderTop: '2px solid var(--stamp)',
              borderRadius: 'var(--radius)',
              background: 'var(--panel)',
              boxShadow: 'var(--lift-hi)',
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', gap: 6, padding: 10, borderBottom: '1px solid var(--line)' }}>
              {tab('signin', 'SIGN IN')}
              {tab('register', 'REGISTER')}
            </div>

            <div style={{ padding: 26, display: 'flex', flexDirection: 'column', gap: 18 }}>
              {mode === 'register' && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span className="label">Name</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
                </label>
              )}

              <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span className="label">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span className="label">Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                />
              </label>

              {error && <Notice tone="bad">{error}</Notice>}

              <button
                type="submit"
                disabled={busy}
                style={{
                  height: 48,
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--stamp)',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                }}
              >
                {busy ? 'WORKING…' : mode === 'signin' ? 'SIGN IN' : 'CREATE ACCOUNT'}
              </button>

              <span style={{ fontSize: 11.5, lineHeight: 1.55, color: 'var(--ink-faint)' }}>
                Test mode throughout. No real money moves.
              </span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

const PROPOSED = [
  { name: 'Amul Toned Milk 1L', qty: 1, line: '₹62.00', swap: false },
  { name: 'Britannia Bread 400g', qty: 1, line: '₹45.00', swap: false },
  { name: 'Nescafe Classic 50g', qty: 1, line: '₹190.00', swap: true },
];

const CHECKED = [
  { mark: '✓', name: 'Category', detail: 'every item is in groceries', ink: 'var(--ok)' },
  { mark: '✓', name: 'Per-order cap', detail: '₹297.00 / ₹700.00', ink: 'var(--ok)' },
  { mark: '§', name: 'Substitution', detail: 'you did not pick this one', ink: 'var(--stamp)' },
];

/**
 * A worked example sitting on the front door: a docket written in pencil, marked in ink. The product
 * has one idea, and this is it at a glance, before anyone has an account.
 */
function Specimen() {
  return (
    <figure
      className="rise"
      style={{
        animationDelay: '160ms',
        margin: 0,
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius)',
        background: 'var(--panel)',
        boxShadow: 'var(--lift)',
        overflow: 'hidden',
      }}
    >
      <figcaption
        className="mono"
        style={{
          padding: '9px 16px',
          borderBottom: '1px dashed var(--pencil-line)',
          fontSize: 8.5,
          letterSpacing: '0.2em',
          color: 'var(--pencil)',
        }}
      >
        SPECIMEN · WRITTEN BY THE AGENT
      </figcaption>

      <div style={{ padding: '13px 16px', display: 'flex', flexDirection: 'column', gap: 7 }}>
        {PROPOSED.map((item, index) => (
          <div
            key={item.name}
            className="tick"
            style={{
              animationDelay: `${240 + index * 80}ms`,
              display: 'flex',
              alignItems: 'baseline',
              gap: 9,
              fontSize: 12.5,
            }}
          >
            {item.swap && (
              <span
                className="mono"
                style={{
                  fontSize: 7.5,
                  letterSpacing: '0.1em',
                  color: 'var(--pencil)',
                  border: '1px dashed var(--pencil-line)',
                  borderRadius: 'var(--radius-xs)',
                  padding: '1px 5px',
                }}
              >
                SWAP
              </span>
            )}
            <span style={{ flexGrow: 1, color: 'var(--ink-2)' }}>{item.name}</span>
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-faint)' }}>×{item.qty}</span>
            <span className="mono" style={{ fontSize: 11.5 }}>{item.line}</span>
          </div>
        ))}
      </div>

      <div
        className="mono"
        style={{
          padding: '9px 16px',
          borderTop: '1px solid var(--line)',
          borderBottom: '1px solid var(--line)',
          background: 'var(--panel-sunken)',
          fontSize: 8.5,
          letterSpacing: '0.2em',
          color: 'var(--stamp)',
        }}
      >
        DECIDED BY POLICY
      </div>

      <div style={{ padding: '13px 16px', display: 'flex', flexDirection: 'column', gap: 7 }}>
        {CHECKED.map((check, index) => (
          <div
            key={check.name}
            className="tick"
            style={{
              animationDelay: `${500 + index * 80}ms`,
              display: 'flex',
              alignItems: 'baseline',
              gap: 9,
              fontSize: 12,
            }}
          >
            <span className="mono" style={{ color: check.ink, width: 11, flexShrink: 0 }}>{check.mark}</span>
            <span style={{ color: 'var(--ink-2)', width: 104, flexShrink: 0 }}>{check.name}</span>
            <span style={{ flexGrow: 1, fontSize: 11, color: 'var(--ink-faint)' }}>{check.detail}</span>
          </div>
        ))}
      </div>

      <div
        style={{
          padding: '14px 16px 18px',
          borderTop: '1px solid var(--line)',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <Stamp status="pending_approval" checks={3} reference={108} delay={760} />
        <span
          style={{
            fontSize: 11.5,
            lineHeight: 1.5,
            color: 'var(--ink-faint)',
            marginLeft: 'auto',
            textAlign: 'right',
          }}
        >
          Held for the buyer,
          <br />
          with ₹403 still unspent.
        </span>
      </div>
    </figure>
  );
}
