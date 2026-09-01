import type { CSSProperties, ReactNode } from 'react';
import type { AuditEvent, CartStatus } from '../api/types';

export function money(value: number): string {
  return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour12: false });
}

export function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

export function Mark({ children }: { children: ReactNode }) {
  return <span className="mono">{children}</span>;
}

export function Panel({
  title,
  actions,
  children,
  tone = 'neutral',
  style,
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  tone?: 'neutral' | 'ok' | 'warn' | 'bad' | 'ledger';
  style?: CSSProperties;
}) {
  const tones = {
    neutral: { border: 'var(--line)', background: 'var(--panel)', ink: 'var(--ink-dim)' },
    ok: { border: 'var(--ok-line)', background: 'var(--ok-bg)', ink: 'var(--ok)' },
    warn: { border: 'var(--amber-line)', background: 'var(--amber-bg)', ink: 'var(--amber)' },
    bad: { border: 'var(--bad-line)', background: 'var(--bad-bg)', ink: 'var(--bad)' },
    ledger: { border: 'var(--ledger-line)', background: 'var(--ledger)', ink: 'var(--ledger-dim)' },
  };
  return (
    <section
      className={tone === 'ledger' ? 'ledger' : tone === 'neutral' ? 'sheet' : undefined}
      style={{
        border: `1px solid ${tones[tone].border}`,
        background: tones[tone].background,
        borderRadius: 'var(--radius)',
        boxShadow: tone === 'neutral' ? 'var(--lift)' : 'none',
        borderTop: tone === 'neutral' ? '1px solid var(--line)' : `2px solid ${tones[tone].ink}`,
        overflow: 'hidden',
        ...style,
      }}
    >
      {(title || actions) && (
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            borderBottom: `1px solid ${tones[tone].border}`,
          }}
        >
          <span
            className="mono"
            style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', color: tones[tone].ink }}
          >
            {title}
          </span>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function Button({
  children,
  onClick,
  variant = 'ghost',
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'ok' | 'danger';
  disabled?: boolean;
}) {
  const variants = {
    primary: { background: 'var(--stamp)', color: '#fff', border: '1px solid var(--stamp)' },
    ok: { background: 'var(--ok)', color: '#fff', border: '1px solid var(--ok)' },
    ghost: { background: 'var(--panel)', color: 'var(--ink-2)', border: '1px solid var(--line-hot)' },
    danger: { background: 'var(--panel)', color: 'var(--bad)', border: '1px solid var(--bad-line)' },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 40,
        padding: '0 18px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 9,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.1em',
        borderRadius: 'var(--radius-sm)',
        ...variants[variant],
      }}
    >
      {children}
    </button>
  );
}

const EVENT_TONE: Record<AuditEvent, string> = {
  issued: 'var(--stamp)',
  approved: 'var(--ok)',
  approved_by_user: 'var(--ok)',
  paid: 'var(--ok)',
  rejected: 'var(--bad)',
  declined_by_user: 'var(--bad)',
  failed: 'var(--bad)',
  awaiting_approval: 'var(--stamp)',
  expired: 'var(--ink-faint)',
  revoked: 'var(--ink-faint)',
};

export function eventColor(event: AuditEvent): string {
  return EVENT_TONE[event] ?? 'var(--ink-faint)';
}

export function statusColor(status: CartStatus): string {
  if (status === 'approved') return 'var(--ok)';
  if (status === 'rejected') return 'var(--bad)';
  if (status === 'pending_approval') return 'var(--stamp)';
  return 'var(--ink-faint)';
}

export function Pip({ color }: { color: string }) {
  return <span style={{ width: 6, height: 6, background: color, display: 'inline-block', flexShrink: 0 }} />;
}

export function Chip({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span
      className="mono"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        border: `1px solid ${color}`,
        borderRadius: 'var(--radius-sm)',
        padding: '4px 9px',
        fontSize: 10,
        letterSpacing: '0.14em',
        color,
        textTransform: 'uppercase',
      }}
    >
      <Pip color={color} />
      {children}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--ink-faint)', fontSize: 13 }}>{children}</div>
  );
}

export function Notice({ tone, children }: { tone: 'bad' | 'ok'; children: ReactNode }) {
  const color = tone === 'bad' ? 'var(--bad)' : 'var(--ok)';
  return (
    <div
      style={{
        border: `1px solid ${tone === 'bad' ? 'var(--bad-line)' : 'var(--ok-line)'}`,
        background: tone === 'bad' ? 'var(--bad-bg)' : 'var(--ok-bg)',
        borderRadius: 'var(--radius-sm)',
        padding: '11px 15px',
        fontSize: 12,
        color,
      }}
    >
      {children}
    </div>
  );
}

export const Icon = {
  check: (color = 'currentColor', size = 14) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.8} strokeLinecap="square">
      <path d="M4 12.5 9.5 18 20 6.5" />
    </svg>
  ),
  cross: (color = 'currentColor', size = 14) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="square">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  play: (color = 'currentColor', size = 13) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="square">
      <path d="M6 4l13 8-13 8z" />
    </svg>
  ),
  shield: (color = 'currentColor', size = 14) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="square">
      <path d="M12 3.5 20 7v6.2c0 3.6-3.2 6.4-8 7.3-4.8-.9-8-3.7-8-7.3V7z" />
    </svg>
  ),
  warn: (color = 'currentColor', size = 15) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="square">
      <path d="M12 3.5 22 20H2z" />
      <path d="M12 10v4.5" />
      <path d="M12 17.2v.6" />
    </svg>
  ),
  logo: (color = 'var(--amber)', size = 18) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="square">
      <path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7z" />
      <path d="M12 8.2 16.3 10.6v4.8L12 17.8 7.7 15.4v-4.8z" />
    </svg>
  ),
};
