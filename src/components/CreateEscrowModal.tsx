"use client";

import { useState, useCallback, useRef } from "react";
import { useWallet } from "@/context/WalletContext";
import { useToast } from "@/context/ToastContext";
import { createNewEscrow } from "@/lib/stellar";
import type { AssetType } from "@/lib/stellar";
import type { PledgeResult } from "@/lib/stellar";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type TxStep = "idle" | "building" | "signing" | "submitting" | "confirming";

const STEP_META: Record<TxStep, { label: string; hint: string }> = {
  idle:       { label: "Create Escrow",               hint: ""                                    },
  building:   { label: "Building Transaction…",       hint: "Assembling Soroban call"             },
  signing:    { label: "Sign in Freighter…",           hint: "Approve the popup in your wallet"   },
  submitting: { label: "Submitting to RPC…",           hint: "Sending to Soroban RPC node"        },
  confirming: { label: "Awaiting Confirmation…",      hint: "Polling ledger for finality"         },
};

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

export default function CreateEscrowModal({ isOpen, onClose }: Props) {
  const { status, publicKey, connect } = useWallet();
  const { showToast } = useToast();

  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [deadlineDate, setDeadlineDate] = useState("");
  const [asset, setAsset] = useState<AssetType>("XLM");

  const [txStep, setTxStep] = useState<TxStep>("idle");
  const [txResult, setTxResult] = useState<PledgeResult | null>(null);

  const isBusy = txStep !== "idle";
  const isConnected = status === "connected";

  // Validate form
  const isFormValid = title.trim() && parseFloat(goal) > 0 && deadlineDate;

  const handleCreate = useCallback(async () => {
    if (!isConnected || !publicKey) return;
    if (!isFormValid) return;

    setTxResult(null);

    try {
      setTxStep("building");
      await new Promise(r => setTimeout(r, 150));

      setTxStep("signing");
      const deadlineUnix = Math.floor(new Date(deadlineDate).getTime() / 1000);
      
      const resultPromise = createNewEscrow(publicKey, goal, deadlineUnix, asset);

      const submitTimer  = setTimeout(() => setTxStep("submitting"), 4500);
      const confirmTimer = setTimeout(() => setTxStep("confirming"), 9000);

      const result = await resultPromise;
      clearTimeout(submitTimer);
      clearTimeout(confirmTimer);

      setTxResult(result);
      setTxStep("idle");

      showToast({
        type: "success",
        title: "Escrow Created! 🎉",
        body: `Created "${title}" for ${goal} ${asset}`,
        explorerUrl: result.explorerUrl,
        duration: 7000,
      });

    } catch (err: unknown) {
      setTxStep("idle");
      const raw = err instanceof Error ? err.message : String(err);
      const lc = raw.toLowerCase();

      const isRejection = lc.includes("rejected") || lc.includes("declined") || lc.includes("cancel");
      
      if (isRejection) {
        showToast({
          type: "warning",
          title: "Transaction rejected",
          body: "You cancelled the Freighter signing request.",
        });
      } else {
        showToast({
          type: "error",
          title: "Creation failed",
          body: raw,
          duration: 8000,
        });
      }
    }
  }, [isConnected, publicKey, title, goal, deadlineDate, asset, isFormValid, showToast]);

  const pipelineSteps: TxStep[] = ["building", "signing", "submitting", "confirming"];
  const activeIdx = pipelineSteps.indexOf(txStep);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget && !isBusy) onClose(); }}
      role="dialog"
      aria-modal="true"
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
        <div
          style={{
            background: "#FFE600",
            borderBottom: "4px solid #0A0A0A",
            padding: "16px 20px",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ flex: 1 }}>
            <p style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "0.68rem", letterSpacing: "0.14em", textTransform: "uppercase", color: "#0A0A0A", opacity: 0.65, marginBottom: 4 }}>
              New Campaign
            </p>
            <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "1.05rem", color: "#0A0A0A", letterSpacing: "-0.02em", lineHeight: 1.25 }}>
              CREATE ESCROW
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={isBusy}
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
              opacity: isBusy ? 0.4 : 1,
            }}
          >
            <XIcon />
          </button>
        </div>

        <div style={{ padding: "20px" }}>
          {!isConnected ? (
            <div style={{ background: "#FFE600", border: "3px solid #0A0A0A", padding: "16px", textAlign: "center", marginBottom: 20 }}>
              <p style={{ fontWeight: 800, fontSize: "1rem", marginBottom: 10 }}>Wallet not connected</p>
              <button onClick={connect} className="btn-brutal btn-black" style={{ width: "100%", justifyContent: "center" }}>
                Connect Freighter
              </button>
            </div>
          ) : !txResult ? (
            <>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontWeight: 700, fontSize: "0.75rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>Campaign Title</label>
                <input
                  type="text"
                  placeholder="e.g. Save the Ocean"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={isBusy}
                  className="brutal-input"
                  style={{ width: "100%", marginTop: 6 }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={{ fontWeight: 700, fontSize: "0.75rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>Goal Amount</label>
                  <input
                    type="number"
                    placeholder="1000"
                    min="1"
                    step="any"
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    disabled={isBusy}
                    className="brutal-input"
                    style={{ width: "100%", marginTop: 6 }}
                  />
                </div>
                <div>
                  <label style={{ fontWeight: 700, fontSize: "0.75rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>Asset Type</label>
                  <select
                    value={asset}
                    onChange={(e) => setAsset(e.target.value as AssetType)}
                    disabled={isBusy}
                    className="brutal-input"
                    style={{ width: "100%", marginTop: 6, appearance: "none" }}
                  >
                    <option value="XLM">✦ XLM</option>
                    <option value="USDC">$ USDC</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ fontWeight: 700, fontSize: "0.75rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>Deadline</label>
                <input
                  type="datetime-local"
                  value={deadlineDate}
                  onChange={(e) => setDeadlineDate(e.target.value)}
                  disabled={isBusy}
                  className="brutal-input"
                  style={{ width: "100%", marginTop: 6 }}
                />
              </div>

              {isBusy && (
                <div className="animate-fade-in" style={{ background: "#F5F5F0", border: "3px solid #0A0A0A", padding: "14px", marginBottom: 16 }}>
                  <div style={{ display: "flex", gap: 0, marginBottom: 8 }}>
                    {pipelineSteps.map((s, i) => {
                      const done = i < activeIdx;
                      const active = i === activeIdx;
                      return (
                        <div key={s} style={{ flex: 1 }}>
                          <div style={{ height: 5, background: done ? "#0A0A0A" : active ? "#FFE600" : "rgba(10,10,10,0.12)", borderRight: i < pipelineSteps.length - 1 ? "2px solid #FFF" : "none", transition: "background 0.3s" }} />
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", gap: 0 }}>
                    {pipelineSteps.map((s, i) => {
                      const done = i < activeIdx;
                      const active = i === activeIdx;
                      return (
                        <div key={s} style={{ flex: 1, textAlign: "center", fontSize: "0.55rem", fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: (done || active) ? "#0A0A0A" : "rgba(10,10,10,0.3)" }}>
                          {s}
                        </div>
                      );
                    })}
                  </div>
                  <p style={{ textAlign: "center", marginTop: 10, fontSize: "0.78rem", fontWeight: 700, opacity: 0.6 }}>
                    {STEP_META[txStep].hint}
                  </p>
                </div>
              )}

              <button
                onClick={handleCreate}
                disabled={!isFormValid || isBusy}
                className="btn-brutal"
                style={{
                  width: "100%",
                  background: !isFormValid ? "#E5E5E0" : "#0A0A0A",
                  color: !isFormValid ? "rgba(10,10,10,0.35)" : "#FFE600",
                  fontSize: "1rem",
                  fontWeight: 800,
                  padding: "14px 20px",
                  justifyContent: "center",
                }}
              >
                {isBusy ? (
                  <><span className="spinner-brutal spinner-white" /> {STEP_META[txStep].label}</>
                ) : (
                  "➕ CREATE NEW ESCROW"
                )}
              </button>
            </>
          ) : (
            <div className="animate-pop-in" style={{ background: "#B8FF47", border: "4px solid #0A0A0A", padding: "24px 20px", textAlign: "center" }}>
              <div style={{ width: 56, height: 56, background: "#0A0A0A", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", color: "#B8FF47" }}>
                <CheckIcon />
              </div>
              <p style={{ fontWeight: 800, fontSize: "1.1rem", marginBottom: 6 }}>Escrow Created! 🎉</p>
              <p style={{ fontWeight: 600, fontSize: "0.82rem", opacity: 0.7, marginBottom: 16 }}>{title}</p>
              <a href={txResult.explorerUrl} target="_blank" rel="noopener noreferrer" className="btn-brutal btn-black" style={{ display: "inline-flex", gap: 6, fontSize: "0.85rem", justifyContent: "center" }}>
                View on Stellar Expert <ExternalLinkIcon />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
