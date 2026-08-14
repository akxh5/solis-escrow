"use client";

/**
 * src/components/ConnectWalletPrompt.tsx
 *
 * Level 5 — Inline wallet-connect nudge for the Pledge Modal.
 *
 * Design intent:
 *   - Users can freely browse all escrow campaigns on the dashboard WITHOUT
 *     connecting a wallet (the explorer renders regardless of connection status).
 *   - Only when they click "Pledge" and open the modal is the wallet gate
 *     surfaced — and even then it is a soft CTA, not a hard block.
 *
 * This component is rendered inside PledgeModal when status !== "connected".
 * It replaces any blocking wallet-required guard with an inviting prompt that
 * shows campaign info and lets the user connect without closing the modal.
 *
 * Usage (inside PledgeModal when !isConnected):
 *   <ConnectWalletPrompt
 *     escrowTitle="Build Solis Escrow"
 *     goalAmount={50000}
 *     asset="XLM"
 *     onConnect={connect}
 *     isConnecting={status === "connecting"}
 *   />
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConnectWalletPromptProps {
  /** Title of the escrow campaign the user is trying to pledge to. */
  escrowTitle: string;
  /** Formatted goal amount string e.g. "50,000". */
  goalAmount: string | number;
  /** Asset symbol e.g. "XLM" or "USDC". */
  asset: string;
  /** Trigger the Freighter wallet connect flow. */
  onConnect: () => void;
  /** True while the connect handshake is in progress. */
  isConnecting?: boolean;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const WalletIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/>
    <path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/>
    <path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>
  </svg>
);

const LockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);

// ─── Component ────────────────────────────────────────────────────────────────

export default function ConnectWalletPrompt({
  escrowTitle,
  goalAmount,
  asset,
  onConnect,
  isConnecting = false,
}: ConnectWalletPromptProps) {
  return (
    <div
      id="connect-wallet-prompt"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 20,
        padding: "32px 24px",
        textAlign: "center",
      }}
    >
      {/* Campaign context — keeps the user anchored while they connect */}
      <div
        style={{
          background: "rgba(10,10,10,0.05)",
          border: "2px solid rgba(10,10,10,0.12)",
          padding: "10px 18px",
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: "0.8rem",
          color: "rgba(10,10,10,0.6)",
          letterSpacing: "0.02em",
          maxWidth: 320,
        }}
      >
        Pledging to:{" "}
        <span style={{ color: "#0A0A0A", fontWeight: 800 }}>{escrowTitle}</span>
        <span style={{ opacity: 0.5 }}>
          {" "}· Goal: {goalAmount} {asset}
        </span>
      </div>

      {/* Wallet icon */}
      <div
        style={{
          width: 64,
          height: 64,
          background: "#FFE600",
          border: "4px solid #0A0A0A",
          boxShadow: "4px 4px 0px #0A0A0A",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#0A0A0A",
        }}
      >
        <WalletIcon />
      </div>

      {/* Copy */}
      <div>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: "1.15rem",
            color: "#0A0A0A",
            letterSpacing: "-0.02em",
            marginBottom: 6,
          }}
        >
          Connect to Pledge
        </div>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: "0.85rem",
            color: "rgba(10,10,10,0.55)",
            maxWidth: 280,
            lineHeight: 1.55,
          }}
        >
          You need a Freighter wallet to pledge. The campaign info above stays
          visible so you don&apos;t lose your place.
        </div>
      </div>

      {/* CTA button */}
      <button
        id="connect-wallet-prompt-btn"
        onClick={onConnect}
        disabled={isConnecting}
        className="btn-brutal btn-yellow"
        style={{ fontSize: "0.9rem", padding: "12px 28px", width: "100%", maxWidth: 280 }}
        aria-label="Connect Freighter Wallet to pledge"
      >
        {isConnecting ? (
          <>
            <span className="spinner-brutal" /> Connecting…
          </>
        ) : (
          <>
            <WalletIcon /> Connect Freighter
          </>
        )}
      </button>

      {/* Trust note */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: "0.7rem",
          color: "rgba(10,10,10,0.4)",
          letterSpacing: "0.04em",
        }}
      >
        <LockIcon />
        NON-CUSTODIAL · YOUR KEYS STAY WITH YOU
      </div>
    </div>
  );
}
