"use client";

/**
 * src/components/BountyCard.tsx
 *
 * Yellow Belt — fixed UI state issues:
 *  1. isRestoring: while WalletContext is silently re-connecting on refresh,
 *     the Pledge button shows a subtle "Restoring session…" state instead of
 *     a dead "Connect Wallet" label, preventing false-locked appearance.
 *  2. ContractBadge: three distinct states driven by getContractIdStatus():
 *       • "placeholder" → amber  "Contract not deployed"
 *       • "invalid"     → red    "Invalid Contract ID format"
 *       • "valid"       → green  truncated ID pill, button unlocked
 *  3. Button disable conditions — ONLY disabled when:
 *       A) wallet disconnected (or restoring)
 *       B) amount is empty or fails validation
 *       C) transaction is actively in-flight
 *       D) contract ID is not "valid"
 */

import { useState, useCallback, useRef } from "react";
import { useWallet } from "@/context/WalletContext";
import {
  pledgeToEscrow,
  validatePledgeAmount,
  formatXLM,
  ESCROW_CONTRACT_ID,
  CONTRACT_ERRORS,
  getContractIdStatus,
  type PledgeResult,
} from "@/lib/stellar";

// ─── Icons ────────────────────────────────────────────────────────────────────

const ShieldIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    <polyline points="9 12 11 14 15 10"/>
  </svg>
);

const LockIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);

const UsersIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

const ClockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </svg>
);

const ArrowIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/>
    <polyline points="12 5 19 12 12 19"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
    <polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
);

const AlertIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);

const ContractErrorIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);

const ExternalLinkIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
    <polyline points="15 3 21 3 21 9"/>
    <line x1="10" y1="14" x2="21" y2="3"/>
  </svg>
);

const XIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const CodeIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 18 22 12 16 6"/>
    <polyline points="8 6 2 12 8 18"/>
  </svg>
);

// ─── Tx pipeline ──────────────────────────────────────────────────────────────

type TxStep = "idle" | "building" | "signing" | "submitting" | "confirming";

const STEP_LABELS: Record<TxStep, string> = {
  idle:       "Pledge to Bounty",
  building:   "Building Transaction…",
  signing:    "Waiting for Freighter…",
  submitting: "Submitting to Soroban RPC…",
  confirming: "Awaiting On-Chain Confirmation…",
};

// ─── Contract error detection ─────────────────────────────────────────────────

function isContractError(msg: string): boolean {
  return (
    Object.values(CONTRACT_ERRORS).some((v) => msg.includes(v)) ||
    /contract error( code)? #?\d+/i.test(msg)
  );
}

// ─── Tx progress bar ──────────────────────────────────────────────────────────

function TxProgress({ step }: { step: TxStep }) {
  const steps: TxStep[] = ["building", "signing", "submitting", "confirming"];
  const idx = steps.indexOf(step);
  if (step === "idle") return null;

  return (
    <div className="flex items-start gap-1.5 w-full">
      {steps.map((s, i) => {
        const done   = i < idx;
        const active = i === idx;
        return (
          <div key={s} className="flex-1 flex flex-col items-center gap-1">
            <div
              className="w-full rounded-full transition-all duration-500"
              style={{
                height: "3px",
                background: done
                  ? "var(--sol-amber)"
                  : active
                  ? "linear-gradient(90deg, var(--sol-amber) 0%, rgba(245,158,11,0.25) 100%)"
                  : "rgba(255,255,255,0.07)",
              }}
            />
            <span style={{
              fontSize: "0.5625rem",
              color: done || active ? "var(--sol-amber-glow)" : "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              textAlign: "center",
              lineHeight: 1.2,
              transition: "color 0.3s",
            }}>
              {s}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Contract badge — 3 states ────────────────────────────────────────────────

/**
 * Computes once at module load time (constant for the lifetime of the page).
 * Re-evaluated on hot-reload when stellar.ts changes.
 */
const CONTRACT_STATUS = getContractIdStatus(ESCROW_CONTRACT_ID);

function ContractBadge() {
  if (CONTRACT_STATUS === "placeholder") {
    return (
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
        style={{
          background: "rgba(251,191,36,0.07)",
          border: "1px solid rgba(251,191,36,0.2)",
          fontSize: "0.6875rem",
          color: "#fcd34d",
        }}
      >
        <CodeIcon />
        <span style={{ fontFamily: "var(--font-mono)" }}>
          Contract not deployed — paste ID into stellar.ts
        </span>
      </div>
    );
  }

  if (CONTRACT_STATUS === "invalid") {
    return (
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
        style={{
          background: "rgba(239,68,68,0.07)",
          border: "1px solid rgba(239,68,68,0.25)",
          fontSize: "0.6875rem",
          color: "#f87171",
        }}
      >
        <AlertIcon />
        <span style={{ fontFamily: "var(--font-mono)" }}>
          Invalid Contract ID — must be 56-char C… strkey
        </span>
      </div>
    );
  }

  // "valid"
  return (
    <div
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
      style={{
        background: "rgba(34,197,94,0.05)",
        border: "1px solid rgba(34,197,94,0.15)",
        fontSize: "0.6875rem",
        color: "#4ade80",
      }}
    >
      <CodeIcon />
      <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
        {ESCROW_CONTRACT_ID.slice(0, 8)}…{ESCROW_CONTRACT_ID.slice(-6)}
      </span>
      <span style={{ color: "#4ade80", marginLeft: "2px" }}>✓</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BountyCard() {
  const { status, publicKey, balance, refreshBalance, isRestoring } = useWallet();

  const isConnected = status === "connected";
  // Block the button while we're trying to silently restore a session,
  // but do NOT treat this as an error or show a confusing "Connect Wallet" label.
  const isWalletReady = isConnected && !isRestoring;
  const contractReady = CONTRACT_STATUS === "valid";

  const [amount,          setAmount]          = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [txStep,          setTxStep]          = useState<TxStep>("idle");
  const [txResult,        setTxResult]        = useState<PledgeResult | null>(null);
  const [txError,         setTxError]         = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isBusy     = txStep !== "idle";
  const xlmBalance = balance?.xlm ?? "0";
  const maxAvail   = Math.max(0, parseFloat(xlmBalance) - 2).toFixed(4);

  // ── Pledge button disabled condition ─────────────────────────────────────────
  // ONLY disabled for: A) wallet not ready  B) invalid input  C) busy  D) bad contract
  const pledgeDisabled =
    !isWalletReady ||
    isBusy         ||
    !!validationError ||
    !amount.trim() ||
    !contractReady;

  // ── Amount handling ───────────────────────────────────────────────────────────
  const handleAmountChange = useCallback((val: string) => {
    setAmount(val);
    setTxResult(null);
    setTxError(null);
    setValidationError(val && isConnected ? validatePledgeAmount(val, xlmBalance) : null);
  }, [isConnected, xlmBalance]);

  const handleQuickSelect = useCallback((amt: number) => {
    const val = amt.toString();
    setAmount(val);
    setTxResult(null);
    setTxError(null);
    setValidationError(validatePledgeAmount(val, xlmBalance));
    inputRef.current?.focus();
  }, [xlmBalance]);

  // ── Submit ────────────────────────────────────────────────────────────────────
  const handlePledge = useCallback(async () => {
    if (!isWalletReady || !publicKey || !contractReady) return;

    const err = validatePledgeAmount(amount, xlmBalance);
    if (err) { setValidationError(err); inputRef.current?.focus(); return; }

    setTxResult(null);
    setTxError(null);
    setValidationError(null);

    try {
      setTxStep("building");
      await new Promise((r) => setTimeout(r, 80));

      setTxStep("signing");

      const resultPromise = pledgeToEscrow(publicKey, amount);

      // Optimistically advance the progress bar after expected Freighter delay
      const stepTimer    = setTimeout(() => setTxStep("submitting"), 4_000);
      const confirmTimer = setTimeout(() => setTxStep("confirming"), 8_000);

      const result = await resultPromise;

      clearTimeout(stepTimer);
      clearTimeout(confirmTimer);

      setTxResult(result);
      setAmount("");
      await refreshBalance();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setTxError(msg);
    } finally {
      setTxStep("idle");
    }
  }, [isWalletReady, publicKey, contractReady, amount, xlmBalance, refreshBalance]);

  const dismiss = useCallback(() => { setTxResult(null); setTxError(null); }, []);

  const inputBorder = validationError
    ? "rgba(239,68,68,0.5)"
    : amount && !validationError && isConnected
    ? "rgba(245,158,11,0.4)"
    : "var(--border-subtle)";

  const contractErrDetected = txError ? isContractError(txError) : false;

  // ── Button label logic ────────────────────────────────────────────────────────
  function getButtonLabel() {
    if (isBusy)        return <><div className="spinner" />{STEP_LABELS[txStep]}</>;
    if (isRestoring)   return <><div className="spinner" style={{ width: 14, height: 14 }} />Restoring session…</>;
    if (!isConnected)  return <><LockIcon />Connect Wallet to Pledge</>;
    if (!contractReady) return <><CodeIcon />Contract not configured</>;
    return <><LockIcon />Pledge to Bounty<ArrowIcon /></>;
  }

  return (
    <div className="glass-card w-full max-w-md mx-auto animate-fade-in-up delay-300" style={{ padding: 0 }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between p-6" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="badge badge-amber">
              <span className="dot-live" style={{ width: "5px", height: "5px", boxShadow: "none" }} />
              Active Bounty
            </span>
            <span className="badge badge-blue">Soroban</span>
          </div>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
            Build Solis Escrow Smart Contract
          </h2>
          <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
            Implement a secure, multi-party escrow contract on Stellar using Soroban.
            Funds released upon milestone verification.
          </p>
          <ContractBadge />
        </div>
        <div
          className="flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-xl ml-3"
          style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", color: "var(--sol-amber)" }}
        >
          <ShieldIcon />
        </div>
      </div>

      {/* ── Stats ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        {[
          { label: "Prize Pool", value: "5,000", unit: "XLM",       accent: true },
          { label: "Pledgers",   value: "12",    unit: "funders" },
          { label: "Deadline",   value: "14d",   unit: "remaining" },
        ].map(({ label, value, unit, accent }, i) => (
          <div
            key={label}
            className="flex flex-col items-center justify-center py-4 gap-0.5"
            style={{ borderRight: i < 2 ? "1px solid var(--border-subtle)" : "none" }}
          >
            <span style={{ fontSize: "1.25rem", fontWeight: 700, letterSpacing: "-0.02em", color: accent ? "var(--sol-amber-glow)" : "var(--text-primary)" }}>
              {value}
            </span>
            <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{unit}</span>
            <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>{label}</span>
          </div>
        ))}
      </div>

      {/* ── Meta row ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-6 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        {[
          { icon: <UsersIcon />, label: "12 backers" },
          { icon: <ClockIcon />, label: "Ends Jul 20, 2026" },
          { icon: <LockIcon />,  label: "Soroban escrow" },
        ].map(({ icon, label }) => (
          <div key={label} className="flex items-center gap-1.5" style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            <span>{icon}</span>{label}
          </div>
        ))}
      </div>

      {/* ── Pledge body ─────────────────────────────────────────────────────── */}
      <div className="p-6 flex flex-col gap-4">

        {/* Label + max */}
        <div className="flex items-center justify-between">
          <label htmlFor="pledge-amount" style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)" }}>
            Pledge Amount (XLM)
          </label>
          {isConnected && (
            <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
              Max:{" "}
              <button
                onClick={() => handleQuickSelect(parseFloat(maxAvail))}
                disabled={isBusy || parseFloat(maxAvail) <= 0}
                style={{ color: "var(--sol-amber)", background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "inherit", padding: 0, opacity: isBusy ? 0.4 : 1 }}
              >
                {formatXLM(maxAvail, 2)} XLM
              </button>
            </span>
          )}
        </div>

        {/* Input + quick-select */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div
              className="flex-1 flex items-center gap-2 px-4 py-3 rounded-xl transition-all duration-200"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: `1px solid ${inputBorder}`,
                boxShadow: validationError
                  ? "0 0 0 3px rgba(239,68,68,0.08)"
                  : amount && !validationError && isConnected
                  ? "0 0 0 3px rgba(245,158,11,0.08)"
                  : "none",
              }}
            >
              <input
                id="pledge-amount"
                ref={inputRef}
                type="number"
                placeholder="e.g. 50"
                min="1"
                step="any"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !pledgeDisabled && handlePledge()}
                disabled={!isConnected || isBusy}
                className="flex-1 bg-transparent outline-none text-sm font-medium"
                style={{ color: "var(--text-primary)", caretColor: "var(--sol-amber)", opacity: !isConnected || isBusy ? 0.4 : 1 }}
                aria-invalid={!!validationError}
              />
              <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--sol-amber)", letterSpacing: "0.05em" }}>XLM</span>
            </div>
            
            <div className="flex items-center gap-2 flex-wrap">
              {[50, 200, 500].map((amt) => (
                <button
                  key={amt}
                  onClick={() => handleQuickSelect(amt)}
                  disabled={!isConnected || isBusy}
                  className="btn-ghost flex-1 py-3 px-4 text-xs font-semibold rounded-xl border border-white/5 hover:border-white/10"
                  style={{ opacity: !isConnected || isBusy ? 0.3 : 1 }}
                >
                  {amt} XLM
                </button>
              ))}
            </div>
          </div>

          {validationError && (
            <p className="flex items-center gap-1.5 animate-fade-in" style={{ fontSize: "0.75rem", color: "#fca5a5" }} role="alert">
              <AlertIcon />{validationError}
            </p>
          )}
        </div>

        {/* Progress bar (only during tx) */}
        {isBusy && (
          <div className="animate-fade-in">
            <TxProgress step={txStep} />
          </div>
        )}

        {/* ── CTA button ──────────────────────────────────────────────────── */}
        <button
          id="pledge-to-bounty-btn"
          onClick={handlePledge}
          disabled={pledgeDisabled}
          className="btn-amber w-full justify-center py-3 text-sm"
          aria-busy={isBusy}
          title={
            CONTRACT_STATUS === "placeholder" ? "Paste your Contract ID into src/lib/stellar.ts first" :
            CONTRACT_STATUS === "invalid"     ? "Contract ID format is invalid — must be a 56-char C… strkey" :
            !isConnected                      ? "Connect your Freighter wallet first" :
            undefined
          }
        >
          {getButtonLabel()}
        </button>

        {/* ── Success banner ───────────────────────────────────────────────── */}
        {txResult && (
          <div
            className="flex flex-col gap-3 p-4 rounded-xl animate-fade-in"
            style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)" }}
            role="status"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-7 h-7 rounded-full" style={{ background: "rgba(34,197,94,0.15)", color: "#4ade80" }}>
                  <CheckIcon />
                </div>
                <span style={{ fontWeight: 600, fontSize: "0.875rem", color: "#4ade80" }}>
                  Pledge confirmed on-chain!
                </span>
              </div>
              <button onClick={dismiss} style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }} aria-label="Dismiss">
                <XIcon />
              </button>
            </div>

            <div className="divider" />

            <div className="flex flex-col gap-1">
              <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Transaction Hash
              </span>
              <a
                href={txResult.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-1.5 group"
                style={{ textDecoration: "none" }}
              >
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--sol-amber-glow)", wordBreak: "break-all", lineHeight: 1.5 }}>
                  {txResult.txHash}
                </span>
                <span style={{ color: "var(--sol-amber)", flexShrink: 0, opacity: 0.7, marginTop: "2px" }} className="group-hover:opacity-100 transition-opacity">
                  <ExternalLinkIcon />
                </span>
              </a>
            </div>

            <a
              href={txResult.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg transition-all"
              style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#4ade80", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", textDecoration: "none" }}
            >
              View on Stellar Expert <ExternalLinkIcon />
            </a>
          </div>
        )}

        {/* ── Error banner ─────────────────────────────────────────────────── */}
        {txError && (
          <div
            className="flex flex-col gap-2 p-4 rounded-xl animate-fade-in"
            style={{
              background: contractErrDetected ? "rgba(251,191,36,0.05)" : "rgba(239,68,68,0.06)",
              border: contractErrDetected ? "1px solid rgba(251,191,36,0.2)" : "1px solid rgba(239,68,68,0.2)",
            }}
            role="alert"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <div
                  className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full mt-0.5"
                  style={{
                    background: contractErrDetected ? "rgba(251,191,36,0.1)" : "rgba(239,68,68,0.12)",
                    color: contractErrDetected ? "#fcd34d" : "#f87171",
                  }}
                >
                  {contractErrDetected ? <ContractErrorIcon /> : <AlertIcon />}
                </div>
                <div className="flex flex-col gap-1">
                  <span style={{ fontWeight: 600, fontSize: "0.875rem", color: contractErrDetected ? "#fcd34d" : "#f87171" }}>
                    {contractErrDetected ? "Contract Rule Violated" : "Transaction Failed"}
                  </span>
                  {contractErrDetected && (
                    <span className="badge" style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.25)", color: "#fbbf24", fontSize: "0.625rem", width: "fit-content", marginBottom: "2px" }}>
                      <CodeIcon /> Soroban Error
                    </span>
                  )}
                  <span style={{ fontSize: "0.8125rem", color: contractErrDetected ? "#fde68a" : "#fca5a5", lineHeight: 1.55 }}>
                    {txError}
                  </span>
                </div>
              </div>
              <button onClick={dismiss} style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", padding: "2px", flexShrink: 0 }} aria-label="Dismiss">
                <XIcon />
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        {!txResult && !txError && (
          <p className="text-center" style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
            🔒 Secured by Soroban Smart Contract · Stellar Testnet
          </p>
        )}
      </div>
    </div>
  );
}
