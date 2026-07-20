import type { Metadata } from "next";
import WalletConnect from "@/components/WalletConnect";
import EscrowExplorer from "@/components/EscrowExplorer";

export const metadata: Metadata = {
  title: "Solis Escrow — Decentralized Escrow Marketplace on Stellar",
  description:
    "Browse, pledge to, and create trustless multi-party escrows secured by Soroban smart contracts on the Stellar Testnet. The Escrow Explorer for decentralized bounties.",
  keywords: ["Stellar", "Soroban", "escrow", "bounty", "DeFi", "XLM", "marketplace"],
  openGraph: {
    title: "Solis Escrow Marketplace",
    description: "Trustless multi-escrow marketplace on Stellar.",
    type: "website",
  },
};

// ─── Decorative ───────────────────────────────────────────────────────────────

const SolisLogo = () => (
  <svg width="30" height="30" viewBox="0 0 32 32" fill="none">
    <rect width="32" height="32" fill="#FFE600" />
    <rect x="4" y="4" width="24" height="24" fill="#FFE600" stroke="#0A0A0A" strokeWidth="2" />
    <circle cx="16" cy="16" r="5" fill="#0A0A0A" />
    {[0, 60, 120, 180, 240, 300].map((deg) => {
      const rad = (deg * Math.PI) / 180;
      const x1 = 16 + 7 * Math.cos(rad);
      const y1 = 16 + 7 * Math.sin(rad);
      const x2 = 16 + 11.5 * Math.cos(rad);
      const y2 = 16 + 11.5 * Math.sin(rad);
      return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#0A0A0A" strokeWidth="2" strokeLinecap="square" />;
    })}
  </svg>
);

const GithubIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
  </svg>
);

// ─── Ticker items ─────────────────────────────────────────────────────────────

const TICKER_ITEMS = [
  "⚡ Solis Escrow · Trustless Bounties on Stellar",
  "🔒 Secured by Soroban Smart Contracts",
  "🌍 Fees under $0.01 · 5-second finality",
  "💰 Multi-Asset: XLM & USDC",
  "🟢 Solis Escrow V1 Active",
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  return (
    <div className="bg-brutal" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>

      {/* ── Navbar ── */}
      <header
        style={{
          background: "#0A0A0A",
          borderBottom: "4px solid #0A0A0A",
          position: "sticky",
          top: 0,
          zIndex: 40,
        }}
      >
        <nav
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            padding: "0 20px",
            height: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 20,
          }}
        >
          {/* Brand */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
            <SolisLogo />
            <div>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 800,
                  fontSize: "1.1rem",
                  color: "#FFE600",
                  letterSpacing: "-0.03em",
                  lineHeight: 1,
                }}
              >
                SOLIS ESCROW
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.6rem",
                  color: "rgba(255,255,255,0.4)",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  lineHeight: 1.2,
                  marginTop: 2,
                }}
              >
                Stellar Testnet
              </div>
            </div>
          </div>

          {/* Desktop nav links */}
          <div
            className="hidden md:flex items-center gap-1"
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
          </div>

          {/* Wallet */}
          <WalletConnect />
        </nav>
      </header>

      {/* ── Ticker tape ── */}
      <div className="ticker-wrap" style={{ padding: "9px 0" }}>
        <div className="ticker-inner">
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <span
              key={i}
              style={{
                display: "inline-block",
                padding: "0 32px",
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                fontSize: "0.82rem",
                letterSpacing: "0.04em",
                color: "#0A0A0A",
                whiteSpace: "nowrap",
              }}
            >
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* ── Hero section ── */}
      <section
        style={{
          background: "#0A0A0A",
          borderBottom: "4px solid #0A0A0A",
          padding: "48px 20px 52px",
        }}
      >
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          {/* Milestone badge */}
          <div
            className="animate-pop-in"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "#FF2D78",
              border: "3px solid #FF2D78",
              boxShadow: "4px 4px 0px #FF2D78",
              padding: "6px 16px",
              marginBottom: 24,
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: "0.75rem",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#FFF",
            }}
          >
            <span className="dot-live" />
            Solis Escrow V1
          </div>

          {/* Hero title */}
          <h1
            className="animate-pop-in delay-100"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: "clamp(2.2rem, 6vw, 4.5rem)",
              lineHeight: 1.0,
              letterSpacing: "-0.04em",
              color: "#FFE600",
              maxWidth: 900,
              marginBottom: 18,
            }}
          >
            Trustless Escrow.<br />
            <span style={{ color: "#00F5FF" }}>Stellar-Powered.</span><br />
            <span style={{ color: "#FF2D78" }}>Open to Everyone.</span>
          </h1>

          {/* Sub-headline */}
          <p
            className="animate-pop-in delay-200"
            style={{
              color: "rgba(255,255,255,0.6)",
              fontWeight: 600,
              fontSize: "clamp(0.95rem, 2vw, 1.15rem)",
              maxWidth: 600,
              lineHeight: 1.65,
              marginBottom: 32,
            }}
          >
            Browse and pledge to decentralized escrows created by builders across the Stellar network.
            Every escrow is secured by a Soroban smart contract. Funds release automatically.
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-3 animate-pop-in delay-300">
            {[
              { icon: "🔒", label: "Non-custodial" },
              { icon: "⚡", label: "5-second finality" },
              { icon: "🌍", label: "< $0.01 fees" },
              { icon: "🤝", label: "Multi-party release" },
              { icon: "💱", label: "XLM + USDC" },
              { icon: "📜", label: "Soroban contracts" },
            ].map(({ icon, label }) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: "rgba(255,255,255,0.05)",
                  border: "2px solid rgba(255,255,255,0.12)",
                  padding: "7px 14px",
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: "0.8rem",
                  color: "rgba(255,255,255,0.75)",
                }}
              >
                <span>{icon}</span>
                {label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Explorer section ── */}
      <main style={{ flex: 1 }}>
        {/* Section header */}
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            padding: "36px 20px 20px",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 6 }}>
            <div>
              <h2
                className="animate-slide-up"
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 800,
                  fontSize: "clamp(1.5rem, 4vw, 2.2rem)",
                  letterSpacing: "-0.03em",
                  color: "#0A0A0A",
                  lineHeight: 1.1,
                  marginBottom: 6,
                }}
              >
                🔍 Escrow Explorer
              </h2>
              <p style={{ fontSize: "0.9rem", fontWeight: 600, color: "rgba(10,10,10,0.55)" }}>
                Browse all active escrows on the Stellar Testnet network. Pledge to any escrow below.
              </p>
            </div>
            <div
              style={{
                background: "#B8FF47",
                border: "3px solid #0A0A0A",
                boxShadow: "4px 4px 0px #0A0A0A",
                padding: "8px 16px",
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                fontSize: "0.8rem",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              🛰️ Live · Stellar Testnet
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 4, background: "#0A0A0A", marginTop: 16, marginBottom: 28 }} />
        </div>

        {/* Feed */}
        <EscrowExplorer />
      </main>

      {/* ── Footer ── */}
      <footer
        style={{
          background: "#0A0A0A",
          borderTop: "4px solid #0A0A0A",
          padding: "24px 20px",
        }}
      >
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <SolisLogo />
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "0.85rem", color: "rgba(255,255,255,0.5)" }}>
              © 2026 Solis Escrow · Built on Stellar
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <a
              href="https://github.com/solis-escrow"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-link"
            >
              <GithubIcon /> GitHub
            </a>
            <span style={{ color: "rgba(255,255,255,0.25)", fontWeight: 700, fontSize: "0.78rem" }}>
              Testnet only · Not for production
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
