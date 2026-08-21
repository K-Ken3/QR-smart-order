import { create } from 'zustand';
import { api } from '@/lib/api';

interface User {
  id: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (businessName: string, email: string, password: string) => Promise<{ message: string; otp: string | null }>;
  logout: () => Promise<void>;
  loadUser: () => void;
  verifyOtp: (email: string, otpCode: string) => Promise<string>;
  resendOtp: (email: string) => Promise<{ message: string; otp: string | null }>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (email: string, password: string) => {
    const res = await api.post<{ success: boolean; data: { accessToken: string; refreshToken: string; user: User } }>('/auth/login', { email, password });
    api.setTokens(res.data.accessToken, res.data.refreshToken);
    set({ user: res.data.user, isAuthenticated: true });
  },

  register: async (businessName: string, email: string, password: string) => {
    const res = await api.post<{ success: boolean; message: string }>('/auth/register', { businessName, email, password });
    return { message: res.message, otp: null };
  },

  verifyOtp: async (email: string, otpCode: string) => {
    const res = await api.post<{ success: boolean; message: string }>('/auth/verify-otp', { email, otpCode });
    return res.message;
  },

  resendOtp: async (email: string) => {
    const res = await api.post<{ success: boolean; message: string }>('/auth/resend-otp', { email });
    return { message: res.message, otp: null };
  },

  logout: async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    try {
      await api.post('/auth/logout', { refreshToken });
    } catch { /* ignore */ }
    api.clearTokens();
    set({ user: null, isAuthenticated: false });
  },

  loadUser: () => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('accessToken');
    if (!token) {
      set({ isLoading: false });
      return;
    }
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        api.clearTokens();
        set({ isLoading: false });
        return;
      }
      set({
        user: {
          id: payload.sub,
          email: payload.email,
          role: payload.role,
          firstName: payload.firstName ?? '',
          lastName: payload.lastName ?? '',
        },
        isAuthenticated: true,
        isLoading: false,
      });
    } catch {
      api.clearTokens();
      set({ isLoading: false });
    }
  },
}));