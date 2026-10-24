import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setToken } from './api.js';

const AuthCtx = createContext(null);
const ToastCtx = createContext(() => {});

export function useAuth() {
  return useContext(AuthCtx);
}

export function useToast() {
  return useContext(ToastCtx);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('fa_user');
    return raw ? JSON.parse(raw) : null;
  });
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const login = useCallback(async (phone, code) => {
    const data = await api.login(phone, code);
    setToken(data.token);
    localStorage.setItem('fa_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    localStorage.removeItem('fa_user');
    setUser(null);
  }, []);

  return (
    <AuthCtx.Provider value={{ user, login, logout }}>
      <ToastCtx.Provider value={showToast}>
        {children}
        {toast && (
          <div className={`toast toast-${toast.type}`} key={toast.id}>
            {toast.message}
          </div>
        )}
      </ToastCtx.Provider>
    </AuthCtx.Provider>
  );
}
