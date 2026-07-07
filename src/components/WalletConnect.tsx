"use client";

/**
 * src/components/WalletConnect.tsx
 * Freighter wallet connect / disconnect button with balance display.
 */

import { useState } from "react";
import { useWallet } from "@/context/WalletContext";
import { truncateKey, formatXLM } from "@/lib/stellar";

// ─── Icons (inline SVG, zero dependencies) ────────────────────────────────────

const WalletIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/>
    <path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/>
    <path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>
  </svg>
);

const XIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const StarIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);

const AlertIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);

const RefreshIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <polyline points="23 4 23 10 17 10"/>
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
  </svg>
);

// ─── Component ────────────────────────────────────────────────────────────────

export default function WalletConnect() {
  const { status, publicKey, balance, error, connect, disconnect, refreshBalance } =
    useWallet();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showDisconnect, setShowDisconnect] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshBalance();
    setIsRefreshing(false);
  };

  // ── Disconnected state ───────────────────────────────────────────────────────
  if (status === "disconnected" || status === "error") {
    return (
      <div className="flex flex-col items-end gap-2">
        <button
          id="wallet-connect-btn"
          onClick={connect}
          className="btn-amber"
          aria-label="Connect Freighter Wallet"
        >
          <WalletIcon />
          Connect Wallet
        </button>

        {status === "error" && error && (
          <div className="error-banner animate-fade-in max-w-xs">
            <AlertIcon />
            <span>{error}</span>
          </div>
        )}
      </div>
    );
  }

  // ── Connecting state ─────────────────────────────────────────────────────────
  if (status === "connecting") {
    return (
      <button className="btn-amber" disabled aria-label="Connecting…">
        <div className="spinner" />
        Connecting…
      </button>
    );
  }

  // ── Connected state ──────────────────────────────────────────────────────────
  return (
    <div className="flex items-center gap-3 animate-fade-in">
      {/* XLM balance chip */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-xl"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        <StarIcon />
        <span style={{ color: "var(--sol-amber-glow)", fontWeight: 600, fontSize: "0.8125rem" }}>
          {balance ? formatXLM(balance.xlm) : "—"}
        </span>
        <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>XLM</span>
        <button
          id="wallet-refresh-btn"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="ml-1 opacity-50 hover:opacity-100 transition-opacity"
          aria-label="Refresh balance"
          style={{ color: "var(--text-secondary)" }}
        >
          <span
            style={{
              display: "inline-block",
              animation: isRefreshing ? "spin 0.7s linear infinite" : "none",
            }}
          >
            <RefreshIcon />
          </span>
        </button>
      </div>

      {/* Wallet address pill + disconnect */}
      <div className="relative">
        <button
          id="wallet-address-btn"
          className="wallet-pill"
          onClick={() => setShowDisconnect((v) => !v)}
          aria-label="Wallet options"
        >
          <span className="dot-live" />
          <span style={{ color: "var(--text-primary)", fontWeight: 500, fontFamily: "var(--font-mono)" }}>
            {truncateKey(publicKey ?? "", 6, 4)}
          </span>
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            style={{
              color: "var(--text-muted)",
              transform: showDisconnect ? "rotate(180deg)" : "none",
              transition: "transform 0.2s ease",
            }}
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>

        {/* Dropdown */}
        {showDisconnect && (
          <div
            className="absolute right-0 mt-2 glass-card animate-fade-in"
            style={{ minWidth: "160px", zIndex: 50 }}
          >
            <div className="p-2">
              <div
                className="px-3 py-2 mb-1 rounded-lg"
                style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}
              >
                Stellar Testnet
              </div>
              <div className="divider mb-2" />
              <button
                id="wallet-disconnect-btn"
                onClick={async () => {
                  setShowDisconnect(false);
                  await disconnect();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors"
                style={{
                  fontSize: "0.8125rem",
                  color: "#fca5a5",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLButtonElement).style.background =
                    "rgba(239,68,68,0.08)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLButtonElement).style.background =
                    "transparent")
                }
              >
                <XIcon />
                Disconnect
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
