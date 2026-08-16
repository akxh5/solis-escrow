"use client";

/**
 * src/components/NavActions.tsx
 *
 * Client component for the interactive right-side navbar actions.
 * Keeps page.tsx as a pure Server Component while enabling the ⚡ Swap
 * button + SwapModal which require useState and the WalletContext.
 */

import { useState } from "react";
import { useWallet } from "@/context/WalletContext";
import SwapModal from "./SwapModal";
import WalletConnect from "./WalletConnect";

// ─── Component ────────────────────────────────────────────────────────────────

export default function NavActions() {
  const { status, publicKey, balance } = useWallet();
  const [swapOpen, setSwapOpen] = useState(false);

  const isConnected = status === "connected" && !!publicKey;
  const xlmBalance = balance?.xlm ?? "0";

  return (
    <>
      {/* ── Desktop nav links + swap button ── */}
      <div
        className="hidden md:flex items-center gap-2"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {["Explorer", "How it Works", "Docs"].map((label) => (
          <a
            key={label}
            href="#"
            className="nav-link"
          >
            {label}
          </a>
        ))}

        {/* ⚡ Swap button — always visible, prompts wallet connect if not connected */}
        <button
          id="nav-swap-btn"
          onClick={() => setSwapOpen(true)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: isConnected ? "#FFE600" : "rgba(255,230,0,0.12)",
            color: isConnected ? "#0A0A0A" : "#FFE600",
            border: `2px solid ${isConnected ? "#FFE600" : "rgba(255,230,0,0.35)"}`,
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: "0.8rem",
            letterSpacing: "0.04em",
            padding: "8px 16px",
            cursor: "pointer",
            transition: "all 0.15s ease",
            whiteSpace: "nowrap",
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget;
            el.style.transform = "translate(-2px, -2px)";
            el.style.boxShadow = isConnected
              ? "3px 3px 0px #0A0A0A"
              : "3px 3px 0px rgba(255,230,0,0.3)";
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget;
            el.style.transform = "translate(0, 0)";
            el.style.boxShadow = "none";
          }}
        >
          ⚡ Swap XLM → USDC
        </button>
      </div>

      {/* ── Wallet connect ── */}
      <WalletConnect />

      {/* ── Swap Modal (only mount when connected — needs publicKey) ── */}
      {isConnected ? (
        <SwapModal
          isOpen={swapOpen}
          onClose={() => setSwapOpen(false)}
          publicKey={publicKey}
          xlmBalance={xlmBalance}
        />
      ) : (
        swapOpen && (
          <div
            className="modal-overlay animate-fade-in"
            role="dialog"
            aria-modal="true"
            onClick={(e) => {
              if (e.target === e.currentTarget) setSwapOpen(false);
            }}
          >
            <div
              className="animate-pop-in"
              style={{
                background: "#FFF",
                border: "4px solid #0A0A0A",
                boxShadow: "10px 10px 0px #0A0A0A",
                padding: "32px 28px",
                maxWidth: 400,
                textAlign: "center",
                width: "100%",
              }}
            >
              <div style={{ fontSize: "2.5rem", marginBottom: 16, lineHeight: 1 }}>⚡</div>
              <h3
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 800,
                  fontSize: "1.3rem",
                  letterSpacing: "-0.02em",
                  marginBottom: 10,
                }}
              >
                Connect Wallet to Swap
              </h3>
              <p
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.82rem",
                  color: "rgba(10,10,10,0.55)",
                  marginBottom: 24,
                  lineHeight: 1.6,
                }}
              >
                Connect your Freighter wallet to swap XLM to USDC via the Stellar DEX.
              </p>
              <button
                onClick={() => setSwapOpen(false)}
                style={{
                  background: "#0A0A0A",
                  color: "#FFE600",
                  border: "3px solid #0A0A0A",
                  fontFamily: "var(--font-display)",
                  fontWeight: 800,
                  fontSize: "0.85rem",
                  padding: "10px 28px",
                  cursor: "pointer",
                  letterSpacing: "0.05em",
                }}
              >
                CLOSE
              </button>
            </div>
          </div>
        )
      )}
    </>
  );
}
