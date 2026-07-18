"use client";

/**
 * src/context/EscrowContext.tsx
 *
 * Global escrow state for the Solis Escrow marketplace.
 *
 * Responsibilities:
 *   1. Loads all escrow listings on mount (mock → Spring Boot API in Level 5).
 *   2. Exposes the full `escrows` array + loading / error states.
 *   3. Provides `updateEscrowAfterPledge(id, amount, asset)` so that any
 *      card can optimistically update its pledgedTotal, pledgerCount, and
 *      fundingPct immediately after a successful on-chain transaction —
 *      without requiring a full page reload.
 *   4. Provides `refreshEscrows()` to re-fetch the full list.
 *
 * In Level 5 this file becomes the single integration point for the Spring Boot
 * REST API: swap `fetchEscrowListings()` for `fetch("/api/escrows")`.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { EscrowListing, AssetSymbol } from "@/lib/escrowTypes";
import { fetchEscrowListings } from "@/lib/mockEscrows";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EscrowContextValue {
  escrows: EscrowListing[];
  loading: boolean;
  error: string | null;
  refreshEscrows: (silent?: boolean) => Promise<void>;
  /** Optimistically updates a single escrow's financial state after a pledge. */
  updateEscrowAfterPledge: (
    escrowId: string,
    pledgedAmount: number,
    asset: AssetSymbol
  ) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const EscrowContext = createContext<EscrowContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function EscrowProvider({ children }: { children: ReactNode }) {
  const [escrows, setEscrows] = useState<EscrowListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  // ── Initial + refresh fetch ───────────────────────────────────────────────
  const refreshEscrows = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);

    try {
      // Level 5: replace with `await (await fetch("/api/escrows")).json()`
      const data = await fetchEscrowListings();
      setEscrows(data);
    } catch {
      setError("Failed to load escrow feed. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refreshEscrows(); }, [refreshEscrows]);

  // ── Optimistic update after pledge ────────────────────────────────────────
  const updateEscrowAfterPledge = useCallback(
    (escrowId: string, pledgedAmount: number, asset: AssetSymbol) => {
      setEscrows((prev) =>
        prev.map((e) => {
          if (e.id !== escrowId) return e;

          // Only update financial fields if the pledged asset matches the escrow asset.
          // (Mixed-asset pledges are a Level 5 concern; here we guard safely.)
          if (e.assetSymbol !== asset) return e;

          const newTotal      = e.pledgedTotal + pledgedAmount;
          const newCount      = e.pledgerCount + 1;
          const newFundingPct = Math.min(
            (newTotal / e.goalAmount) * 100,
            100
          );

          return {
            ...e,
            pledgedTotal: newTotal,
            pledgerCount: newCount,
            fundingPct:   newFundingPct,
            // Automatically promote to FUNDED once goal is reached
            status:
              newFundingPct >= 100 && e.status === "ACTIVE"
                ? "FUNDED"
                : e.status,
          };
        })
      );
    },
    []
  );

  const value: EscrowContextValue = {
    escrows,
    loading,
    error,
    refreshEscrows,
    updateEscrowAfterPledge,
  };

  return (
    <EscrowContext.Provider value={value}>
      {children}
    </EscrowContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useEscrows(): EscrowContextValue {
  const ctx = useContext(EscrowContext);
  if (!ctx) throw new Error("useEscrows must be used inside <EscrowProvider>");
  return ctx;
}
