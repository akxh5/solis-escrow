"use client";

import { useEffect, useRef } from "react";
import { fetchEscrowEvents } from "@/lib/stellar";
import { useToast } from "@/context/ToastContext";
import { useEscrows } from "@/context/EscrowContext";

/**
 * EventListener runs in the background and polls Soroban RPC for new events
 * (released, refunded). When an event occurs for an escrow in the user's view,
 * it triggers a global success toast and refreshes the escrows.
 */
export default function EventListener() {
  const { showToast } = useToast();
  const { escrows, refreshEscrows } = useEscrows();
  const lastLedgerRef = useRef<number | undefined>(undefined);

  // Use a ref to access the latest escrows without re-triggering the effect
  const escrowsRef = useRef(escrows);
  useEffect(() => {
    escrowsRef.current = escrows;
  }, [escrows]);

  useEffect(() => {
    // Initial fetch to establish baseline ledger
    fetchEscrowEvents().then(({ latestLedger }) => {
      lastLedgerRef.current = latestLedger;
    }).catch(console.error);

    const interval = setInterval(async () => {
      if (!lastLedgerRef.current) return;
      
      try {
        const { latestLedger, events } = await fetchEscrowEvents(lastLedgerRef.current + 1);
        lastLedgerRef.current = latestLedger;

        let requiresRefresh = false;
        
        for (const event of events) {
          // Check if this event corresponds to a known escrow
          const escrow = escrowsRef.current.find(e => e.id === event.escrowId);
          if (escrow) {
            requiresRefresh = true;
            if (event.type === "released") {
              const formattedAmt = (Number(event.amount) / 10_000_000).toFixed(4);
              showToast({
                type: "success",
                title: "Funds Released! 🚀",
                body: `${formattedAmt} ${escrow.assetSymbol} was released for ${escrow.title}.`,
                duration: 8000
              });
            } else if (event.type === "refunded") {
              const formattedAmt = (Number(event.amount) / 10_000_000).toFixed(4);
              showToast({
                type: "success",
                title: "Refund Claimed! ↩️",
                body: `${formattedAmt} ${escrow.assetSymbol} was refunded from ${escrow.title}.`,
                duration: 8000
              });
            }
          }
        }

        if (requiresRefresh) {
          refreshEscrows(true);
        }
      } catch (e) {
        console.error("Event polling failed", e);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [refreshEscrows, showToast]);

  return null;
}
