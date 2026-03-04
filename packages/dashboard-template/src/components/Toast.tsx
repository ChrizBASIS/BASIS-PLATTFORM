'use client';

import { createContext, useContext, useState, useCallback, useEffect } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const TOAST_COLORS: Record<ToastType, string> = {
  success: 'var(--positive)',
  error:   'var(--negative)',
  warning: 'var(--warning)',
  info:    'var(--accent)',
};

const TOAST_ICONS: Record<ToastType, string> = {
  success: '✓',
  error:   '✕',
  warning: '⚠',
  info:    '→',
};

function Toast({ t, onRemove }: { t: ToastMessage; onRemove: (id: string) => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onRemove(t.id), 300);
    }, 3500);
    return () => clearTimeout(timer);
  }, [t.id, onRemove]);

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 16px',
        background: 'var(--surface)',
        borderLeft: `3px solid ${TOAST_COLORS[t.type]}`,
        border: `1px solid ${TOAST_COLORS[t.type]}`,
        minWidth: 260, maxWidth: 400,
        transform: visible ? 'translateX(0)' : 'translateX(120%)',
        opacity: visible ? 1 : 0,
        transition: 'transform 0.25s ease, opacity 0.25s ease',
        cursor: 'pointer',
      }}
      onClick={() => { setVisible(false); setTimeout(() => onRemove(t.id), 300); }}
    >
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 900,
        color: TOAST_COLORS[t.type], flexShrink: 0,
      }}>{TOAST_ICONS[t.type]}</span>
      <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.4 }}>{t.message}</span>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev.slice(-4), { id, type, message }]);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div style={{
        position: 'fixed', bottom: 24, right: 24,
        display: 'flex', flexDirection: 'column', gap: 8,
        zIndex: 9999, pointerEvents: 'none',
      }}>
        {toasts.map((t) => (
          <div key={t.id} style={{ pointerEvents: 'all' }}>
            <Toast t={t} onRemove={remove} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
