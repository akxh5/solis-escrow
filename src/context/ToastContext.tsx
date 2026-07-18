"use client";

/**
 * src/context/ToastContext.tsx
 *
 * Global Neo-Brutalist toast notification system.
 *
 * Usage:
 *   const { showToast } = useToast();
 *   showToast({ type: "success", title: "Pledge confirmed!", body: "Tx: abc…" });
 *   showToast({ type: "error",   title: "Transaction rejected", body: err.message });
 *   showToast({ type: "info",    title: "Tip", body: "Connect your wallet first." });
 *
 * Toasts auto-dismiss after `duration` ms (default 5 000).
 * The user can also manually dismiss them by clicking ×.
 * Up to 4 toasts are shown simultaneously; oldest is pushed out first.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  body?: string;
  duration?: number;     // ms, default 5000
  txHash?: string;       // if set, renders a "View on Explorer" link
  explorerUrl?: string;
}

interface ToastContextValue {
  showToast: (toast: Omit<ToastItem, "id">) => void;
  dismissToast: (id: string) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

// ─── Style constants ──────────────────────────────────────────────────────────

const TOAST_STYLE: Record<ToastType, { bg: string; accent: string; textColor: string; icon: string }> = {
  success: { bg: "#B8FF47", accent: "#0A0A0A", textColor: "#0A0A0A", icon: "✅" },
  error:   { bg: "#FF2D78", accent: "#0A0A0A", textColor: "#FFFFFF", icon: "❌" },
  info:    { bg: "#00F5FF", accent: "#0A0A0A", textColor: "#0A0A0A", icon: "ℹ️" },
  warning: { bg: "#FFE600", accent: "#0A0A0A", textColor: "#0A0A0A", icon: "⚠️" },
};

// ─── Individual Toast ─────────────────────────────────────────────────────────

function Toast({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const style = TOAST_STYLE[toast.type];
  const [visible, setVisible] = useState(false);

  // Entrance animation on mount
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 16);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        background: style.bg,
        border: "3px solid #0A0A0A",
        boxShadow: "5px 5px 0px #0A0A0A",
        padding: "14px 16px",
        minWidth: 300,
        maxWidth: 420,
        width: "100%",
        transform: visible ? "translateY(0) scale(1)" : "translateY(16px) scale(0.96)",
        opacity: visible ? 1 : 0,
        transition: "transform 0.22s cubic-bezier(0.34,1.56,0.64,1), opacity 0.18s ease",
        position: "relative",
      }}
    >
      {/* Top row: icon + title + close */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span style={{ fontSize: "1.1rem", flexShrink: 0, lineHeight: 1.3 }}>
          {style.icon}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: "0.9rem",
              color: style.textColor,
              lineHeight: 1.3,
              marginBottom: toast.body ? 3 : 0,
            }}
          >
            {toast.title}
          </p>
          {toast.body && (
            <p
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 500,
                fontSize: "0.78rem",
                color: style.textColor,
                opacity: 0.8,
                lineHeight: 1.45,
                wordBreak: "break-word",
              }}
            >
              {toast.body}
            </p>
          )}
        </div>
        <button
          onClick={() => onDismiss(toast.id)}
          aria-label="Dismiss"
          style={{
            background: "#0A0A0A",
            border: "none",
            color: style.bg,
            width: 24,
            height: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flexShrink: 0,
            fontWeight: 800,
            fontSize: "0.85rem",
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      {/* Explorer link */}
      {toast.explorerUrl && (
        <a
          href={toast.explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            marginTop: 6,
            fontFamily: "var(--font-mono)",
            fontWeight: 700,
            fontSize: "0.72rem",
            color: style.textColor,
            textDecoration: "underline",
            textUnderlineOffset: 2,
            opacity: 0.85,
          }}
        >
          View on Stellar Expert ↗
        </a>
      )}

      {/* Progress bar (shrinks over `duration` ms) */}
      <ProgressBar duration={toast.duration ?? 5000} color="#0A0A0A" bg={style.bg} />
    </div>
  );
}

// Thin progress bar that drains over the auto-dismiss duration
function ProgressBar({ duration, color, bg }: { duration: number; color: string; bg: string }) {
  const [width, setWidth] = useState(100);
  const startRef = useRef<number | null>(null);
  const rafRef   = useRef<number | null>(null);

  useEffect(() => {
    const tick = (ts: number) => {
      if (!startRef.current) startRef.current = ts;
      const pct = Math.max(0, 100 - ((ts - startRef.current) / duration) * 100);
      setWidth(pct);
      if (pct > 0) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [duration]);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: 3,
        background: `${color}22`,
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${width}%`,
          background: color,
          transition: "width 0.1s linear",
        }}
      />
    </div>
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────────

const MAX_TOASTS = 4;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((item: Omit<ToastItem, "id">) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const duration = item.duration ?? 5000;

    setToasts((prev) => {
      const next = [...prev, { ...item, id, duration }];
      // Cap at MAX_TOASTS — remove oldest first
      return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next;
    });

    // Auto-dismiss after duration
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration + 300); // +300 for exit animation
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}

      {/* ── Toast container ── */}
      <div
        aria-live="polite"
        aria-label="Notifications"
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          alignItems: "flex-end",
          pointerEvents: "none",
        }}
      >
        {toasts.map((t) => (
          <div key={t.id} style={{ pointerEvents: "auto" }}>
            <Toast toast={t} onDismiss={dismissToast} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
