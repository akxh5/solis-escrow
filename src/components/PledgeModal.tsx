"use client";

/**
 * src/components/PledgeModal.tsx
 *
 * Fully operational pledge modal wired to:
 *   - useWallet()      — wallet status, publicKey, XLM balance
 *   - useEscrows()     — optimistic card update on success
 *   - useToast()       — success / rejection / error toasts
 *   - pledgeToEscrow() — Soroban V2 contract invocation via Freighter
 *
 * Transaction pipeline:
 *   building → signing (Freighter popup) → submitting → confirming
 *
 * On success  → onSuccess() fires, escrow state updates, green toast shown.
 * On reject   → warning toast "Transaction rejected in Freighter."
 * On error    → red toast with decoded contract error message.
 */

import { useState, useCallback, useRef } from "react";
import { useWallet } from "@/context/WalletContext";
import { useEscrows } from "@/context/EscrowContext";
import { useToast } from "@/context/ToastContext";
import {
  pledgeToEscrow,
  validatePledgeAmount,
  formatXLM,
  type PledgeResult,
  type AssetType,
} from "@/lib/stellar";
import type { EscrowListing, AssetSymbol } from "@/lib/escrowTypes";
import { formatAmount, truncateWallet } from "@/lib/escrowTypes";

// ─── Icons ────────────────────────────────────────────────────────────────────

const XIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const ExternalLinkIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
    <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
  </svg>
);

const AlertIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);

const WalletIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/>
    <path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/>
    <path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>
  </svg>
);

// ─── Tx pipeline ──────────────────────────────────────────────────────────────

type TxStep = "idle" | "building" | "signing" | "submitting" | "confirming";

const STEP_META: Record<TxStep, { label: string; hint: string }> = {
  idle:       { label: "Pledge Now",                  hint: ""                                    },
  building:   { label: "Building Transaction…",       hint: "Assembling Soroban call"             },
  signing:    { label: "Sign in Freighter…",           hint: "Approve the popup in your wallet"   },
  submitting: { label: "Submitting to RPC…",           hint: "Sending to Soroban RPC node"        },
  confirming: { label: "Awaiting Confirmation…",      hint: "Polling ledger for finality"         },
};

// ─── Accent map ───────────────────────────────────────────────────────────────

const ACCENT_BG: Record<string, string> = {
  yellow: "#FFE600",
  cyan:   "#00F5FF",
  pink:   "#FF2D78",
  lime:   "#B8FF47",
  orange: "#FF6B1A",
};

// ─── Component ────────────────────────────────────────────────────────────────

interface PledgeModalProps {
  escrow: EscrowListing;
  onClose: () => void;
  /** Called with the PledgeResult on successful on-chain confirmation. */
  onSuccess: (result: PledgeResult, amount: number, asset: AssetSymbol) => void;
}

export default function PledgeModal({ escrow, onClose, onSuccess }: PledgeModalProps) {
  // ── Context hooks ──────────────────────────────────────────────────────
  const { status, publicKey, balance, refreshBalance, connect } = useWallet();
  const { updateEscrowAfterPledge } = useEscrows();
  const { showToast } = useToast();

  const isConnected = status === "connected";
  const isRestoring = status === "restoring";

  // ── Local state ────────────────────────────────────────────────────────
  const [amount,          setAmount]          = useState("");
  const [selectedAsset,   setSelectedAsset]   = useState<AssetType>(escrow.assetSymbol as AssetType);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [txStep,          setTxStep]          = useState<TxStep>("idle");
  const [txResult,        setTxResult]        = useState<PledgeResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isBusy     = txStep !== "idle";
  const xlmBalance = balance?.xlm ?? "0";
  const maxAvail   = Math.max(0, parseFloat(xlmBalance) - 2).toFixed(2);
  const accentHex  = ACCENT_BG[escrow.accentColor] ?? "#FFE600";
  const accentText = (escrow.accentColor === "pink" || escrow.accentColor === "orange") ? "#FFF" : "#0A0A0A";

  const pledgeDisabled =
    !isConnected || isBusy || !!validationError || !amount.trim();

  // ── Amount handling ────────────────────────────────────────────────────
  const handleAmountChange = useCallback((val: string) => {
    setAmount(val);
    setTxResult(null);
    setValidationError(val && isConnected ? validatePledgeAmount(val, xlmBalance, selectedAsset) : null);
  }, [isConnected, xlmBalance, selectedAsset]);

  const handleQuickSelect = useCallback((amt: number) => {
    const val = String(amt);
    setAmount(val);
    setTxResult(null);
    setValidationError(validatePledgeAmount(val, xlmBalance, selectedAsset));
    inputRef.current?.focus();
  }, [xlmBalance, selectedAsset]);

  const handleAssetChange = useCallback((asset: AssetType) => {
    setSelectedAsset(asset);
    setTxResult(null);
    setValidationError(amount ? validatePledgeAmount(amount, xlmBalance, asset) : null);
  }, [amount, xlmBalance]);

  // ── Main pledge handler ────────────────────────────────────────────────
  const handlePledge = useCallback(async () => {
    if (!isConnected || !publicKey) return;

    const err = validatePledgeAmount(amount, xlmBalance, selectedAsset);
    if (err) { setValidationError(err); inputRef.current?.focus(); return; }

    setTxResult(null);
    setValidationError(null);

    try {
      // ── Step 1: Build ─────────────────────────────────────────────────
      setTxStep("building");
      await new Promise((r) => setTimeout(r, 120)); // small pause for UX

      // ── Step 2: Sign (Freighter popup) ───────────────────────────────
      setTxStep("signing");

      const resultPromise = pledgeToEscrow(publicKey, amount, selectedAsset);

      // Advance progress bar optimistically while Freighter resolves
      const submitTimer  = setTimeout(() => setTxStep("submitting"), 4_500);
      const confirmTimer = setTimeout(() => setTxStep("confirming"), 9_000);

      const result = await resultPromise;

      clearTimeout(submitTimer);
      clearTimeout(confirmTimer);

      // ── Success path ─────────────────────────────────────────────────
      setTxResult(result);
      setTxStep("idle");

      const pledgedNum = parseFloat(amount);

      // 1. Optimistically update the escrow card in global state
      updateEscrowAfterPledge(escrow.id, pledgedNum, selectedAsset as AssetSymbol);

      // 2. Refresh wallet balance
      await refreshBalance();

      // 3. Fire success toast
      showToast({
        type:        "success",
        title:       `${selectedAsset} pledge confirmed! 🎉`,
        body:        `${amount} ${selectedAsset} → ${escrow.title}`,
        explorerUrl: result.explorerUrl,
        duration:    7000,
      });

      // 4. Notify parent (EscrowCard) to show its inline success state
      onSuccess(result, pledgedNum, selectedAsset as AssetSymbol);

    } catch (err: unknown) {
      setTxStep("idle");

      const raw = err instanceof Error ? err.message : "An unexpected error occurred.";
      const lc  = raw.toLowerCase();

      // Distinguish user rejection from real contract / RPC errors
      const isRejection =
        lc.includes("rejected") ||
        lc.includes("declined") ||
        lc.includes("cancel")   ||
        lc.includes("user denied");

      if (isRejection) {
        showToast({
          type:  "warning",
          title: "Transaction rejected",
          body:  "You cancelled the Freighter signing request.",
        });
      } else {
        showToast({
          type:     "error",
          title:    "Transaction failed",
          body:     raw,
          duration: 8000,
        });
      }
    }
  }, [
    isConnected, publicKey, amount, xlmBalance, selectedAsset,
    escrow.id, escrow.title,
    updateEscrowAfterPledge, refreshBalance, showToast, onSuccess,
  ]);

  // ── Pipeline steps display ─────────────────────────────────────────────
  const pipelineSteps: TxStep[] = ["building", "signing", "submitting", "confirming"];
  const activeIdx = pipelineSteps.indexOf(txStep);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      className="modal-overlay animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget && !isBusy) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={`Pledge to ${escrow.title}`}
    >
      <div
        className="animate-pop-in"
        style={{
          background: "#FFF",
          border: "4px solid #0A0A0A",
          boxShadow: "10px 10px 0px #0A0A0A",
          width: "100%",
          maxWidth: 520,
          maxHeight: "92vh",
          overflowY: "auto",
          position: "relative",
        }}
      >
        {/* ── Accent header ── */}
        <div
          style={{
            background: accentHex,
            borderBottom: "4px solid #0A0A0A",
            padding: "16px 20px",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                fontSize: "0.68rem",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: accentText,
                opacity: 0.65,
                marginBottom: 4,
              }}
            >
              Pledge to Escrow
            </p>
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                fontSize: "1.05rem",
                color: accentText,
                letterSpacing: "-0.02em",
                lineHeight: 1.25,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {escrow.title}
            </h2>
          </div>
          <button
            id="pledge-modal-close"
            onClick={onClose}
            disabled={isBusy}
            aria-label="Close modal"
            style={{
              background: "#0A0A0A",
              color: "#FFF",
              border: "none",
              width: 36,
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: isBusy ? "not-allowed" : "pointer",
              flexShrink: 0,
              opacity: isBusy ? 0.4 : 1,
            }}
          >
            <XIcon />
          </button>
        </div>

        <div style={{ padding: "20px" }}>

          {/* ── Contract + creator info ── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 0,
              border: "2px solid #0A0A0A",
              marginBottom: 16,
            }}
          >
            <div style={{ padding: "10px 14px", borderRight: "2px solid #0A0A0A" }}>
              <p style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.5, marginBottom: 3 }}>Contract</p>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", fontWeight: 700, wordBreak: "break-all" }}>
                {truncateWallet(escrow.contractId, 8, 6)}
              </p>
            </div>
            <div style={{ padding: "10px 14px" }}>
              <p style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.5, marginBottom: 3 }}>Goal</p>
              <p style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "1rem" }}>
                {formatAmount(escrow.goalAmount, escrow.assetSymbol)}
              </p>
            </div>
          </div>

          {/* ── Funding progress recap ── */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontWeight: 700, fontSize: "0.8rem" }}>
                {escrow.fundingPct.toFixed(1)}% funded
              </span>
              <span style={{ fontWeight: 700, fontSize: "0.8rem", fontFamily: "var(--font-mono)" }}>
                {formatAmount(escrow.pledgedTotal, escrow.assetSymbol)} raised
              </span>
            </div>
            <div className="brutal-progress-track">
              <div
                className="brutal-progress-fill"
                style={{ width: `${Math.min(escrow.fundingPct, 100)}%`, background: accentHex, transition: "width 0.5s ease" }}
              />
            </div>
          </div>

          {/* ── Not connected callout ── */}
          {!isConnected && !isRestoring && (
            <div
              style={{
                background: "#FFE600",
                border: "3px solid #0A0A0A",
                padding: "12px 16px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 16,
              }}
            >
              <WalletIcon />
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 800, fontSize: "0.85rem", marginBottom: 2 }}>
                  Wallet not connected
                </p>
                <p style={{ fontWeight: 600, fontSize: "0.75rem", opacity: 0.7 }}>
                  Connect Freighter to pledge to this escrow.
                </p>
              </div>
              <button
                onClick={connect}
                className="btn-brutal btn-black"
                style={{ fontSize: "0.78rem", padding: "7px 12px", flexShrink: 0 }}
              >
                Connect
              </button>
            </div>
          )}

          {/* ── Asset selector ── */}
          <div style={{ marginBottom: 14 }}>
            <p style={{ fontWeight: 700, fontSize: "0.75rem", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
              Asset
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              {(["XLM", "USDC"] as AssetType[]).map((asset) => (
                <button
                  key={asset}
                  onClick={() => handleAssetChange(asset)}
                  disabled={isBusy}
                  aria-pressed={selectedAsset === asset}
                  className="btn-brutal"
                  style={{
                    flex: 1,
                    background: selectedAsset === asset ? "#0A0A0A" : "#FFF",
                    color:      selectedAsset === asset ? "#FFE600" : "#0A0A0A",
                    fontSize: "0.85rem",
                    padding: "8px 12px",
                  }}
                >
                  {asset === "XLM" ? "✦ XLM" : "$ USDC"}
                </button>
              ))}
            </div>
            {selectedAsset === "USDC" && (
              <p
                style={{
                  marginTop: 8,
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  padding: "7px 10px",
                  background: "rgba(0,245,255,0.08)",
                  border: "2px solid rgba(0,245,255,0.3)",
                  color: "#0A0A0A",
                  opacity: 0.8,
                }}
              >
                ℹ️ USDC requires an active trustline in Freighter. Ensure your testnet account holds USDC before pledging.
              </p>
            )}
          </div>

          {/* ── Amount input ── */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <label
                htmlFor="modal-pledge-amount"
                style={{ fontWeight: 700, fontSize: "0.75rem", letterSpacing: "0.08em", textTransform: "uppercase" }}
              >
                Amount ({selectedAsset})
              </label>
              {isConnected && selectedAsset === "XLM" && (
                <button
                  onClick={() => handleQuickSelect(parseFloat(maxAvail))}
                  disabled={isBusy || parseFloat(maxAvail) <= 0}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontWeight: 800,
                    fontSize: "0.75rem",
                    color: "#0A0A0A",
                    textDecoration: "underline",
                    textUnderlineOffset: 2,
                    padding: 0,
                  }}
                >
                  Max: {formatXLM(maxAvail, 2)} XLM
                </button>
              )}
            </div>

            <input
              id="modal-pledge-amount"
              ref={inputRef}
              type="number"
              placeholder={selectedAsset === "USDC" ? "e.g. 10" : "e.g. 50"}
              min="1"
              step="any"
              value={amount}
              onChange={(e) => handleAmountChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !pledgeDisabled && handlePledge()}
              disabled={!isConnected || isBusy}
              className="brutal-input"
              aria-invalid={!!validationError}
              style={{
                boxShadow: validationError
                  ? "5px 5px 0px #FF2D78"
                  : amount && !validationError && isConnected
                  ? `5px 5px 0px ${accentHex}`
                  : "var(--nb-shadow-sm)",
              }}
            />

            {validationError && (
              <p
                className="animate-fade-in"
                role="alert"
                style={{ marginTop: 6, fontSize: "0.78rem", fontWeight: 700, color: "#FF2D78", display: "flex", alignItems: "center", gap: 6 }}
              >
                <AlertIcon /> {validationError}
              </p>
            )}
          </div>

          {/* ── Quick-select amounts ── */}
          <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
            {(selectedAsset === "USDC" ? [5, 10, 25] : [50, 200, 500]).map((amt) => (
              <button
                key={amt}
                onClick={() => handleQuickSelect(amt)}
                disabled={!isConnected || isBusy}
                className="btn-brutal btn-white"
                style={{ flex: 1, padding: "7px 4px", fontSize: "0.78rem" }}
              >
                {amt}
              </button>
            ))}
          </div>

          {/* ── Tx pipeline progress ── */}
          {isBusy && (
            <div
              className="animate-fade-in"
              style={{
                background: "#F5F5F0",
                border: "3px solid #0A0A0A",
                padding: "14px",
                marginBottom: 16,
              }}
            >
              {/* Step bars */}
              <div style={{ display: "flex", gap: 0, marginBottom: 8 }}>
                {pipelineSteps.map((s, i) => {
                  const done   = i < activeIdx;
                  const active = i === activeIdx;
                  return (
                    <div key={s} style={{ flex: 1 }}>
                      <div
                        style={{
                          height: 5,
                          background: done ? "#0A0A0A" : active ? accentHex : "rgba(10,10,10,0.12)",
                          borderRight: i < pipelineSteps.length - 1 ? "2px solid #FFF" : "none",
                          transition: "background 0.3s",
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              {/* Step labels */}
              <div style={{ display: "flex", gap: 0 }}>
                {pipelineSteps.map((s, i) => {
                  const done   = i < activeIdx;
                  const active = i === activeIdx;
                  return (
                    <div
                      key={s}
                      style={{
                        flex: 1,
                        textAlign: "center",
                        fontSize: "0.55rem",
                        fontWeight: 800,
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                        color: (done || active) ? "#0A0A0A" : "rgba(10,10,10,0.3)",
                        transition: "color 0.2s",
                      }}
                    >
                      {s}
                    </div>
                  );
                })}
              </div>

              {/* Current step hint */}
              <p style={{ textAlign: "center", marginTop: 10, fontSize: "0.78rem", fontWeight: 700, opacity: 0.6 }}>
                {STEP_META[txStep].hint}
              </p>
            </div>
          )}

          {/* ── CTA button ── */}
          {!txResult && (
            <button
              id="modal-pledge-btn"
              onClick={handlePledge}
              disabled={pledgeDisabled}
              className="btn-brutal"
              aria-busy={isBusy}
              style={{
                width: "100%",
                background: pledgeDisabled ? "#E5E5E0" : "#0A0A0A",
                color:      pledgeDisabled ? "rgba(10,10,10,0.35)" : accentHex,
                fontSize: "1rem",
                fontWeight: 800,
                padding: "14px 20px",
                letterSpacing: "0.04em",
                justifyContent: "center",
              }}
            >
              {isBusy ? (
                <>
                  <span className="spinner-brutal spinner-white" />
                  {STEP_META[txStep].label}
                </>
              ) : isRestoring ? (
                <>
                  <span className="spinner-brutal spinner-white" />
                  Restoring session…
                </>
              ) : !isConnected ? (
                "Connect Wallet to Pledge"
              ) : (
                `⚡ Pledge ${amount ? `${amount} ${selectedAsset}` : "Now"}`
              )}
            </button>
          )}

          {/* ── Success state ── */}
          {txResult && (
            <div
              className="animate-pop-in"
              style={{
                background: "#B8FF47",
                border: "4px solid #0A0A0A",
                padding: "24px 20px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  background: "#0A0A0A",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 12px",
                  color: "#B8FF47",
                }}
              >
                <CheckIcon />
              </div>
              <p style={{ fontWeight: 800, fontSize: "1.1rem", marginBottom: 6 }}>
                Pledge Confirmed! 🎉
              </p>
              <p style={{ fontWeight: 600, fontSize: "0.82rem", opacity: 0.7, marginBottom: 16 }}>
                {amount} {selectedAsset} → {escrow.title}
              </p>
              <a
                href={txResult.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-brutal btn-black"
                style={{ display: "inline-flex", gap: 6, fontSize: "0.85rem" }}
              >
                View on Stellar Expert <ExternalLinkIcon />
              </a>
            </div>
          )}

          {/* Footer note */}
          {!txResult && (
            <p style={{ textAlign: "center", fontSize: "0.68rem", fontWeight: 600, opacity: 0.4, marginTop: 14 }}>
              🔒 Secured by Soroban Contract {truncateWallet(escrow.contractId, 6, 4)} · Stellar Testnet
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
