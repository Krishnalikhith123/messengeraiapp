import { create } from 'zustand';
import axios from 'axios';

/** Ensure `id` is always a string (localStorage may only have `_id`). */
export function normalizeAuthUser(raw) {
  if (!raw) return null;
  const id = raw.id || raw._id;
  if (!id) return null;
  return { ...raw, id: String(id) };
}

const storedUser = (() => {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
})();

export const useAuthStore = create((set) => ({
  user: normalizeAuthUser(storedUser),
  token: localStorage.getItem('token') || null,
  isAuthenticated: !!localStorage.getItem('token'),
  isLoading: false,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const response = await axios.post('/api/auth/login', { email, password });
      const { token, user: rawUser } = response.data;
      const user = normalizeAuthUser(rawUser);

      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

      set({
        token,
        user,
        isAuthenticated: true,
        isLoading: false
      });
      return response.data;
    } catch (error) {
      const message = error.response?.data?.message || 'Login failed';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  register: async (username, email, password, confirmPassword) => {
    set({ isLoading: true, error: null });
    try {
      const response = await axios.post('/api/auth/register', {
        username,
        email,
        password,
        confirmPassword
      });
      const { token, user: rawUser } = response.data;
      const user = normalizeAuthUser(rawUser);

      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

      set({
        token,
        user,
        isAuthenticated: true,
        isLoading: false
      });
      return response.data;
    } catch (error) {
      const message = error.response?.data?.message || 'Registration failed';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    try {
      await axios.post('/api/auth/logout', { userId: useAuthStore.getState().user.id });
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      delete axios.defaults.headers.common['Authorization'];
      
      set({
        user: null,
        token: null,
        isAuthenticated: false
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
  },

  setUser: (user) => set({ user }),
  resetPassword: async (email, newPassword, confirmPassword) => {
    set({ isLoading: true, error: null });
    try {
      const response = await axios.post('/api/auth/reset-password', {
        email,
        newPassword,
        confirmPassword
      });
      set({ isLoading: false });
      return response.data;
    } catch (error) {
      const message = error.response?.data?.message || 'Password reset failed';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  clearError: () => set({ error: null })
}));

// Set initial auth header
const token = localStorage.getItem('token');
if (token) {
  axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
}