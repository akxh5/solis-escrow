import type { Metadata } from "next";
import WalletConnect from "@/components/WalletConnect";
import BountyCard from "@/components/BountyCard";

export const metadata: Metadata = {
  title: "Solis Escrow — Decentralized Bounties on Stellar",
  description:
    "Pledge XLM to open-source bounties secured by Soroban smart contracts. Connect your Freighter wallet to get started.",
};

// ─── Decorative icons ──────────────────────────────────────────────────────────

const SolisLogo = () => (
  <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
    <circle cx="16" cy="16" r="15" stroke="url(#logoGrad)" strokeWidth="1.5" />
    <circle cx="16" cy="16" r="6" fill="url(#logoGrad)" />
    {[0, 60, 120, 180, 240, 300].map((deg) => {
      const rad = (deg * Math.PI) / 180;
      const x1 = 16 + 9 * Math.cos(rad);
      const y1 = 16 + 9 * Math.sin(rad);
      const x2 = 16 + 13.5 * Math.cos(rad);
      const y2 = 16 + 13.5 * Math.sin(rad);
      return (
        <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke="url(#logoGrad)" strokeWidth="1.5" strokeLinecap="round" />
      );
    })}
    <defs>
      <linearGradient id="logoGrad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
        <stop stopColor="#fcd34d" />
        <stop offset="1" stopColor="#f97316" />
      </linearGradient>
    </defs>
  </svg>
);

const GithubIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
  </svg>
);

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function Home() {
  return (
    <div
      className="min-h-screen flex flex-col relative"
      style={{ background: "var(--bg-base)" }}
    >
      {/* ── Background layers ──────────────────────────────────────────────── */}
      <div className="fixed inset-0 bg-grid pointer-events-none" />
      <div className="fixed inset-0 bg-radial-glow pointer-events-none" />

      {/* Floating orbs */}
      <div
        className="fixed pointer-events-none"
        style={{
          top: "10%",
          left: "5%",
          width: "500px",
          height: "500px",
          background: "radial-gradient(circle, rgba(245,158,11,0.04) 0%, transparent 70%)",
          borderRadius: "50%",
          filter: "blur(40px)",
        }}
      />
      <div
        className="fixed pointer-events-none"
        style={{
          bottom: "15%",
          right: "5%",
          width: "400px",
          height: "400px",
          background: "radial-gradient(circle, rgba(99,102,241,0.05) 0%, transparent 70%)",
          borderRadius: "50%",
          filter: "blur(40px)",
        }}
      />

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <header
        className="relative z-20 w-full"
        style={{
          borderBottom: "1px solid var(--border-subtle)",
          background: "rgba(7,8,12,0.7)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        <nav className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <SolisLogo />
            <div className="flex flex-col">
              <span
                style={{
                  fontSize: "1rem",
                  fontWeight: 700,
                  letterSpacing: "-0.03em",
                  lineHeight: 1,
                }}
                className="text-gradient"
              >
                Solis Escrow
              </span>
              <span
                style={{
                  fontSize: "0.625rem",
                  color: "var(--text-muted)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  lineHeight: 1.2,
                }}
              >
                Stellar Testnet
              </span>
            </div>
          </div>

          {/* Nav links (desktop) */}
          <div
            className="hidden md:flex items-center gap-6"
            style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}
          >
            {["Bounties", "How it Works", "Docs"].map((label) => (
              <a
                key={label}
                href="#"
                className="transition-colors hover:text-white"
                style={{ textDecoration: "none", color: "inherit" }}
              >
                {label}
              </a>
            ))}
          </div>

          {/* Wallet connect */}
          <WalletConnect />
        </nav>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-20">
        {/* Hero badge */}
        <div className="badge badge-amber mb-6 animate-fade-in-up">
          <span>⚡</span>
          White Belt Milestone · Stellar Testnet
        </div>

        {/* Hero headline */}
        <h1
          className="text-center animate-fade-in-up delay-100"
          style={{
            fontSize: "clamp(2rem, 6vw, 3.75rem)",
            fontWeight: 800,
            letterSpacing: "-0.04em",
            lineHeight: 1.1,
            maxWidth: "800px",
            marginBottom: "24px",
          }}
        >
          <span className="text-gradient-subtle">Trustless Bounties</span>
          <br />
          <span className="text-gradient">Powered by Stellar</span>
        </h1>

        {/* Sub-headline */}
        <p
          className="text-center animate-fade-in-up delay-200"
          style={{
            fontSize: "clamp(0.9375rem, 2vw, 1.125rem)",
            color: "var(--text-secondary)",
            maxWidth: "520px",
            lineHeight: 1.7,
            marginBottom: "56px",
          }}
        >
          Pledge XLM to open-source bounties secured by Soroban smart contracts.
          Funds release automatically when milestones are verified on-chain.
        </p>

        {/* Bounty card */}
        <div
          className="w-full animate-fade-in-up delay-300"
          style={{ maxWidth: "460px" }}
        >
          <BountyCard />
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap items-center justify-center gap-3 mt-10 animate-fade-in-up delay-400">
          {[
            { emoji: "🔒", label: "Non-custodial escrow" },
            { emoji: "⚡", label: "5-second finality" },
            { emoji: "🌍", label: "< $0.01 fees" },
            { emoji: "🤝", label: "Multi-party release" },
          ].map(({ emoji, label }) => (
            <div
              key={label}
              className="flex items-center gap-2 px-4 py-2 rounded-xl"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid var(--border-subtle)",
                fontSize: "0.8125rem",
                color: "var(--text-secondary)",
              }}
            >
              <span>{emoji}</span>
              {label}
            </div>
          ))}
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer
        className="relative z-10 w-full"
        style={{
          borderTop: "1px solid var(--border-subtle)",
          padding: "20px 24px",
        }}
      >
        <div
          className="max-w-6xl mx-auto flex items-center justify-between"
          style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}
        >
          <span>© 2026 Solis Escrow · Built on Stellar</span>
          <div className="flex items-center gap-4">
            <a href="#" className="hover:text-white transition-colors" style={{ color: "inherit", textDecoration: "none", display: "flex", alignItems: "center", gap: "6px" }}>
              <GithubIcon />
              GitHub
            </a>
            <span>Testnet only · Not for production use</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
