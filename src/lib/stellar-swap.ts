/**
 * src/lib/stellar-swap.ts
 *
 * XLM → USDC swap utility using Stellar's classic Horizon PathPaymentStrictSend.
 *
 * Why classic Horizon and not Soroban?
 * ─────────────────────────────────────
 * The Stellar DEX (SDEX / orderbook) runs in the classic layer.
 * PathPaymentStrictSend is a native Horizon operation that routes through the
 * existing XLM/USDC orderbook, giving real liquidity on Testnet without needing
 * a dedicated Soroban AMM contract.  Soroban token swaps will be the next upgrade.
 *
 * Flow
 * ────
 * 1. Fetch live XLM/USDC rate via Horizon /order_book for a realistic estimate.
 * 2. Build a PathPaymentStrictSend transaction:
 *      sendAsset  = XLM (native)
 *      sendAmount = xlmAmount
 *      destAsset  = USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
 *      destMin    = minUsdcExpected  (slippage lower bound, caller applies tolerance)
 *      path       = []  (Horizon auto-routes through the orderbook)
 * 3. Sign via signAndSubmitHandler (Freighter / StellarWalletsKit).
 * 4. Submit to Horizon, poll for confirmation.
 * 5. Return SwapResult with txHash and explorer URL.
 */

import {
  Horizon,
  Networks,
  TransactionBuilder,
  Operation,
  Asset,
  BASE_FEE,
} from "@stellar/stellar-sdk";
import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit";

import {
  HORIZON_URL,
  STELLAR_EXPERT_TESTNET,
  USDC_ISSUER,
} from "./stellar";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Slippage options available in the UI */
export type SlippageTolerance = "0.5" | "1.0";

/** XLM/USDC pair on the Stellar Testnet orderbook */
const USDC_ASSET = new Asset("USDC", USDC_ISSUER);
const XLM_ASSET  = Asset.native();

/** Horizon swap transaction timeout in seconds */
const TX_TIMEOUT_SEC = 180;

/** Horizon submission poll interval and max wait */
const POLL_INTERVAL_MS = 2_000;
const MAX_POLL_ATTEMPTS = 30; // 60 s

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SwapQuote {
  /** Estimated USDC output for the given XLM input at current orderbook rate */
  estimatedUsdc: string;
  /** The raw XLM/USDC mid-price used for the estimate */
  xlmPerUsdc: string;
  /** USDC floor used in the transaction after applying slippage tolerance */
  minUsdcExpected: string;
}

export interface SwapResult {
  txHash: string;
  explorerUrl: string;
  /** XLM sent */
  sentXlm: string;
  /** Minimum USDC that was guaranteed in the transaction */
  minUsdcExpected: string;
}

// ─── Horizon singleton ────────────────────────────────────────────────────────

let _horizon: Horizon.Server | null = null;
function getHorizon(): Horizon.Server {
  if (!_horizon) _horizon = new Horizon.Server(HORIZON_URL);
  return _horizon;
}

// ─── Rate fetcher ─────────────────────────────────────────────────────────────

/**
 * Fetch the current XLM → USDC mid-price from the Stellar Testnet orderbook.
 *
 * Uses Horizon /order_book?selling=native&buying=USDC:issuer to get the
 * best ask price (what you pay in XLM per 1 USDC).
 *
 * Returns price as "XLM per USDC" so that:
 *   estimatedUsdc = xlmAmount / xlmPerUsdc
 */
export async function fetchXlmToUsdcRate(): Promise<{
  xlmPerUsdc: string;
  available: boolean;
}> {
  try {
    const url = new URL(`${HORIZON_URL}/order_book`);
    url.searchParams.set("selling_asset_type", "native");
    url.searchParams.set("buying_asset_type", "credit_alphanum4");
    url.searchParams.set("buying_asset_code", "USDC");
    url.searchParams.set("buying_asset_issuer", USDC_ISSUER);
    url.searchParams.set("limit", "1");

    const res = await fetch(url.toString(), {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) return { xlmPerUsdc: "0", available: false };

    const data = await res.json();
    // asks[0].price = XLM per 1 USDC (the price you pay in XLM to buy USDC)
    const askPrice: string | undefined = data?.asks?.[0]?.price;
    if (!askPrice || parseFloat(askPrice) === 0) {
      return { xlmPerUsdc: "0", available: false };
    }

    return { xlmPerUsdc: askPrice, available: true };
  } catch {
    return { xlmPerUsdc: "0", available: false };
  }
}

/**
 * Compute a SwapQuote from a given XLM input amount, live rate, and slippage.
 *
 * @param xlmAmount       – XLM to send (string, e.g. "100")
 * @param xlmPerUsdc      – rate from fetchXlmToUsdcRate()
 * @param slippage        – "0.5" or "1.0" (percent)
 */
export function computeSwapQuote(
  xlmAmount: string,
  xlmPerUsdc: string,
  slippage: SlippageTolerance
): SwapQuote | null {
  const xlm   = parseFloat(xlmAmount);
  const rate  = parseFloat(xlmPerUsdc);
  const slip  = parseFloat(slippage) / 100;

  if (isNaN(xlm) || xlm <= 0 || isNaN(rate) || rate <= 0) return null;

  const estimatedUsdc = xlm / rate;
  const minUsdc       = estimatedUsdc * (1 - slip);

  return {
    estimatedUsdc:   estimatedUsdc.toFixed(6),
    xlmPerUsdc:      rate.toFixed(7),
    minUsdcExpected: minUsdc.toFixed(6),
  };
}

// ─── Swap executor ────────────────────────────────────────────────────────────

/**
 * Build, sign, and submit an XLM → USDC PathPaymentStrictSend transaction.
 *
 * @param signerPublicKey      – connected wallet public key
 * @param xlmAmount            – XLM to send (human-readable string, e.g. "50")
 * @param minUsdcExpected      – minimum USDC to receive (slippage floor)
 *
 * Signing is delegated to `StellarWalletsKit.signTransaction` — the same
 * mechanism used by the existing pledge flow in stellar.ts.
 */
export async function executeXlmToUsdcSwap(
  signerPublicKey: string,
  xlmAmount: string,
  minUsdcExpected: string
): Promise<SwapResult> {
  const horizon = getHorizon();

  // ── 1. Validate inputs ───────────────────────────────────────────────────────
  const xlmFloat  = parseFloat(xlmAmount);
  const minFloat  = parseFloat(minUsdcExpected);

  if (isNaN(xlmFloat) || xlmFloat <= 0) {
    throw new Error("Invalid XLM amount — must be a positive number.");
  }
  if (isNaN(minFloat) || minFloat <= 0) {
    throw new Error("Invalid minimum USDC — check your slippage settings.");
  }

  // Stellar classic amounts are 7 d.p. — format to exact string
  const xlmStr = xlmFloat.toFixed(7);
  const minStr = minFloat.toFixed(7);

  // ── 2. Load account (sequence number) ───────────────────────────────────────
  let account: Horizon.AccountResponse;
  try {
    account = await horizon.loadAccount(signerPublicKey);
  } catch {
    throw new Error(
      "Could not load your account from Horizon. Make sure your Testnet wallet is funded."
    );
  }

  // ── 3. Build PathPaymentStrictSend ──────────────────────────────────────────
  //
  // PathPaymentStrictSend guarantees the sender pays EXACTLY xlmStr XLM.
  // The DEX finds the best path through the XLM/USDC orderbook; the recipient
  // (self, for a swap) receives at least minStr USDC or the tx fails on-chain.
  //
  // destination = self (swap into own account, not a transfer)
  // path        = []  (empty = Horizon auto-routes; fastest for direct pairs)
  const tx = new TransactionBuilder(account, {
    fee: String(Math.max(parseInt(BASE_FEE), 1000)), // 1000 stroops for DEX ops
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.pathPaymentStrictSend({
        sendAsset:   XLM_ASSET,
        sendAmount:  xlmStr,
        destination: signerPublicKey,
        destAsset:   USDC_ASSET,
        destMin:     minStr,
        path:        [], // empty = let Stellar route via the SDEX orderbook
      })
    )
    .setTimeout(TX_TIMEOUT_SEC)
    .build();

  // ── 4. Sign via Freighter (StellarWalletsKit) ────────────────────────────────
  let signedXDR: string;
  try {
    const { signedTxXdr } = await StellarWalletsKit.signTransaction(
      tx.toXDR(),
      { networkPassphrase: Networks.TESTNET, address: signerPublicKey }
    );
    signedXDR = signedTxXdr;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const lc  = msg.toLowerCase();
    if (lc.includes("declined") || lc.includes("rejected") ||
        lc.includes("cancel")   || lc.includes("user denied")) {
      throw new Error("Swap was rejected in Freighter.");
    }
    throw new Error(`Signing failed: ${msg}`);
  }

  // ── 5. Submit to Horizon + poll ──────────────────────────────────────────────
  let txHash: string;
  try {
    const submitRes = await horizon.submitTransaction(
      TransactionBuilder.fromXDR(signedXDR, Networks.TESTNET)
    );
    txHash = submitRes.hash;
  } catch (err: unknown) {
    // Horizon errors carry result_codes in err.response.data.extras
    const hErr = err as {
      response?: { data?: { extras?: { result_codes?: { operations?: string[] } } } };
      message?: string;
    };
    const opCode =
      hErr?.response?.data?.extras?.result_codes?.operations?.[0] ?? "";

    if (opCode === "op_underfunded") {
      throw new Error("Insufficient XLM balance for this swap.");
    }
    if (opCode === "op_too_few_offers") {
      throw new Error(
        "No DEX liquidity available for XLM → USDC on Testnet. Try a smaller amount."
      );
    }
    if (opCode === "op_cross_self") {
      throw new Error("Your order would cross your own offers. Try a smaller amount.");
    }

    throw new Error(
      hErr?.message ??
      `Swap failed: ${opCode || "unknown error"}. Check Stellar Expert for details.`
    );
  }

  // Classic Horizon transactions confirm synchronously on submission.
  // No need to poll the way Soroban does — submitTransaction resolves
  // only after the transaction is included in a ledger.

  return {
    txHash,
    explorerUrl: `${STELLAR_EXPERT_TESTNET}/tx/${txHash}`,
    sentXlm:        xlmStr,
    minUsdcExpected: minStr,
  };
}

// ─── Input validation ─────────────────────────────────────────────────────────

/**
 * Validates the XLM amount for a swap before building the transaction.
 * Returns a human-readable error string, or null if valid.
 */
export function validateSwapAmount(
  xlmAmountStr: string,
  xlmBalance: string
): string | null {
  if (!xlmAmountStr || xlmAmountStr.trim() === "") return "Enter an amount.";
  const amount  = parseFloat(xlmAmountStr);
  const balance = parseFloat(xlmBalance);

  if (isNaN(amount))  return "Enter a valid number.";
  if (amount <= 0)    return "Amount must be greater than 0.";
  if (amount < 1)     return "Minimum swap is 1 XLM.";
  if (isNaN(balance)) return "Could not read your balance.";

  const available = balance - 2; // Stellar 2 XLM minimum account reserve
  if (available <= 0) return "Insufficient balance (need > 2 XLM reserve).";
  if (amount > available)
    return `Max swappable: ${available.toFixed(4)} XLM (2 XLM reserve held).`;

  return null;
}
