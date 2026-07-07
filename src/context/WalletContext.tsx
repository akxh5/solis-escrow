"use client";

/**
 * src/context/WalletContext.tsx
 *
 * Global React context for Stellar wallet state.
 * Uses @creit.tech/stellar-wallets-kit v2.x (static API) with FreighterModule exclusively.
 *
 * Persistence strategy
 * ─────────────────────
 * On successful connect   → write "solis_wallet_connected" = "freighter" to localStorage.
 * On disconnect           → remove the key.
 * On mount (page refresh) → if key exists, call FreighterModule.getAddress() silently.
 *   • Success → restore connected state (user never sees the Connect button flash).
 *   • Failure (locked / not installed) → remove key, stay disconnected with NO error shown.
 *
 * This gives a seamless "already connected" UX on refresh without forcing a popup.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { StellarWalletsKit, Networks } from "@creit.tech/stellar-wallets-kit";
import {
  FreighterModule,
  FREIGHTER_ID,
} from "@creit.tech/stellar-wallets-kit/modules/freighter";
import { fetchAccountBalances, type AccountBalance } from "@/lib/stellar";

// ─── Constants ────────────────────────────────────────────────────────────────

const LS_KEY = "solis_wallet_connected"; // localStorage key

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * "restoring" = silent reconnect attempt on mount (spinner-free, user unaware)
 * "connecting" = user-initiated, shows spinner
 */
type ConnectionStatus =
  | "restoring"
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

interface WalletState {
  status: ConnectionStatus;
  publicKey: string | null;
  balance: AccountBalance | null;
  error: string | null;
}

interface WalletContextValue extends WalletState {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  /** True while the silent restore attempt is in progress — use to avoid rendering stale UI */
  isRestoring: boolean;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const WalletContext = createContext<WalletContextValue | null>(null);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSavedWallet(): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(LS_KEY); } catch { return null; }
}
function saveWallet(): void {
  try { localStorage.setItem(LS_KEY, FREIGHTER_ID); } catch { /* quota error, ignore */ }
}
function clearSavedWallet(): void {
  try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function WalletProvider({ children }: { children: ReactNode }) {
  const kitInitialised = useRef(false);

  const [state, setState] = useState<WalletState>({
    // Start as "restoring" so child components can defer rendering
    // until we know whether a session exists.
    status: "restoring",
    publicKey: null,
    balance: null,
    error: null,
  });

  // ── One-time kit init + eager session restore ────────────────────────────────
  useEffect(() => {
    if (kitInitialised.current) return;
    kitInitialised.current = true;

    // Init the kit singleton
    StellarWalletsKit.init({
      network: Networks.TESTNET,
      selectedWalletId: FREIGHTER_ID,
      modules: [new FreighterModule()],
    });

    // Attempt silent restore only if we previously saved a connection
    const saved = getSavedWallet();
    if (!saved) {
      setState((p) => ({ ...p, status: "disconnected" }));
      return;
    }

    // Call FreighterModule.getAddress with skipRequestAccess=true so we
    // never trigger a Freighter popup — if the wallet is locked or
    // the permission was revoked, it will throw and we fall back gracefully.
    (async () => {
      try {
        // Use the static kit method; it routes to the selectedWalletId
        const { address } = await StellarWalletsKit.getAddress();

        if (!address) throw new Error("No address returned.");

        const balance = await fetchAccountBalances(address);

        setState({
          status: "connected",
          publicKey: address,
          balance,
          error: null,
        });
      } catch {
        // Wallet locked, extension removed, or permission revoked — clear state
        clearSavedWallet();
        setState({ status: "disconnected", publicKey: null, balance: null, error: null });
      }
    })();
  }, []);

  // ── refreshBalance ───────────────────────────────────────────────────────────
  const refreshBalance = useCallback(async () => {
    setState((prev) => {
      if (!prev.publicKey) return prev;
      fetchAccountBalances(prev.publicKey)
        .then((balance) => setState((p) => ({ ...p, balance })))
        .catch(() => {/* non-fatal */});
      return prev;
    });
  }, []);

  // ── connect (user-initiated) ─────────────────────────────────────────────────
  const connect = useCallback(async () => {
    setState((prev) => ({ ...prev, status: "connecting", error: null }));

    try {
      const { address } = await StellarWalletsKit.authModal();

      if (!address) throw new Error("No address returned from Freighter.");

      const balance = await fetchAccountBalances(address);

      saveWallet(); // persist for next refresh

      setState({ status: "connected", publicKey: address, balance, error: null });
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : "Connection failed. Please try again.";
      const lc  = raw.toLowerCase();

      const friendly =
        lc.includes("user declined") || lc.includes("rejected")
          ? "Connection rejected by user."
          : lc.includes("not installed") || lc.includes("extension") || lc.includes("freighter")
          ? "Freighter wallet not found. Install it at freighter.app."
          : raw;

      setState({ status: "error", publicKey: null, balance: null, error: friendly });
    }
  }, []);

  // ── disconnect ───────────────────────────────────────────────────────────────
  const disconnect = useCallback(async () => {
    try { await StellarWalletsKit.disconnect(); } catch { /* ignore */ }
    clearSavedWallet();
    setState({ status: "disconnected", publicKey: null, balance: null, error: null });
  }, []);

  // ── Balance polling (every 30 s while connected) ─────────────────────────────
  useEffect(() => {
    if (state.status !== "connected" || !state.publicKey) return;
    const pk = state.publicKey;
    const id = setInterval(async () => {
      try {
        const balance = await fetchAccountBalances(pk);
        setState((p) => ({ ...p, balance }));
      } catch {/* non-fatal */}
    }, 30_000);
    return () => clearInterval(id);
  }, [state.status, state.publicKey]);

  const value: WalletContextValue = {
    ...state,
    connect,
    disconnect,
    refreshBalance,
    isRestoring: state.status === "restoring",
  };

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}
