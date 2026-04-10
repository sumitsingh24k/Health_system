"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

const ToastContext = createContext(null);

const TOAST_STYLES = {
  success: {
    container: "border-emerald-200 bg-emerald-50",
    badge: "bg-emerald-600",
  },
  error: {
    container: "border-rose-200 bg-rose-50",
    badge: "bg-rose-600",
  },
  info: {
    container: "border-sky-200 bg-sky-50",
    badge: "bg-sky-600",
  },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const toastTimeoutsRef = useRef(new Map());

  const dismissToast = useCallback((id) => {
    const timeoutId = toastTimeoutsRef.current.get(id);
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      toastTimeoutsRef.current.delete(id);
    }

    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    const toastTimeouts = toastTimeoutsRef.current;

    return () => {
      for (const timeoutId of toastTimeouts.values()) {
        window.clearTimeout(timeoutId);
      }
      toastTimeouts.clear();
    };
  }, []);

  const showToast = useCallback(
    ({ title, description = "", type = "info", duration = 3500 }) => {
      const toastId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;

      setToasts((current) => [
        ...current,
        { id: toastId, title, description, type: TOAST_STYLES[type] ? type : "info" },
      ]);

      const timeoutMs = Number.isFinite(duration) ? Math.max(duration, 1200) : 3500;
      const timeoutId = window.setTimeout(() => {
        toastTimeoutsRef.current.delete(toastId);
        setToasts((current) => current.filter((toast) => toast.id !== toastId));
      }, timeoutMs);
      toastTimeoutsRef.current.set(toastId, timeoutId);
    },
    []
  );

  const value = useMemo(
    () => ({
      showToast,
      toast: {
        success: (title, description, duration) =>
          showToast({ type: "success", title, description, duration }),
        error: (title, description, duration) =>
          showToast({ type: "error", title, description, duration }),
        info: (title, description, duration) =>
          showToast({ type: "info", title, description, duration }),
      },
    }),
    [showToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-full max-w-sm flex-col gap-3">
        {toasts.map((item) => {
          const style = TOAST_STYLES[item.type] || TOAST_STYLES.info;

          return (
            <div
              key={item.id}
              className={`pointer-events-auto rounded-2xl border p-4 shadow-lg ${style.container}`}
              role="status"
              aria-live="polite"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${style.badge}`} />
                    <p className="truncate text-sm font-semibold text-slate-900">{item.title}</p>
                  </div>
                  {item.description ? (
                    <p className="text-sm leading-relaxed text-slate-600">{item.description}</p>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={() => dismissToast(item.id)}
                  className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-white/80"
                >
                  Close
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }

  return context;
}
