"use client";

/**
 * src/components/WalletConnect.tsx
 * Neo-Brutalist wallet connect / disconnect button with balance display.
 */

import { useState } from "react";
import { useWallet } from "@/context/WalletContext";
import { truncateKey, formatXLM } from "@/lib/stellar";

// ─── Icons ────────────────────────────────────────────────────────────────────

const WalletIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/>
    <path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/>
    <path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>
  </svg>
);

const XIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const AlertIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);

const RefreshIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
  </svg>
);

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg
    width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="3" strokeLinecap="round"
    style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
  >
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);

// ─── Component ────────────────────────────────────────────────────────────────

export default function WalletConnect() {
  const { status, publicKey, balance, error, connect, disconnect, refreshBalance } = useWallet();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshBalance();
    setIsRefreshing(false);
  };

  // ── Disconnected / error ──────────────────────────────────────────────────
  if (status === "disconnected" || status === "error") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
        <button
          id="wallet-connect-btn"
          onClick={connect}
          className="btn-brutal btn-yellow"
          style={{ fontSize: "0.82rem", padding: "9px 16px" }}
          aria-label="Connect Freighter Wallet"
        >
          <WalletIcon /> Connect Wallet
        </button>
        {status === "error" && error && (
          <div
            className="animate-fade-in"
            style={{
              background: "#FF2D78",
              border: "3px solid #0A0A0A",
              boxShadow: "3px 3px 0px #0A0A0A",
              padding: "8px 12px",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: "0.75rem",
              fontWeight: 700,
              color: "#FFF",
              maxWidth: 240,
            }}
          >
            <AlertIcon /><span>{error}</span>
          </div>
        )}
      </div>
    );
  }

  // ── Connecting ────────────────────────────────────────────────────────────
  if (status === "connecting") {
    return (
      <button
        className="btn-brutal btn-yellow"
        disabled
        style={{ fontSize: "0.82rem", padding: "9px 16px" }}
        aria-label="Connecting…"
      >
        <span className="spinner-brutal" /> Connecting…
      </button>
    );
  }

  // ── Connected ─────────────────────────────────────────────────────────────
  return (
    <div className="flex items-center gap-2 animate-fade-in" style={{ position: "relative" }}>
      {/* Balance chip */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "#FFE600",
          border: "3px solid #0A0A0A",
          boxShadow: "3px 3px 0px #0A0A0A",
          padding: "7px 12px",
          fontFamily: "var(--font-mono)",
          fontWeight: 700,
          fontSize: "0.82rem",
        }}
      >
        <span>✦</span>
        <span>{balance ? formatXLM(balance.xlm, 2) : "—"}</span>
        <span style={{ opacity: 0.6, fontWeight: 600 }}>XLM</span>
        <button
          id="wallet-refresh-btn"
          onClick={handleRefresh}
          disabled={isRefreshing}
          aria-label="Refresh balance"
          style={{
            background: "none",
            border: "none",
            cursor: isRefreshing ? "default" : "pointer",
            display: "flex",
            alignItems: "center",
            opacity: isRefreshing ? 0.5 : 0.7,
            padding: 0,
          }}
        >
          <span style={{ display: "inline-block", animation: isRefreshing ? "spin 0.65s linear infinite" : "none" }}>
            <RefreshIcon />
          </span>
        </button>
      </div>

      {/* Address pill + dropdown */}
      <button
        id="wallet-address-btn"
        className="wallet-pill-brutal"
        onClick={() => setShowDropdown((v) => !v)}
        aria-label="Wallet options"
        aria-expanded={showDropdown}
      >
        <span className="dot-live" />
        <span>{truncateKey(publicKey ?? "", 6, 4)}</span>
        <ChevronIcon open={showDropdown} />
      </button>

      {/* Dropdown */}
      {showDropdown && (
        <div
          className="animate-fade-in"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            background: "#FFF",
            border: "3px solid #0A0A0A",
            boxShadow: "5px 5px 0px #0A0A0A",
            minWidth: 180,
            zIndex: 50,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "10px 14px",
              borderBottom: "2px solid #0A0A0A",
              fontFamily: "var(--font-mono)",
              fontSize: "0.72rem",
              fontWeight: 700,
              background: "#F5F5F0",
              wordBreak: "break-all",
            }}
          >
            {publicKey?.slice(0, 12)}…{publicKey?.slice(-6)}
          </div>
          <div style={{ padding: "8px" }}>
            <div
              style={{
                padding: "6px 10px",
                fontSize: "0.72rem",
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                opacity: 0.4,
                marginBottom: 4,
              }}
            >
              Stellar Testnet
            </div>
            <button
              id="wallet-disconnect-btn"
              onClick={async () => {
                setShowDropdown(false);
                await disconnect();
              }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "9px 10px",
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: "0.82rem",
                color: "#FF2D78",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                transition: "background 0.1s",
                letterSpacing: "0.02em",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,45,120,0.08)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <XIcon /> Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
