import { NavLink, Outlet } from 'react-router-dom';
import { useAuth, useSession } from '../auth/AuthContext';
import { useResource } from '../api/useResource';
import { api } from '../api/client';
import type { CartMandate } from '../api/types';
import { Icon, Pip } from './ui';

const NAV = [
  { to: '/overview', label: 'Overview' },
  { to: '/buyer', label: 'AI Buyer' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/merchant', label: 'Merchant' },
  { to: '/catalog', label: 'Catalog' },
  { to: '/audit', label: 'Audit' },
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
          height: 64,
          flexShrink: 0,
          position: 'sticky',
          top: 0,
          zIndex: 20,
          borderBottom: '1px solid var(--line)',
          background: 'rgba(248, 249, 245, 0.9)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 28px',
          gap: 36,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: 3,
              background: 'var(--stamp)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            {Icon.logo('#fff', 17)}
          </span>
          <span
            className="wide"
            style={{ fontSize: 17, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}
          >
            Aethis
          </span>
        </div>

        <nav style={{ display: 'flex', gap: 4, flexGrow: 1, alignItems: 'center' }}>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                height: 32,
                padding: '0 12px',
                borderRadius: 'var(--radius-sm)',
                fontSize: 12.5,
                fontWeight: isActive ? 600 : 450,
                color: isActive ? '#fff' : 'var(--ink-dim)',
                background: isActive ? 'var(--ink)' : 'transparent',
              })}
            >
              {item.label}
              {item.to === '/transactions' && pendingCount > 0 && (
                <span
                  className="mono"
                  style={{
                    background: 'var(--brand)',
                    color: '#fff',
                    minWidth: 18,
                    height: 18,
                    borderRadius: 2,
                    display: 'grid',
                    placeItems: 'center',
                    padding: '0 5px',
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  {pendingCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mono" style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: 10, color: 'var(--ink-faint)' }}>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              height: 26,
              padding: '0 10px',
              borderRadius: 'var(--radius-sm)',
              border: `1px solid ${pendingCount > 0 ? 'var(--stamp-line)' : 'var(--ok-line)'}`,
              background: pendingCount > 0 ? 'var(--stamp-soft)' : 'var(--ok-bg)',
              color: pendingCount > 0 ? 'var(--stamp)' : 'var(--ok)',
              letterSpacing: '0.08em',
              fontWeight: 500,
            }}
          >
            <Pip color={pendingCount > 0 ? 'var(--brand)' : 'var(--ok)'} />
            {pendingCount > 0 ? `${pendingCount} AWAITING YOU` : 'AGENT IDLE'}
          </span>
          <span style={{ color: 'var(--ink-dim)' }}>{session.email}</span>
          <button
            onClick={signOut}
            style={{ background: 'none', color: 'var(--ink-faint)', fontSize: 10, letterSpacing: '0.1em', fontFamily: 'var(--mono)' }}
          >
            SIGN OUT
          </button>
        </div>
      </header>

      <main style={{ flexGrow: 1, padding: '30px 40px 60px', maxWidth: 1600, width: '100%' }}>
        <Outlet />
      </main>
    </div>
  );
}
