const CHECKOUT_URL = import.meta.env.VITE_CHECKOUT_API_URL ?? 'http://localhost:8080';
const AGENT_URL = import.meta.env.VITE_AGENT_API_URL ?? 'http://localhost:8000';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

async function request<T>(base: string, path: string, token: string | null, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string>) };
  if (init?.body) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${base}${path}`, { ...init, headers });

  if (response.status === 401 && token) {
    onUnauthorized?.();
    throw new ApiError('Session expired', 401);
  }

  if (!response.ok) {
    throw new ApiError(await readError(response), response.status);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return body.detail ?? body.message ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

export const api = {
  checkout<T>(path: string, token: string | null, init?: RequestInit) {
    return request<T>(CHECKOUT_URL, path, token, init);
  },
  agent<T>(path: string, init?: RequestInit) {
    return request<T>(AGENT_URL, path, null, init);
  },
};

export function post(body: unknown): RequestInit {
  return { method: 'POST', body: JSON.stringify(body) };
}

export const del: RequestInit = { method: 'DELETE' };
