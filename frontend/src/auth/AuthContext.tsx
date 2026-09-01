import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, post, setUnauthorizedHandler } from '../api/client';

interface Session {
  token: string;
  userId: number;
  email: string;
}

interface AuthValue {
  session: Session | null;
  signIn: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

function decodeUserId(token: string): number {
  const payload = token.split('.')[1];
  const padded = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), '=');
  const json = JSON.parse(atob(padded.replace(/-/g, '+').replace(/_/g, '/')));
  return Number(json.sub);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);

  const signOut = useCallback(() => setSession(null), []);

  useEffect(() => {
    setUnauthorizedHandler(() => setSession(null));
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { token } = await api.checkout<{ token: string }>('/auth/login', null, post({ email, password }));
    setSession({ token, userId: decodeUserId(token), email });
  }, []);

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      await api.checkout('/auth/register', null, post({ name, email, password }));
      await signIn(email, password);
    },
    [signIn],
  );

  const value = useMemo(
    () => ({ session, signIn, register, signOut }),
    [session, signIn, register, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

export function useSession(): Session {
  const { session } = useAuth();
  if (!session) throw new Error('useSession requires an authenticated route');
  return session;
}
