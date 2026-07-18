"use client";

/**
 * src/components/EscrowCard.tsx
 *
 * Neo-Brutalist escrow card fully wired to global state:
 *   - Renders live `escrow` data from EscrowContext (optimistic updates flow in automatically).
 *   - On pledge success: shows inline confirmation state, fires parent onSuccess.
 *   - Modal onSuccess receives (result, amount, asset) to match PledgeModal's new signature.
 */

import { useState, useCallback } from "react";
import type { EscrowListing, AssetSymbol } from "@/lib/escrowTypes";
import {
  getTagClass,
  getStatusLabel,
  getStatusTagClass,
  formatDeadline,
  formatAmount,
  truncateWallet,
} from "@/lib/escrowTypes";
import type { PledgeResult } from "@/lib/stellar";
import PledgeModal from "./PledgeModal";

// ─── Icons ────────────────────────────────────────────────────────────────────

const GithubIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
  </svg>
);

const UsersIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

const ClockIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);

const ArrowIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
  </svg>
);

const ExternalLinkIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
    <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
  </svg>
);

// ─── Accent config ────────────────────────────────────────────────────────────

const ACCENT_MAP: Record<string, { bg: string; text: string }> = {
  yellow: { bg: "#FFE600", text: "#0A0A0A" },
  cyan:   { bg: "#00F5FF", text: "#0A0A0A" },
  pink:   { bg: "#FF2D78", text: "#FFFFFF" },
  lime:   { bg: "#B8FF47", text: "#0A0A0A" },
  orange: { bg: "#FF6B1A", text: "#FFFFFF" },
};

// ─── Wallet avatar ────────────────────────────────────────────────────────────

const AVATAR_COLORS = ["#FFE600","#00F5FF","#FF2D78","#B8FF47","#FF6B1A","#A855F7"];

function WalletAvatar({ wallet, size = 28 }: { wallet: string; size?: number }) {
  const colorIdx = wallet.charCodeAt(wallet.length - 1) % AVATAR_COLORS.length;
  const bg       = AVATAR_COLORS[colorIdx];
  const isDark   = bg === "#FF2D78" || bg === "#FF6B1A" || bg === "#A855F7";

  return (
    <div
      title={wallet}
      style={{
        width: size,
        height: size,
        background: bg,
        border: "2px solid #0A0A0A",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-mono)",
        fontWeight: 700,
        fontSize: size * 0.32,
        color: isDark ? "#FFF" : "#0A0A0A",
        flexShrink: 0,
        marginLeft: -6,
        position: "relative",
      }}
    >
      {wallet.slice(0, 2).toUpperCase()}
    </div>
  );
}

// ─── Pledge result (inline card success) ─────────────────────────────────────

interface PledgeSuccess {
  result: PledgeResult;
  amount: number;
  asset: AssetSymbol;
}

// ─── Main Card ────────────────────────────────────────────────────────────────

interface EscrowCardProps {
  escrow: EscrowListing;
  index:  number;
}

export default function EscrowCard({ escrow, index }: EscrowCardProps) {
  const [showModal,     setShowModal]     = useState(false);
  const [pledgeSuccess, setPledgeSuccess] = useState<PledgeSuccess | null>(null);

  const accent       = ACCENT_MAP[escrow.accentColor] ?? ACCENT_MAP.yellow;
  const isFullyFunded = escrow.fundingPct >= 100;
  const isReleased    = escrow.status === "RELEASED";
  const canPledge     = escrow.status === "ACTIVE" || escrow.status === "FUNDED";

  // Called by PledgeModal on successful on-chain confirmation
  const handleModalSuccess = useCallback(
    (result: PledgeResult, amount: number, asset: AssetSymbol) => {
      setPledgeSuccess({ result, amount, asset });
      // Close modal after a short celebration delay
      setTimeout(() => setShowModal(false), 2500);
    },
    []
  );

  // Staggered entrance animation
  const delayClass = `delay-${Math.min(Math.floor(index % 6) * 100, 500)}`;

  return (
    <>
      <article
        id={`escrow-card-${escrow.id}`}
        className={`brutal-card animate-pop-in ${delayClass}`}
        style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}
        aria-label={`Escrow: ${escrow.title}`}
      >
        {/* Accent colour strip */}
        <div style={{ height: 6, background: accent.bg, flexShrink: 0 }} />

        <div style={{ padding: "18px 20px", flex: 1, display: "flex", flexDirection: "column" }}>

          {/* Tags + Status */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12, alignItems: "center" }}>
            <span className={`brutal-tag ${getStatusTagClass(escrow.status)}`}>
              {getStatusLabel(escrow.status)}
            </span>
            {escrow.tags.map((tag) => (
              <span key={tag} className={`brutal-tag ${getTagClass(tag)}`}>{tag}</span>
            ))}
          </div>

          {/* Title */}
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: "1.05rem",
              letterSpacing: "-0.02em",
              lineHeight: 1.25,
              marginBottom: 8,
              color: "#0A0A0A",
            }}
          >
            {escrow.title}
          </h2>

          {/* Description (clamped to 3 lines) */}
          <p
            style={{
              fontSize: "0.82rem",
              fontWeight: 500,
              lineHeight: 1.6,
              color: "rgba(10,10,10,0.65)",
              marginBottom: 16,
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {escrow.description}
          </p>

          {/* Stats grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              border: "2px solid #0A0A0A",
              marginBottom: 14,
            }}
          >
            {[
              { label: "Raised",   value: formatAmount(escrow.pledgedTotal, escrow.assetSymbol), mono: true },
              { label: "Backers",  value: String(escrow.pledgerCount)                           },
              { label: "Deadline", value: formatDeadline(escrow.deadlineAt)                     },
            ].map(({ label, value, mono }, i) => (
              <div
                key={label}
                style={{ padding: "10px 12px", borderRight: i < 2 ? "2px solid #0A0A0A" : "none" }}
              >
                <p
                  style={{
                    fontFamily: mono ? "var(--font-mono)" : "var(--font-display)",
                    fontWeight: 800,
                    fontSize: mono ? "0.82rem" : "1rem",
                    lineHeight: 1,
                    marginBottom: 3,
                    // Animate value changes from optimistic updates
                    transition: "color 0.25s",
                    color: "#0A0A0A",
                  }}
                >
                  {value}
                </p>
                <p style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.5 }}>
                  {label}
                </p>
              </div>
            ))}
          </div>

          {/* Progress bar — animates when fundingPct updates from optimistic pledge */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ fontWeight: 700, fontSize: "0.78rem" }}>
                {escrow.fundingPct.toFixed(1)}% of goal
              </span>
              <span style={{ fontWeight: 700, fontSize: "0.78rem", fontFamily: "var(--font-mono)" }}>
                {formatAmount(escrow.goalAmount, escrow.assetSymbol)} goal
              </span>
            </div>
            <div className="brutal-progress-track">
              <div
                className="brutal-progress-fill"
                style={{
                  width: `${Math.min(escrow.fundingPct, 100)}%`,
                  background: isFullyFunded ? "#B8FF47" : accent.bg,
                  transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)",
                }}
              />
            </div>
          </div>

          {/* Pledger avatar stack + creator */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", paddingLeft: 6 }}>
                <WalletAvatar wallet={escrow.creatorWallet} />
                {escrow.recentPledgers.slice(0, 3).map((p) => (
                  <WalletAvatar key={p.txHash} wallet={p.wallet} />
                ))}
                {escrow.pledgerCount > 4 && (
                  <div
                    style={{
                      width: 28, height: 28,
                      background: "#0A0A0A",
                      border: "2px solid #0A0A0A",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 9,
                      color: "#FFE600", marginLeft: -6,
                    }}
                  >
                    +{escrow.pledgerCount - 4}
                  </div>
                )}
              </div>
              <div style={{ marginLeft: 10 }}>
                <p style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", opacity: 0.5, marginBottom: 1 }}>Creator</p>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", fontWeight: 700 }}>
                  {truncateWallet(escrow.creatorWallet)}
                </p>
              </div>
            </div>

            {/* Meta chips */}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.72rem", fontWeight: 700, opacity: 0.55 }}>
                <UsersIcon /> {escrow.pledgerCount}
              </span>
              {escrow.deadlineAt && (
                <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.72rem", fontWeight: 700, opacity: 0.55 }}>
                  <ClockIcon /> {formatDeadline(escrow.deadlineAt)}
                </span>
              )}
              {escrow.githubRepoUrl && (
                <a
                  href={escrow.githubRepoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#0A0A0A", opacity: 0.45, display: "flex" }}
                  aria-label="GitHub repository"
                >
                  <GithubIcon />
                </a>
              )}
            </div>
          </div>

          {/* ── CTA ── */}
          <div style={{ marginTop: "auto" }}>
            {/* Inline success banner (appears after modal closes) */}
            {pledgeSuccess ? (
              <div
                className="animate-pop-in"
                style={{
                  background: "#B8FF47",
                  border: "3px solid #0A0A0A",
                  boxShadow: "3px 3px 0px #0A0A0A",
                  padding: "12px 14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <div>
                  <p style={{ fontWeight: 800, fontSize: "0.85rem", marginBottom: 2 }}>
                    ✅ Pledge confirmed!
                  </p>
                  <p style={{ fontWeight: 600, fontSize: "0.72rem", opacity: 0.7 }}>
                    {pledgeSuccess.amount} {pledgeSuccess.asset} contributed
                  </p>
                </div>
                <a
                  href={pledgeSuccess.result.explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontFamily: "var(--font-display)",
                    fontWeight: 800,
                    fontSize: "0.72rem",
                    color: "#0A0A0A",
                    textDecoration: "none",
                    border: "2px solid #0A0A0A",
                    padding: "5px 8px",
                    boxShadow: "2px 2px 0px #0A0A0A",
                  }}
                >
                  Tx <ExternalLinkIcon />
                </a>
              </div>
            ) : isReleased ? (
              <div
                style={{
                  background: "#F5F5F0",
                  border: "3px solid #0A0A0A",
                  padding: "12px",
                  textAlign: "center",
                  fontWeight: 800,
                  fontSize: "0.82rem",
                  color: "rgba(10,10,10,0.45)",
                  boxShadow: "3px 3px 0px #0A0A0A",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                }}
              >
                ✅ Released — Completed
              </div>
            ) : (
              <button
                id={`pledge-btn-${escrow.id}`}
                onClick={() => setShowModal(true)}
                disabled={!canPledge}
                className="btn-brutal"
                style={{
                  width: "100%",
                  background: canPledge ? "#0A0A0A" : "#E5E5E0",
                  color:      canPledge ? accent.bg : "rgba(10,10,10,0.35)",
                  fontSize: "0.9rem",
                  fontWeight: 800,
                  padding: "13px 20px",
                  letterSpacing: "0.03em",
                  justifyContent: "space-between",
                }}
              >
                <span>
                  {isFullyFunded
                    ? "⚡ Fully Funded — Pledge More"
                    : "⚡ Pledge to This Escrow"}
                </span>
                {canPledge && <ArrowIcon />}
              </button>
            )}
          </div>
        </div>
      </article>

      {/* Pledge modal (portal-like, rendered via React tree) */}
      {showModal && (
        <PledgeModal
          escrow={escrow}
          onClose={() => setShowModal(false)}
          onSuccess={handleModalSuccess}
        />
      )}
    </>
  );
}
