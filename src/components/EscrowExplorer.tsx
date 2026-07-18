"use client";

/**
 * src/components/EscrowExplorer.tsx
 *
 * Escrow Explorer feed — now wired to global EscrowContext.
 *
 * All escrow data lives in EscrowContext so that:
 *  - Any card's optimistic pledge update is reflected everywhere instantly.
 *  - A single `refreshEscrows()` call re-fetches the full list.
 *  - Filtering / sorting / search are pure derived state (useMemo).
 */

import { useState, useMemo, useCallback } from "react";
import type { EscrowStatus } from "@/lib/escrowTypes";
import { useEscrows } from "@/context/EscrowContext";
import EscrowCard from "./EscrowCard";
import { EscrowFeedSkeleton } from "./EscrowSkeleton";

// ─── Icons ────────────────────────────────────────────────────────────────────

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

const FilterIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
  </svg>
);

const RefreshIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <polyline points="23 4 23 10 17 10"/>
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
  </svg>
);

// ─── Filter / Sort config ─────────────────────────────────────────────────────

type StatusFilter = "ALL" | EscrowStatus;
type SortMode     = "FUNDED" | "NEWEST" | "BACKERS" | "ENDING";

const STATUS_FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: "ALL",      label: "All Escrows" },
  { key: "ACTIVE",   label: "🟢 Active"   },
  { key: "FUNDED",   label: "💰 Funded"   },
  { key: "RELEASED", label: "✅ Released"  },
  { key: "EXPIRED",  label: "⏰ Expired"  },
];

const SORT_OPTIONS: Array<{ key: SortMode; label: string }> = [
  { key: "FUNDED",  label: "Most Funded %"   },
  { key: "NEWEST",  label: "Newest First"    },
  { key: "BACKERS", label: "Most Backers"    },
  { key: "ENDING",  label: "Ending Soon"     },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function EscrowExplorer() {
  // ── Global escrow state ─────────────────────────────────────────────────
  const { escrows, loading, error, refreshEscrows } = useEscrows();

  // ── Local UI state (filters, search, sort) ──────────────────────────────
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sortMode,     setSortMode]     = useState<SortMode>("FUNDED");
  const [assetFilter,  setAssetFilter]  = useState<"ALL" | "XLM" | "USDC">("ALL");
  const [searchQuery,  setSearchQuery]  = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ── Refresh handler ─────────────────────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refreshEscrows(true); // silent = don't show full skeleton
    setIsRefreshing(false);
  }, [refreshEscrows]);

  // ── Derived: filtered + sorted escrows ─────────────────────────────────
  const filtered = useMemo(() => {
    let result = [...escrows];

    if (statusFilter !== "ALL") {
      result = result.filter((e) => e.status === statusFilter);
    }
    if (assetFilter !== "ALL") {
      result = result.filter((e) => e.assetSymbol === assetFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (e) =>
          e.title.toLowerCase().includes(q)           ||
          e.description.toLowerCase().includes(q)     ||
          e.tags.some((t) => t.toLowerCase().includes(q)) ||
          e.creatorWallet.toLowerCase().includes(q)
      );
    }

    switch (sortMode) {
      case "FUNDED":
        result.sort((a, b) => b.fundingPct - a.fundingPct);
        break;
      case "NEWEST":
        result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case "BACKERS":
        result.sort((a, b) => b.pledgerCount - a.pledgerCount);
        break;
      case "ENDING":
        result.sort((a, b) => {
          if (!a.deadlineAt) return 1;
          if (!b.deadlineAt) return -1;
          return new Date(a.deadlineAt).getTime() - new Date(b.deadlineAt).getTime();
        });
        break;
    }
    return result;
  }, [escrows, statusFilter, sortMode, assetFilter, searchQuery]);

  // ── Summary stats (live — reflect optimistic updates) ──────────────────
  const stats = useMemo(() => ({
    total:         escrows.length,
    active:        escrows.filter((e) => e.status === "ACTIVE").length,
    totalXLM:      escrows.reduce((s, e) => s + (e.assetSymbol === "XLM" ? e.pledgedTotal : 0), 0),
    totalPledgers: escrows.reduce((s, e) => s + e.pledgerCount, 0),
  }), [escrows]);

  // ── Clear all filters helper ────────────────────────────────────────────
  const clearFilters = useCallback(() => {
    setStatusFilter("ALL");
    setAssetFilter("ALL");
    setSearchQuery("");
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <section
      id="escrow-explorer"
      style={{ width: "100%", maxWidth: 1280, margin: "0 auto", padding: "0 20px 60px" }}
    >
      {/* ── Live stats bar ── */}
      {!loading && !error && (
        <div
          className="animate-slide-up"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            border: "4px solid #0A0A0A",
            boxShadow: "5px 5px 0px #0A0A0A",
            marginBottom: 28,
            background: "#FFF",
          }}
        >
          {[
            { label: "Total Escrows", value: stats.total,                                    accent: "#FFE600" },
            { label: "Active Now",    value: stats.active,                                   accent: "#B8FF47" },
            { label: "XLM Pledged",   value: `${(stats.totalXLM / 1000).toFixed(1)}K`,      accent: "#00F5FF" },
            { label: "Total Backers", value: stats.totalPledgers,                            accent: "#FF2D78" },
          ].map(({ label, value, accent }, i) => (
            <div
              key={label}
              style={{
                padding: "16px 20px",
                borderRight: i < 3 ? "3px solid #0A0A0A" : "none",
                borderTop: `5px solid ${accent}`,
                transition: "all 0.3s ease",
              }}
            >
              <p style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "1.6rem", lineHeight: 1, marginBottom: 4 }}>
                {value}
              </p>
              <p style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.5 }}>
                {label}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ── Controls ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 24 }}>

        {/* Search row */}
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "#FFF",
              border: "3px solid #0A0A0A",
              boxShadow: "4px 4px 0px #0A0A0A",
              padding: "10px 14px",
            }}
          >
            <span style={{ color: "rgba(10,10,10,0.4)", flexShrink: 0 }}>
              <SearchIcon />
            </span>
            <input
              id="escrow-search"
              type="text"
              placeholder="Search by title, tag, or wallet address…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                fontSize: "0.9rem",
                color: "#0A0A0A",
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
                style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 800, fontSize: "1.2rem", color: "#0A0A0A", lineHeight: 1, padding: 0 }}
              >
                ×
              </button>
            )}
          </div>

          <button
            id="refresh-escrows-btn"
            onClick={handleRefresh}
            disabled={loading || isRefreshing}
            className="btn-brutal btn-black"
            style={{ padding: "12px 16px" }}
            aria-label="Refresh escrow feed"
          >
            <span style={{ display: "inline-block", animation: isRefreshing ? "spin 0.65s linear infinite" : "none" }}>
              <RefreshIcon />
            </span>
          </button>
        </div>

        {/* Filters + Sort row */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>

          {/* Status tabs */}
          <div
            role="group"
            aria-label="Filter by status"
            style={{ display: "flex", gap: 0, border: "3px solid #0A0A0A", boxShadow: "3px 3px 0px #0A0A0A", overflow: "hidden" }}
          >
            {STATUS_FILTERS.map(({ key, label }, i) => (
              <button
                key={key}
                id={`filter-${key.toLowerCase()}`}
                onClick={() => setStatusFilter(key)}
                aria-pressed={statusFilter === key}
                style={{
                  padding: "8px 14px",
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: "0.78rem",
                  letterSpacing: "0.04em",
                  background: statusFilter === key ? "#0A0A0A" : "#FFF",
                  color:      statusFilter === key ? "#FFE600" : "#0A0A0A",
                  border:     "none",
                  borderRight: i < STATUS_FILTERS.length - 1 ? "2px solid #0A0A0A" : "none",
                  cursor: "pointer",
                  transition: "background 0.1s, color 0.1s",
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Asset filter */}
          <div
            role="group"
            aria-label="Filter by asset"
            style={{ display: "flex", gap: 0, border: "3px solid #0A0A0A", boxShadow: "3px 3px 0px #0A0A0A", overflow: "hidden" }}
          >
            {(["ALL", "XLM", "USDC"] as const).map((asset, i) => (
              <button
                key={asset}
                id={`asset-filter-${asset.toLowerCase()}`}
                onClick={() => setAssetFilter(asset)}
                aria-pressed={assetFilter === asset}
                style={{
                  padding: "8px 12px",
                  fontFamily: "var(--font-mono)",
                  fontWeight: 700,
                  fontSize: "0.78rem",
                  background: assetFilter === asset ? "#00F5FF" : "#FFF",
                  color: "#0A0A0A",
                  border: "none",
                  borderRight: i < 2 ? "2px solid #0A0A0A" : "none",
                  cursor: "pointer",
                  transition: "background 0.1s",
                }}
              >
                {asset === "ALL" ? "All Assets" : asset}
              </button>
            ))}
          </div>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Sort dropdown */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ opacity: 0.6 }}><FilterIcon /></span>
            <select
              id="escrow-sort"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: "0.82rem",
                background: "#FFF",
                color: "#0A0A0A",
                border: "3px solid #0A0A0A",
                boxShadow: "3px 3px 0px #0A0A0A",
                padding: "8px 12px",
                outline: "none",
                cursor: "pointer",
              }}
            >
              {SORT_OPTIONS.map(({ key, label }) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Result count */}
        {!loading && (
          <p style={{ fontWeight: 700, fontSize: "0.8rem", opacity: 0.55 }}>
            {filtered.length === escrows.length
              ? `Showing all ${escrows.length} escrows`
              : `Showing ${filtered.length} of ${escrows.length} escrows`}
            {searchQuery && ` matching "${searchQuery}"`}
          </p>
        )}
      </div>

      {/* ── Feed grid ── */}
      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 20 }}>
          <EscrowFeedSkeleton />
        </div>

      ) : error ? (
        <div
          style={{
            background: "#FF2D78",
            border: "4px solid #0A0A0A",
            boxShadow: "6px 6px 0px #0A0A0A",
            padding: "32px",
            textAlign: "center",
            color: "#FFF",
          }}
        >
          <p style={{ fontWeight: 800, fontSize: "1.2rem", marginBottom: 8 }}>Failed to Load Escrows</p>
          <p style={{ fontWeight: 600, fontSize: "0.9rem", opacity: 0.85, marginBottom: 20 }}>{error}</p>
          <button onClick={() => refreshEscrows()} className="btn-brutal btn-white">
            Try Again
          </button>
        </div>

      ) : filtered.length === 0 ? (
        <div
          style={{
            background: "#FFE600",
            border: "4px solid #0A0A0A",
            boxShadow: "6px 6px 0px #0A0A0A",
            padding: "48px 32px",
            textAlign: "center",
          }}
        >
          <p style={{ fontWeight: 800, fontSize: "2rem", marginBottom: 8 }}>🔍 No Escrows Found</p>
          <p style={{ fontWeight: 600, fontSize: "1rem", opacity: 0.7, marginBottom: 20 }}>
            Try adjusting your filters or search query.
          </p>
          <button onClick={clearFilters} className="btn-brutal btn-black">
            Clear All Filters
          </button>
        </div>

      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 20 }}>
          {filtered.map((escrow, i) => (
            <EscrowCard key={escrow.id} escrow={escrow} index={i} />
          ))}
        </div>
      )}

      {/* ── Level 5 hint ── */}
      {!loading && !error && (
        <div
          className="animate-slide-up delay-500"
          style={{
            marginTop: 40,
            background: "#0A0A0A",
            border: "4px solid #0A0A0A",
            boxShadow: "6px 6px 0px rgba(10,10,10,0.3)",
            padding: "18px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <span
              style={{
                background: "#FFE600",
                color: "#0A0A0A",
                fontWeight: 800,
                fontSize: "0.68rem",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                padding: "2px 8px",
                marginRight: 10,
              }}
            >
              Coming in Level 5
            </span>
            <span style={{ color: "#FFF", fontWeight: 700, fontSize: "0.9rem" }}>
              Live on-chain indexing via Spring Boot + PostgreSQL. Real-time event feed. Leaderboard.
            </span>
          </div>
          <a
            href="https://github.com/solis-escrow"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-brutal"
            style={{ background: "#FFE600", color: "#0A0A0A", fontSize: "0.82rem", padding: "8px 16px" }}
          >
            Follow on GitHub →
          </a>
        </div>
      )}
    </section>
  );
}
