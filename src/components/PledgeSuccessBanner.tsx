"use client";

/**
 * src/components/PledgeSuccessBanner.tsx
 *
 * Level 5 — Reusable post-pledge confirmation banner.
 *
 * Shows a neo-brutalist success notification immediately after a testnet pledge
 * is confirmed on-chain. Displays:
 *   - The pledged amount + asset
 *   - The full transaction hash (truncated with copy-to-clipboard)
 *   - A deep-link to Stellar Expert for public verification
 *   - An auto-dismiss countdown (default 12 s) with a manual close button
 *
 * Usage:
 *   <PledgeSuccessBanner txHash="abc123…" amount={100} asset="XLM" onDismiss={() => {}} />
 */

import { useEffect, useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PledgeSuccessBannerProps {
  /** Full Stellar transaction hash (64-char hex). */
  txHash: string;
  /** Pledged amount in stroops (raw i128 from Soroban). Will be formatted to XLM. */
  amountStroops: bigint | number;
  /** Asset symbol shown in the banner, e.g. "XLM" or "USDC". */
  asset: string;
  /** Called when user clicks × or the auto-dismiss timer expires. */
  onDismiss: () => void;
  /** Seconds before the banner auto-dismisses. Default: 12. */
  autoDismissSeconds?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STROOPS_PER_XLM = 10_000_000n;

function stroopsToXLM(stroops: bigint | number): string {
  const big = typeof stroops === "number" ? BigInt(Math.round(stroops)) : stroops;
  const whole = big / STROOPS_PER_XLM;
  const frac  = big % STROOPS_PER_XLM;
  if (frac === 0n) return whole.toString();
  return `${whole}.${frac.toString().padStart(7, "0").replace(/0+$/, "")}`;
}

function truncateHash(hash: string, head = 8, tail = 8): string {
  if (hash.length <= head + tail) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

const EXPLORER_BASE = "https://stellar.expert/explorer/testnet/tx/";

// ─── Icons ────────────────────────────────────────────────────────────────────

const CheckIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const CopyIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const ExternalIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

const XIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

// ─── Component ────────────────────────────────────────────────────────────────

export default function PledgeSuccessBanner({
  txHash,
  amountStroops,
  asset,
  onDismiss,
  autoDismissSeconds = 12,
}: PledgeSuccessBannerProps) {
  const [secondsLeft, setSecondsLeft] = useState(autoDismissSeconds);
  const [copied, setCopied]           = useState(false);

  // Auto-dismiss countdown
  useEffect(() => {
    if (secondsLeft <= 0) { onDismiss(); return; }
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [secondsLeft, onDismiss]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(txHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable in some environments — fail silently
    }
  }, [txHash]);

  const amountDisplay = stroopsToXLM(amountStroops);

  return (
    <div
      id="pledge-success-banner"
      role="status"
      aria-live="polite"
      className="animate-pop-in"
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 9999,
        maxWidth: 420,
        width: "calc(100vw - 48px)",
        background: "#B8FF47",
        border: "4px solid #0A0A0A",
        boxShadow: "6px 6px 0px #0A0A0A",
        padding: "20px 20px 16px",
        fontFamily: "var(--font-display)",
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
        {/* Check icon */}
        <div
          style={{
            flexShrink: 0,
            width: 36,
            height: 36,
            background: "#0A0A0A",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#B8FF47",
          }}
        >
          <CheckIcon />
        </div>

        {/* Text */}
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontWeight: 800,
              fontSize: "1rem",
              color: "#0A0A0A",
              lineHeight: 1.2,
              letterSpacing: "-0.02em",
            }}
          >
            Pledge Confirmed!
          </div>
          <div
            style={{
              fontWeight: 700,
              fontSize: "0.82rem",
              color: "rgba(10,10,10,0.65)",
              marginTop: 2,
            }}
          >
            {amountDisplay} {asset} locked in escrow on Stellar Testnet
          </div>
        </div>

        {/* Close + countdown */}
        <button
          id="pledge-success-close-btn"
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{
            flexShrink: 0,
            background: "rgba(10,10,10,0.12)",
            border: "2px solid rgba(10,10,10,0.25)",
            width: 28,
            height: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "#0A0A0A",
            position: "relative",
          }}
          title={`Auto-closes in ${secondsLeft}s`}
        >
          <XIcon />
          <span
            style={{
              position: "absolute",
              bottom: -8,
              right: -1,
              fontSize: "0.55rem",
              fontFamily: "var(--font-mono)",
              fontWeight: 700,
              color: "rgba(10,10,10,0.5)",
            }}
          >
            {secondsLeft}s
          </span>
        </button>
      </div>

      {/* Transaction hash row */}
      <div
        style={{
          background: "rgba(10,10,10,0.08)",
          border: "2px solid rgba(10,10,10,0.18)",
          padding: "8px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.72rem",
            fontWeight: 700,
            color: "#0A0A0A",
            letterSpacing: "0.02em",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {truncateHash(txHash)}
        </span>
        <button
          id="pledge-success-copy-btn"
          onClick={handleCopy}
          title="Copy full transaction hash"
          aria-label="Copy transaction hash"
          style={{
            flexShrink: 0,
            background: copied ? "#0A0A0A" : "transparent",
            border: "2px solid #0A0A0A",
            padding: "4px 8px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: "0.65rem",
            color: copied ? "#B8FF47" : "#0A0A0A",
            letterSpacing: "0.05em",
            transition: "background 0.15s, color 0.15s",
          }}
        >
          <CopyIcon /> {copied ? "COPIED!" : "COPY"}
        </button>
      </div>

      {/* Explorer deep-link */}
      <a
        id="pledge-success-explorer-link"
        href={`${EXPLORER_BASE}${txHash}`}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          fontWeight: 800,
          fontSize: "0.75rem",
          color: "#0A0A0A",
          textDecoration: "none",
          borderBottom: "2px solid rgba(10,10,10,0.4)",
          paddingBottom: 1,
          letterSpacing: "0.02em",
        }}
      >
        View on Stellar Expert <ExternalIcon />
      </a>

      {/* Progress bar auto-dismiss */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          height: 3,
          background: "#0A0A0A",
          width: `${(secondsLeft / autoDismissSeconds) * 100}%`,
          transition: "width 1s linear",
        }}
      />
    </div>
  );
}
