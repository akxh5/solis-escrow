"use client";

/**
 * src/components/SwapModal.tsx
 *
 * XLM → USDC swap modal, styled to match the Solis Escrow retro black/yellow/mono theme.
 *
 * State machine
 * ─────────────
 * idle → signing → submitting → success
 *                            ↘ error (can retry)
 *
 * The modal auto-fetches the live XLM/USDC rate on open and debounces re-quotes
 * as the user types.  Slippage applies to the destMin field of PathPaymentStrictSend.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  fetchXlmToUsdcRate,
  computeSwapQuote,
  executeXlmToUsdcSwap,
  validateSwapAmount,
  type SlippageTolerance,
  type SwapQuote,
  type SwapResult,
} from "@/lib/stellar-swap";

// ─── Types ────────────────────────────────────────────────────────────────────

type SwapStatus = "idle" | "signing" | "submitting" | "success" | "error";

interface Props {
  isOpen:    boolean;
  onClose:   () => void;
  publicKey: string;
  xlmBalance: string;    // e.g. "234.5671234"
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function truncateTx(hash: string) {
  if (!hash || hash.length < 16) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-8)}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SwapModal({ isOpen, onClose, publicKey, xlmBalance }: Props) {
  // ── Form state ──────────────────────────────────────────────────────────────
  const [xlmAmount,  setXlmAmount]  = useState("");
  const [slippage,   setSlippage]   = useState<SlippageTolerance>("0.5");
  const [quote,      setQuote]      = useState<SwapQuote | null>(null);
  const [rateData,   setRateData]   = useState<{ xlmPerUsdc: string; available: boolean } | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);

  // ── Execution state ─────────────────────────────────────────────────────────
  const [status,     setStatus]     = useState<SwapStatus>("idle");
  const [swapResult, setSwapResult] = useState<SwapResult | null>(null);
  const [errorMsg,   setErrorMsg]   = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef    = useRef<HTMLInputElement>(null);

  // ── Fetch live rate on open ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    setStatus("idle");
    setSwapResult(null);
    setErrorMsg(null);
    setXlmAmount("");
    setQuote(null);
    setInputError(null);

    let cancelled = false;
    fetchXlmToUsdcRate().then((r) => {
      if (!cancelled) setRateData(r);
    });

    // Focus the input after mount
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [isOpen]);

  // ── Re-quote on input change (debounced 350 ms) ─────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      const err = validateSwapAmount(xlmAmount, xlmBalance);
      setInputError(err);

      if (!err && rateData?.available) {
        const q = computeSwapQuote(xlmAmount, rateData.xlmPerUsdc, slippage);
        setQuote(q);
      } else {
        setQuote(null);
      }
    }, 350);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [xlmAmount, slippage, rateData, xlmBalance]);

  // ── Keyboard close ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && status !== "signing" && status !== "submitting") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, status, onClose]);

  // ── Execute swap ─────────────────────────────────────────────────────────────
  const handleSwap = useCallback(async () => {
    if (!quote || inputError || status !== "idle") return;

    setStatus("signing");
    setErrorMsg(null);

    try {
      setStatus("submitting");
      const result = await executeXlmToUsdcSwap(
        publicKey,
        xlmAmount,
        quote.minUsdcExpected
      );
      setSwapResult(result);
      setStatus("success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Distinguish signing rejection from submission error
      if (msg.toLowerCase().includes("freighter") || msg.toLowerCase().includes("signing")) {
        setStatus("idle");
      } else {
        setErrorMsg(msg);
        setStatus("error");
      }
    }
  }, [quote, inputError, status, publicKey, xlmAmount]);

  // ── Max button ───────────────────────────────────────────────────────────────
  const handleMax = useCallback(() => {
    const bal = parseFloat(xlmBalance);
    if (isNaN(bal) || bal <= 2) return;
    setXlmAmount((bal - 2).toFixed(4));
  }, [xlmBalance]);

  // ── Render ───────────────────────────────────────────────────────────────────
  if (!isOpen) return null;

  const busy      = status === "signing" || status === "submitting";
  const canSubmit = !busy && !inputError && !!quote && status !== "success";
  const availableXlm = Math.max(0, parseFloat(xlmBalance) - 2).toFixed(4);

  return (
    // Backdrop
    <div
      id="swap-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="XLM to USDC Swap"
      onClick={(e) => {
        if (!busy && (e.target as HTMLElement).id === "swap-modal-backdrop") onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9000,
        background: "rgba(10,10,10,0.88)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        backdropFilter: "blur(4px)",
        animation: "fade-in 0.18s ease forwards",
      }}
    >
      {/* ── Modal panel ── */}
      <div
        style={{
          background: "#0A0A0A",
          border: "3px solid #FFE600",
          borderRadius: 0,
          width: "100%",
          maxWidth: 480,
          fontFamily: "var(--font-mono)",
          boxShadow: "8px 8px 0 #FFE600",
          animation: "fade-in 0.2s ease forwards",
          overflow: "hidden",
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            background: "#FFE600",
            padding: "14px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: "1.3rem" }}>⚡</span>
            <div>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 800,
                  fontSize: "1rem",
                  color: "#0A0A0A",
                  letterSpacing: "-0.02em",
                  lineHeight: 1,
                }}
              >
                SWAP XLM → USDC
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.6rem",
                  color: "rgba(10,10,10,0.6)",
                  letterSpacing: "0.1em",
                  marginTop: 2,
                }}
              >
                STELLAR DEX · PATHPAYMENT
              </div>
            </div>
          </div>
          <button
            id="swap-modal-close"
            onClick={onClose}
            disabled={busy}
            aria-label="Close swap modal"
            style={{
              background: "transparent",
              border: "2px solid #0A0A0A",
              cursor: busy ? "not-allowed" : "pointer",
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-mono)",
              fontWeight: 700,
              fontSize: "1rem",
              color: "#0A0A0A",
              opacity: busy ? 0.4 : 1,
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => { if (!busy) (e.currentTarget.style.background = "#0A0A0A20"); }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            ✕
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: "24px 20px 20px" }}>

          {/* ── Success state ── */}
          {status === "success" && swapResult && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "3rem", marginBottom: 12 }}>✅</div>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 800,
                  fontSize: "1.1rem",
                  color: "#FFE600",
                  marginBottom: 6,
                }}
              >
                SWAP CONFIRMED
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.72rem",
                  color: "rgba(255,255,255,0.5)",
                  marginBottom: 20,
                  lineHeight: 1.7,
                }}
              >
                Sent {parseFloat(swapResult.sentXlm).toFixed(4)} XLM<br />
                Min {parseFloat(swapResult.minUsdcExpected).toFixed(4)} USDC guaranteed
              </div>
              <a
                id="swap-success-explorer-link"
                href={swapResult.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  background: "#FFE600",
                  color: "#0A0A0A",
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: "0.78rem",
                  letterSpacing: "0.06em",
                  padding: "10px 18px",
                  border: "2px solid #FFE600",
                  textDecoration: "none",
                  cursor: "pointer",
                  marginBottom: 16,
                }}
              >
                ↗ VIEW ON STELLAR EXPERT
                <span style={{ fontFamily: "var(--font-mono)", opacity: 0.7, fontSize: "0.65rem" }}>
                  {truncateTx(swapResult.txHash)}
                </span>
              </a>
              <br />
              <button
                id="swap-done-btn"
                onClick={onClose}
                style={{
                  background: "transparent",
                  border: "2px solid rgba(255,255,255,0.25)",
                  color: "rgba(255,255,255,0.5)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.7rem",
                  letterSpacing: "0.08em",
                  padding: "8px 20px",
                  cursor: "pointer",
                  marginTop: 8,
                }}
              >
                CLOSE
              </button>
            </div>
          )}

          {/* ── Form state (idle / error) ── */}
          {status !== "success" && (
            <>
              {/* Balance display */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                <label
                  htmlFor="swap-xlm-input"
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.65rem",
                    color: "rgba(255,255,255,0.45)",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                  }}
                >
                  YOU PAY
                </label>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.65rem",
                    color: "rgba(255,255,255,0.35)",
                  }}
                >
                  Balance: {parseFloat(xlmBalance).toFixed(4)} XLM
                </div>
              </div>

              {/* XLM input row */}
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginBottom: inputError ? 6 : 18,
                }}
              >
                <div style={{ position: "relative", flex: 1 }}>
                  <input
                    id="swap-xlm-input"
                    ref={inputRef}
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0.0000"
                    value={xlmAmount}
                    onChange={(e) => setXlmAmount(e.target.value)}
                    disabled={busy}
                    aria-label="XLM amount to swap"
                    aria-describedby={inputError ? "swap-xlm-error" : undefined}
                    aria-invalid={!!inputError}
                    style={{
                      width: "100%",
                      background: "#111",
                      border: `2px solid ${inputError ? "#FF6B6B" : "rgba(255,230,0,0.3)"}`,
                      color: "#FFE600",
                      fontFamily: "var(--font-mono)",
                      fontSize: "1.25rem",
                      fontWeight: 700,
                      padding: "14px 56px 14px 14px",
                      outline: "none",
                      transition: "border-color 0.15s",
                      boxSizing: "border-box",
                      borderRadius: 0,
                    }}
                    onFocus={(e) => { if (!inputError) e.currentTarget.style.borderColor = "#FFE600"; }}
                    onBlur={(e)  => { e.currentTarget.style.borderColor = inputError ? "#FF6B6B" : "rgba(255,230,0,0.3)"; }}
                  />
                  {/* XLM badge */}
                  <div
                    style={{
                      position: "absolute",
                      right: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      color: "rgba(255,255,255,0.45)",
                      letterSpacing: "0.06em",
                      pointerEvents: "none",
                    }}
                  >
                    XLM
                  </div>
                </div>

                {/* MAX button */}
                <button
                  id="swap-max-btn"
                  onClick={handleMax}
                  disabled={busy}
                  title={`Max swappable: ${availableXlm} XLM`}
                  style={{
                    background: "transparent",
                    border: "2px solid rgba(255,230,0,0.35)",
                    color: "#FFE600",
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.68rem",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    padding: "0 14px",
                    cursor: busy ? "not-allowed" : "pointer",
                    flexShrink: 0,
                    transition: "background 0.15s",
                    opacity: busy ? 0.4 : 1,
                  }}
                  onMouseEnter={(e) => { if (!busy) (e.currentTarget.style.background = "rgba(255,230,0,0.1)"); }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  MAX
                </button>
              </div>

              {/* Input error */}
              {inputError && (
                <div
                  id="swap-xlm-error"
                  role="alert"
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.65rem",
                    color: "#FF6B6B",
                    marginBottom: 14,
                    letterSpacing: "0.04em",
                  }}
                >
                  ⚠ {inputError}
                </div>
              )}

              {/* ── Arrow divider ── */}
              <div
                style={{
                  textAlign: "center",
                  color: "rgba(255,230,0,0.35)",
                  fontSize: "1.2rem",
                  margin: "4px 0 14px",
                  letterSpacing: "0.1em",
                  fontFamily: "var(--font-mono)",
                }}
              >
                ↓
              </div>

              {/* ── Estimated USDC output ── */}
              <div
                style={{
                  marginBottom: 6,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <label
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.65rem",
                    color: "rgba(255,255,255,0.45)",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                  }}
                >
                  ESTIMATED OUTPUT
                </label>
                {rateData?.available && (
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.6rem",
                      color: "rgba(255,255,255,0.28)",
                    }}
                  >
                    1 USDC ≈ {parseFloat(rateData.xlmPerUsdc).toFixed(4)} XLM
                  </div>
                )}
              </div>

              <div
                id="swap-usdc-estimate"
                style={{
                  background: "#111",
                  border: "2px solid rgba(255,255,255,0.08)",
                  padding: "14px",
                  marginBottom: 18,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "1.25rem",
                    fontWeight: 700,
                    color: quote ? "#fff" : "rgba(255,255,255,0.2)",
                    letterSpacing: "-0.02em",
                  }}
                >
                  {quote ? parseFloat(quote.estimatedUsdc).toFixed(4) : "—"}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    color: "rgba(255,255,255,0.45)",
                    letterSpacing: "0.06em",
                  }}
                >
                  USDC
                </div>
              </div>

              {/* Rate availability warning */}
              {!rateData?.available && (
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.65rem",
                    color: "#F9A825",
                    marginBottom: 14,
                    letterSpacing: "0.04em",
                  }}
                >
                  ⚠ No XLM/USDC orderbook depth on Testnet — swap may fail.
                </div>
              )}

              {/* ── Slippage ── */}
              <div style={{ marginBottom: 20 }}>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.65rem",
                    color: "rgba(255,255,255,0.45)",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    marginBottom: 8,
                  }}
                >
                  SLIPPAGE TOLERANCE
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["0.5", "1.0"] as SlippageTolerance[]).map((opt) => (
                    <button
                      key={opt}
                      id={`swap-slippage-${opt.replace(".", "_")}`}
                      onClick={() => setSlippage(opt)}
                      disabled={busy}
                      aria-pressed={slippage === opt}
                      style={{
                        flex: 1,
                        padding: "9px 0",
                        background: slippage === opt ? "#FFE600" : "transparent",
                        border: `2px solid ${slippage === opt ? "#FFE600" : "rgba(255,255,255,0.18)"}`,
                        color: slippage === opt ? "#0A0A0A" : "rgba(255,255,255,0.5)",
                        fontFamily: "var(--font-mono)",
                        fontWeight: 700,
                        fontSize: "0.75rem",
                        letterSpacing: "0.06em",
                        cursor: busy ? "not-allowed" : "pointer",
                        transition: "all 0.15s",
                        borderRadius: 0,
                        opacity: busy ? 0.5 : 1,
                      }}
                    >
                      {opt}%
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Min received breakdown ── */}
              {quote && (
                <div
                  style={{
                    background: "rgba(255,230,0,0.05)",
                    border: "1px solid rgba(255,230,0,0.15)",
                    padding: "10px 14px",
                    marginBottom: 20,
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  {[
                    ["SEND",          `${xlmAmount} XLM`],
                    ["SLIPPAGE",      `${slippage}%`],
                    ["MIN RECEIVED",  `${parseFloat(quote.minUsdcExpected).toFixed(4)} USDC`],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.65rem",
                      }}
                    >
                      <span style={{ color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em" }}>
                        {label}
                      </span>
                      <span style={{ color: "rgba(255,255,255,0.7)", letterSpacing: "0.04em" }}>
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Error message ── */}
              {status === "error" && errorMsg && (
                <div
                  role="alert"
                  style={{
                    background: "rgba(255,107,107,0.1)",
                    border: "2px solid rgba(255,107,107,0.4)",
                    padding: "10px 14px",
                    marginBottom: 16,
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.68rem",
                    color: "#FF6B6B",
                    lineHeight: 1.5,
                    letterSpacing: "0.03em",
                  }}
                >
                  ⚠ {errorMsg}
                </div>
              )}

              {/* ── Status indicator ── */}
              {busy && (
                <div
                  role="status"
                  aria-live="polite"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 14,
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.7rem",
                    color: "#FFE600",
                    letterSpacing: "0.06em",
                  }}
                >
                  <span className="spinner-brutal" style={{ width: 14, height: 14, flexShrink: 0 }} />
                  {status === "signing"    ? "WAITING FOR WALLET SIGNATURE…"
                   : status === "submitting" ? "SUBMITTING TO STELLAR TESTNET…"
                   : null}
                </div>
              )}

              {/* ── Swap button ── */}
              <button
                id="swap-execute-btn"
                onClick={handleSwap}
                disabled={!canSubmit}
                aria-disabled={!canSubmit}
                style={{
                  width: "100%",
                  padding: "15px 0",
                  background: canSubmit ? "#FFE600" : "rgba(255,255,255,0.06)",
                  border: `3px solid ${canSubmit ? "#FFE600" : "rgba(255,255,255,0.1)"}`,
                  color: canSubmit ? "#0A0A0A" : "rgba(255,255,255,0.2)",
                  fontFamily: "var(--font-display)",
                  fontWeight: 800,
                  fontSize: "0.9rem",
                  letterSpacing: "0.08em",
                  cursor: canSubmit ? "pointer" : "not-allowed",
                  transition: "all 0.15s",
                  borderRadius: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  boxShadow: canSubmit ? "4px 4px 0 #0A0A0A" : "none",
                }}
                onMouseEnter={(e) => {
                  if (canSubmit) {
                    (e.currentTarget.style.background = "#F5DB00");
                    (e.currentTarget.style.transform = "translate(-2px,-2px)");
                    (e.currentTarget.style.boxShadow = "6px 6px 0 #0A0A0A");
                  }
                }}
                onMouseLeave={(e) => {
                  if (canSubmit) {
                    (e.currentTarget.style.background = "#FFE600");
                    (e.currentTarget.style.transform = "none");
                    (e.currentTarget.style.boxShadow = "4px 4px 0 #0A0A0A");
                  }
                }}
              >
                {busy ? (
                  <><span className="spinner-brutal" style={{ width: 14, height: 14 }} /> SWAPPING…</>
                ) : (
                  <>⚡ CONFIRM SWAP</>
                )}
              </button>

              {/* Retry after error */}
              {status === "error" && (
                <button
                  id="swap-retry-btn"
                  onClick={() => setStatus("idle")}
                  style={{
                    marginTop: 10,
                    width: "100%",
                    padding: "10px 0",
                    background: "transparent",
                    border: "2px solid rgba(255,255,255,0.15)",
                    color: "rgba(255,255,255,0.45)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.7rem",
                    letterSpacing: "0.06em",
                    cursor: "pointer",
                    borderRadius: 0,
                  }}
                >
                  ↩ RETRY
                </button>
              )}

              {/* Disclaimer */}
              <div
                style={{
                  marginTop: 16,
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.58rem",
                  color: "rgba(255,255,255,0.2)",
                  textAlign: "center",
                  letterSpacing: "0.04em",
                  lineHeight: 1.5,
                }}
              >
                Uses Stellar DEX PathPaymentStrictSend · Testnet only · Prices may vary
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
