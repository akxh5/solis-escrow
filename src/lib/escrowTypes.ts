/**
 * src/lib/escrowTypes.ts
 *
 * Shared TypeScript interfaces for the multi-escrow marketplace.
 * These mirror the PostgreSQL schema and on-chain contract state.
 */

export type EscrowStatus = "ACTIVE" | "FUNDED" | "RELEASED" | "REFUNDED" | "EXPIRED" | "CANCELLED";
export type AssetSymbol = "XLM" | "USDC";

export interface Pledger {
  wallet: string;
  amount: number;
  assetSymbol: AssetSymbol;
  txHash: string;
  pledgedAt: string;
}

export interface EscrowListing {
  id: string;
  contractId: string;
  creatorWallet: string;
  title: string;
  description: string;
  tags: string[];
  githubRepoUrl?: string;

  // Financial
  goalAmount: number;
  assetSymbol: AssetSymbol;
  pledgedTotal: number;
  pledgerCount: number;
  fundingPct: number; // 0–100

  // Lifecycle
  status: EscrowStatus;
  deadlineAt?: string;
  createdAt: string;

  // Top pledgers (preview)
  recentPledgers: Pledger[];

  // Cosmetic accent (for neo-brutalist card coloring)
  accentColor: "yellow" | "cyan" | "pink" | "lime" | "orange";
}

/** Tag color mapping for the UI */
export const TAG_COLORS: Record<string, string> = {
  "DeFi":        "tag-cyan",
  "Bounty":      "tag-yellow",
  "OSS":         "tag-lime",
  "Infrastructure": "tag-orange",
  "Tooling":     "tag-pink",
  "Security":    "tag-purple",
  "Frontend":    "tag-white",
  "Smart Contract": "tag-black",
  "Research":    "tag-pink",
  "Audit":       "tag-orange",
};

export function getTagClass(tag: string): string {
  return TAG_COLORS[tag] ?? "tag-white";
}

export function getStatusLabel(status: EscrowStatus): string {
  const labels: Record<EscrowStatus, string> = {
    ACTIVE:    "🟢 Active",
    FUNDED:    "💰 Funded",
    RELEASED:  "✅ Released",
    REFUNDED:  "↩️ Refunded",
    EXPIRED:   "⏰ Expired",
    CANCELLED: "❌ Cancelled",
  };
  return labels[status] ?? status;
}

export function getStatusTagClass(status: EscrowStatus): string {
  const classes: Record<EscrowStatus, string> = {
    ACTIVE:    "tag-lime",
    FUNDED:    "tag-yellow",
    RELEASED:  "tag-cyan",
    REFUNDED:  "tag-white",
    EXPIRED:   "tag-pink",
    CANCELLED: "tag-black",
  };
  return classes[status] ?? "tag-white";
}

export function formatDeadline(deadlineAt?: string): string {
  if (!deadlineAt) return "No deadline";
  const d = new Date(deadlineAt);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  if (diff < 0) return "Expired";
  const days = Math.floor(diff / 86400000);
  if (days > 1) return `${days}d left`;
  const hours = Math.floor(diff / 3600000);
  if (hours > 0) return `${hours}h left`;
  return "< 1h left";
}

export function truncateWallet(wallet: string, start = 6, end = 4): string {
  if (!wallet || wallet.length < start + end + 3) return wallet;
  return `${wallet.slice(0, start)}…${wallet.slice(-end)}`;
}

export function formatAmount(amount: number, symbol: AssetSymbol): string {
  if (amount >= 1_000_000)
    return `${(amount / 1_000_000).toFixed(2)}M ${symbol}`;
  if (amount >= 1_000)
    return `${(amount / 1_000).toFixed(1)}K ${symbol}`;
  return `${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${symbol}`;
}
