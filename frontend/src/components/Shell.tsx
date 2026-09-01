import { NavLink, Outlet } from 'react-router-dom';
import { useAuth, useSession } from '../auth/AuthContext';
import { useResource } from '../api/useResource';
import { api } from '../api/client';
import type { CartMandate } from '../api/types';
import { Icon, Pip } from './ui';

const NAV = [
  { to: '/mandate', label: 'Mandate' },
  { to: '/approvals', label: 'Approvals' },
  { to: '/timeline', label: 'Timeline' },
  { to: '/chain', label: 'Chain' },
  { to: '/catalog', label: 'Catalog' },
];

export function Shell() {
  const { signOut } = useAuth();
  const session = useSession();

  const { data: pending } = useResource<CartMandate[]>(
    (token) => api.checkout('/cart-mandates?status=pending_approval', token),
    [],
    5000,
  );
  const pendingCount = pending?.length ?? 0;

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          height: 56,
          flexShrink: 0,
          borderBottom: '1px solid var(--line)',
          background: 'var(--bg-raised)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 28px',
          gap: 40,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {Icon.logo()}
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.26em', paddingLeft: 2 }}>AETHIS</span>
        </div>

        <nav style={{ display: 'flex', gap: 28, flexGrow: 1, height: '100%' }}>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: isActive ? 'var(--amber)' : 'var(--ink-faint)',
                borderBottom: isActive ? '2px solid var(--amber)' : '2px solid transparent',
                marginBottom: -1,
              })}
            >
              {item.label}
              {item.to === '/approvals' && pendingCount > 0 && (
                <span
                  className="mono"
                  style={{ background: 'var(--amber)', color: 'var(--bg)', padding: '1px 5px', fontSize: 9 }}
                >
                  {pendingCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mono" style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: 10, color: 'var(--ink-faint)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, letterSpacing: '0.1em' }}>
            <Pip color={pendingCount > 0 ? 'var(--amber)' : 'var(--ok)'} />
            {pendingCount > 0 ? `${pendingCount} AWAITING YOU` : 'AGENT IDLE'}
          </span>
          <span style={{ color: 'var(--ink-dim)' }}>{session.email}</span>
          <button
            onClick={signOut}
            style={{ background: 'none', color: 'var(--ink-ghost)', fontSize: 10, letterSpacing: '0.1em', fontFamily: 'var(--mono)' }}
          >
            SIGN OUT
          </button>
        </div>
      </header>

      <main style={{ flexGrow: 1, padding: '32px 40px', maxWidth: 1600, width: '100%' }}>
        <Outlet />
      </main>
    </div>
  );
}
