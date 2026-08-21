const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

interface ApiOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

class ApiClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.accessToken = localStorage.getItem('accessToken');
      this.refreshToken = localStorage.getItem('refreshToken');
    }
  }

  setTokens(access: string, refresh: string) {
    this.accessToken = access;
    this.refreshToken = refresh;
    if (typeof window !== 'undefined') {
      localStorage.setItem('accessToken', access);
      localStorage.setItem('refreshToken', refresh);
    }
  }

  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
    }
  }

  async request<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
    const { method = 'GET', body, headers: extraHeaders = {} } = options;

    // Read fresh tokens from localStorage on every request
    this.accessToken = localStorage.getItem('accessToken');
    this.refreshToken = localStorage.getItem('refreshToken');

    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...extraHeaders,
    };

    if (this.accessToken) {
      requestHeaders['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401 && this.refreshToken) {
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        requestHeaders['Authorization'] = `Bearer ${this.accessToken}`;
        const retryRes = await fetch(`${API_BASE}${path}`, {
          method,
          headers: requestHeaders,
          body: body ? JSON.stringify(body) : undefined,
        });
        if (!retryRes.ok) {
          const error = await retryRes.json().catch(() => ({ message: 'Request failed' }));
          throw new Error(error.message ?? error.error?.message ?? 'Request failed');
        }
        return retryRes.json() as Promise<T>;
      }
      this.clearTokens();
      throw new Error('Session expired. Please log in again.');
    }

    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message ?? error.error?.message ?? 'Request failed');
    }

    return res.json() as Promise<T>;
  }

  private async tryRefresh(): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (data.success && data.data) {
        this.setTokens(data.data.accessToken, data.data.refreshToken);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  get<T = unknown>(path: string) { return this.request<T>(path); }
  post<T = unknown>(path: string, body: unknown) { return this.request<T>(path, { method: 'POST', body }); }
  patch<T = unknown>(path: string, body: unknown) { return this.request<T>(path, { method: 'PATCH', body }); }
  delete<T = unknown>(path: string) { return this.request<T>(path, { method: 'DELETE' }); }
}

export const api = new ApiClient();