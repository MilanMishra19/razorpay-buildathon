import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Icon, Notice } from '../components/ui';

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
        padding: '14px 0',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.18em',
        background: mode === value ? 'var(--amber)' : 'transparent',
        color: mode === value ? 'var(--bg)' : 'var(--ink-faint)',
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      style={{
        minHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 40,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(#131a20 1px, transparent 1px), linear-gradient(90deg, #131a20 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          opacity: 0.5,
        }}
      />

      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {Icon.logo('var(--amber)', 26)}
          <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: '0.34em', paddingLeft: 4 }}>AETHIS</span>
        </div>
        <span className="label">Agent Checkout Control</span>
      </div>

      <form
        onSubmit={submit}
        style={{ position: 'relative', width: 420, border: '1px solid var(--line)', background: 'var(--panel)' }}
      >
        <div style={{ display: 'flex', borderBottom: '1px solid var(--line)' }}>
          {tab('signin', 'SIGN IN')}
          {tab('register', 'REGISTER')}
        </div>

        <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 22 }}>
          {mode === 'register' && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <span className="label">Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
            </label>
          )}

          <label style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <span className="label">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
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
              background: 'var(--amber)',
              color: 'var(--bg)',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.16em',
            }}
          >
            {busy ? 'WORKING…' : mode === 'signin' ? 'AUTHENTICATE' : 'CREATE ACCOUNT'}
          </button>
        </div>
      </form>
    </div>
  );
}
