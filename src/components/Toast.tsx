import { useState, useEffect, useCallback } from 'react';
import { type ToastType, registerToastHandler, unregisterToastHandler } from '../utils/toast';

interface ToastMessage {
  id: number;
  message: string;
  type: ToastType;
}

let nextId = 0;

const typeColors: Record<ToastType, { bg: string; border: string; icon: string }> = {
  success: { bg: 'rgba(166, 227, 161, 0.15)', border: '#a6e3a1', icon: '\u2713' },
  error: { bg: 'rgba(243, 139, 168, 0.15)', border: '#f38ba8', icon: '!' },
  info: { bg: 'rgba(137, 180, 250, 0.15)', border: '#89b4fa', icon: 'i' },
};

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((message: string, type: ToastType) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  useEffect(() => {
    registerToastHandler(addToast);
    return () => { unregisterToastHandler(); };
  }, [addToast]);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      right: 20,
      zIndex: 2000,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      pointerEvents: 'none',
    }}>
      {toasts.map((toast) => {
        const colors = typeColors[toast.type];
        return (
          <div
            key={toast.id}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              backgroundColor: colors.bg,
              border: `1px solid ${colors.border}`,
              backdropFilter: 'blur(12px)',
              color: '#cdd6f4',
              fontSize: 13,
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
              animation: 'toast-in 0.25s ease-out',
              pointerEvents: 'auto',
              maxWidth: 320,
            }}
          >
            <span style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              backgroundColor: colors.border,
              color: '#1e1e2e',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 700,
              flexShrink: 0,
            }}>
              {colors.icon}
            </span>
            {toast.message}
          </div>
        );
      })}
    </div>
  );
}
