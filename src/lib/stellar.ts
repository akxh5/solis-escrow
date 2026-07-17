/**
 * src/lib/stellar.ts
 *
 * Utilities for Stellar Testnet interaction.
 * Yellow Belt: InvokeHostFunction → EscrowVault.pledge() via Soroban RPC.
 *
 * Flow:
 *  1. Load account from Horizon (sequence number).
 *  2. Build InvokeHostFunction via Contract.call("pledge", …).
 *  3. simulateTransaction → assembleTransaction (resource fees + auth entry).
 *  4. Sign prepared XDR via Freighter (StellarWalletsKit.signTransaction).
 *  5. rpc.sendTransaction → poll getTransaction until SUCCESS or FAILED.
 *  6. Return tx hash + Stellar Expert URL.
 *
 * Custom contract errors (Error enum codes 1–5) are decoded from:
 *   a) Simulation error strings  (fastest path — caught before signing)
 *   b) sendTransaction ERROR status errorResult XDR
 *   c) getTransaction FAILED resultXdr  (most reliable on-chain path)
 *   d) Raw error message regex fallback
 */

import {
  Horizon,
  rpc as SorobanRpc,
  Networks,
  TransactionBuilder,
  Contract,
  Address,
  Asset,
  nativeToScVal,
  xdr,
  BASE_FEE,
  Transaction,
  FeeBumpTransaction,
} from "@stellar/stellar-sdk";
import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit";

// ─── Constants ────────────────────────────────────────────────────────────────

export const HORIZON_URL            = "https://horizon-testnet.stellar.org";
export const SOROBAN_RPC_URL        = "https://soroban-testnet.stellar.org";
export const STELLAR_EXPERT_TESTNET = "https://stellar.expert/explorer/testnet";

/**
 * ⚠️  PASTE YOUR CONTRACT ID HERE after running:
 *       stellar contract deploy ...
 *
 * Replace the entire string below with your C... Contract ID.
 * The BountyCard badge turns green and the Pledge button unlocks
 * as soon as a valid 56-character Soroban contract strkey is present.
 */
export const ESCROW_CONTRACT_ID =
  "CAJRAKMQL6AIPWZMOS7PW457RF6T6C67D7EPQIT2TXIPNAHRZX5XYWEZ";

// ─── Cross-asset support ──────────────────────────────────────────────────────

/**
 * Supported pledge assets.
 *  • "XLM"  — Stellar native lumens (Asset.native())
 *  • "USDC" — Circle USDC on Stellar Testnet, identified by the canonical
 *             alpha-4 asset code + issuer. On Testnet the standard test
 *             issuer is used; swap to mainnet issuer for production.
 */
export type AssetType = "XLM" | "USDC";

/** Stellar Testnet USDC issuer (Circle test account). */
export const USDC_ISSUER =
  "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

/**
 * Classic Stellar USDC asset (alpha-4, testnet).
 * Used for trustline checks and amount validation labels.
 */
export const USDC_ASSET = new Asset("USDC", USDC_ISSUER);

/**
 * Soroban token contract address wrapping the USDC asset on Stellar Testnet.
 * This is the SAC (Stellar Asset Contract) address for USDC on testnet.
 * Deployed by Stellar's Asset Contract factory — safe to call `transfer` on.
 */
export const USDC_CONTRACT_ID =
  "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";

/**
 * Stellar Asset Contract (SAC) address for native XLM on Stellar Testnet.
 * Resolved via: `stellar contract id asset --asset native --network testnet`
 * This is the canonical contract address the escrow vault is initialised with.
 */
export const XLM_SAC_CONTRACT_ID =
  "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

// ─── Contract ID validation ───────────────────────────────────────────────────

/**
 * Soroban contract strkeys:
 *  • Always start with "C"
 *  • Are exactly 56 characters long
 *  • Use base-32 alphabet: A-Z and 2-7  (no 0, 1, 8, 9, lowercase)
 */
const CONTRACT_ID_REGEX = /^C[A-Z2-7]{55}$/;

/** The old Orange Belt contract — used as placeholder sentinel so new ID is green. */
const PLACEHOLDER_ID = "CD2EXRDHSQUZYJZ3MTL25K5LJJI7O7HCVZEZM7IFLUXHJISRB24VNT53";

export type ContractIdStatus = "placeholder" | "invalid" | "valid";

/**
 * Classify the current ESCROW_CONTRACT_ID so the UI can show the right badge:
 *  - "placeholder" → still the default value (amber warning)
 *  - "invalid"     → edited but not a valid strkey, e.g. "C<YOUR_ID>" (red error)
 *  - "valid"       → passes the regex, safe to use (green)
 */
export function getContractIdStatus(id: string = ESCROW_CONTRACT_ID): ContractIdStatus {
  if (id === PLACEHOLDER_ID) return "placeholder";
  if (CONTRACT_ID_REGEX.test(id)) return "valid";
  return "invalid";
}

// ─── Contract error map  (mirrors Rust #[contracterror] #[repr(u32)]) ─────────

export const CONTRACT_ERRORS: Record<number, string> = {
  1: "The crowdfund deadline has already passed. No more pledges are accepted.",
  2: "Invalid pledge amount — must be greater than 0 XLM.",
  3: "The funding goal has already been met. Thank you to all backers!",
  4: "Contract has not been initialized yet. Contact the project admin.",
  5: "Unauthorized — you are not the contract admin.",
};

// ─── Lazy singletons ──────────────────────────────────────────────────────────

let _horizonServer: Horizon.Server | null = null;
let _rpcServer: SorobanRpc.Server | null = null;

function getHorizonServer(): Horizon.Server {
  if (!_horizonServer) _horizonServer = new Horizon.Server(HORIZON_URL);
  return _horizonServer;
}
function getRpcServer(): SorobanRpc.Server {
  if (!_rpcServer)
    _rpcServer = new SorobanRpc.Server(SOROBAN_RPC_URL, { allowHttp: false });
  return _rpcServer;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AccountBalance {
  xlm: string;
  raw: Record<string, string>;
}

export interface PledgeResult {
  txHash: string;
  explorerUrl: string;
  /** The asset symbol used for this pledge ("XLM" or "USDC"). */
  assetSymbol: AssetType;
}

// ─── Balance ──────────────────────────────────────────────────────────────────

export async function fetchAccountBalances(
  publicKey: string
): Promise<AccountBalance> {
  const res = await fetch(`${HORIZON_URL}/accounts/${publicKey}`, { cache: "no-store" });
  if (res.status === 404) return { xlm: "0.0000000", raw: {} };
  if (!res.ok) throw new Error(`Horizon error: ${res.status} ${res.statusText}`);

  const data = await res.json();
  const raw: Record<string, string> = {};
  let xlm = "0.0000000";
  for (const b of data.balances ?? []) {
    if (b.asset_type === "native") xlm = b.balance;
    else raw[b.asset_code ?? "UNKNOWN"] = b.balance;
  }
  return { xlm, raw };
}

// ─── Contract error decoder ───────────────────────────────────────────────────

/**
 * Unified decoder for Soroban contract custom errors.
 *
 * Soroban surfaces contract errors in several shapes depending on where
 * in the pipeline the failure occurs.  We probe all known shapes:
 *
 * Shape A — simulation error string from rpc.simulateTransaction:
 *   "HostError: Error { kind: Contract, code: 1, ... }"
 *   "Error(Contract, #1)"
 *
 * Shape B — sendTransaction ERROR with errorResult XDR object
 *   sendResult.errorResult  (xdr.TransactionResult object)
 *
 * Shape C — getTransaction FAILED with resultXdr field
 *   pollResult.resultXdr    (xdr.TransactionResult object or base64 string)
 *
 * Shape D — raw error message regex (catch-all)
 */
function decodeContractError(input: unknown): string | null {
  if (input === null || input === undefined) return null;

  // ── Shape A: plain string (simulation error text) ───────────────────────────
  const tryString = (s: string): string | null => {
    // "Error(Contract, #3)"  or  "contract error: #3"  or  "code: 3"
    const patterns = [
      /Error\s*\(\s*Contract\s*,\s*#(\d+)\s*\)/i,
      /\(Contract\s*,\s*#(\d+)\)/i,
      /contract\s+error.*?#(\d+)/i,
      /HostError.*?code:\s*(\d+)/i,
      /"code":\s*(\d+)/i,
    ];
    for (const re of patterns) {
      const m = s.match(re);
      if (m) {
        const code = parseInt(m[1], 10);
        return CONTRACT_ERRORS[code] ?? `Contract error #${code}.`;
      }
    }
    return null;
  };

  if (typeof input === "string") return tryString(input);
  if (input instanceof Error)    return tryString(input.message);

  // ── Shape B / C: XDR TransactionResult object ───────────────────────────────
  // The stellar-sdk xdr.TransactionResult has .result() → txFailed() → [opResults]
  // Each failed Soroban op has: .value().value() → ScError with contractCode()
  const tryXdrResult = (xdrResult: unknown): string | null => {
    if (!xdrResult || typeof xdrResult !== "object") return null;
    try {
      // It might already be an xdr.TransactionResult instance
      const txRes = xdrResult as xdr.TransactionResult;
      const result = txRes.result();
      // txFailed results expose an array via .results()
      const opResults: unknown[] =
        (result as unknown as { results?: () => unknown[] }).results?.() ?? [];

      for (const op of opResults) {
        try {
          // op → OperationResult → inner → InvokeHostFunctionResult → ScError
          const inner = (op as { value?: () => { value?: () => unknown } })
            .value?.()?.value?.();
          if (inner && typeof inner === "object") {
            // ScError has .code() which returns ScErrorCode xdr enum
            // For contract errors it's ScErrorCode.scecArith / .scecValue etc.
            // But #[contracterror] maps to wasm trap with a specific value:
            const scErr = inner as {
              code?: () => { value: number };
              value?: () => unknown;
            };
            const codeVal = scErr.code?.().value;
            if (typeof codeVal === "number") {
              return CONTRACT_ERRORS[codeVal] ?? `Contract error #${codeVal}.`;
            }
          }
        } catch { /* skip this op */ }
      }
    } catch { /* not a TransactionResult */ }
    return null;
  };

  // ── Shape B: sendResult.errorResult (xdr object) ────────────────────────────
  const obj = input as Record<string, unknown>;

  const xdrAttempt = tryXdrResult(obj.errorResult) ??
                     tryXdrResult(obj.resultXdr);
  if (xdrAttempt) return xdrAttempt;

  // If resultXdr is a base64 string, decode it
  const resultXdrStr = obj.resultXdr;
  if (typeof resultXdrStr === "string") {
    try {
      const parsed = xdr.TransactionResult.fromXDR(resultXdrStr, "base64");
      const fromXdr = tryXdrResult(parsed);
      if (fromXdr) return fromXdr;
      // Also try the string itself for shape A patterns
      const fromStr = tryString(resultXdrStr);
      if (fromStr) return fromStr;
    } catch { /* not valid XDR */ }
  }

  // ── Shape D: error message on the object (Horizon/RPC structured error) ─────
  // Horizon wraps errors: err.response.data.extras.result_codes.operations[0]
  // Soroban RPC: err.response.data.detail  or  err.message
  const responseData = (obj.response as Record<string, unknown> | undefined)?.data as
    Record<string, unknown> | undefined;

  // result_codes path
  const ops = (responseData?.extras as Record<string, unknown> | undefined)
    ?.result_codes as Record<string, unknown> | undefined;
  const opCode = (ops?.operations as string[] | undefined)?.[0] ?? "";
  if (opCode) {
    const fromOpCode = tryString(opCode);
    if (fromOpCode) return fromOpCode;
  }

  // detail / message paths
  for (const key of ["detail", "message", "title", "error"]) {
    const val = responseData?.[key] ?? obj[key];
    if (typeof val === "string") {
      const fromVal = tryString(val);
      if (fromVal) return fromVal;
    }
  }

  return null;
}

// ─── Soroban pledge invocation ────────────────────────────────────────────────

export async function pledgeToEscrow(
  senderPublicKey: string,
  amountXLM: string,
  selectedAsset: AssetType = "XLM"
): Promise<PledgeResult> {
  const rpc     = getRpcServer();
  const horizon = getHorizonServer();

  // ── 1. Load account ─────────────────────────────────────────────────────────
  let senderAccount: Horizon.AccountResponse;
  try {
    senderAccount = await horizon.loadAccount(senderPublicKey);
  } catch {
    throw new Error(
      "Failed to load your account from Horizon. Make sure your Testnet wallet is funded."
    );
  }

  // ── 2. Build InvokeHostFunction ──────────────────────────────────────────────
  const amountFloat = parseFloat(amountXLM);
  if (isNaN(amountFloat) || amountFloat <= 0) throw new Error("Invalid pledge amount.");

  // For both XLM and USDC, amounts are represented in the contract as
  // stroops (10^-7 units). XLM and USDC both use 7 decimal places on Stellar.
  const amountStroops = BigInt(Math.round(amountFloat * 10_000_000));
  const pledgerScVal  = new Address(senderPublicKey).toScVal();
  const amountScVal   = nativeToScVal(amountStroops, { type: "i128" });

  let unsignedTx: ReturnType<TransactionBuilder["build"]>;

  if (selectedAsset === "USDC") {
    /**
     * USDC path — pass the USDC Stellar Asset Contract (SAC) address as the
     * 3rd argument to the escrow contract's `pledge(pledger, amount, asset)` fn.
     * The contract uses this address to call SAC.transfer() on-chain.
     */
    const assetScVal    = new Address(USDC_CONTRACT_ID).toScVal();
    const escrowContract = new Contract(ESCROW_CONTRACT_ID);

    unsignedTx = new TransactionBuilder(senderAccount, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        escrowContract.call("pledge", pledgerScVal, amountScVal, assetScVal)
      )
      .setTimeout(180)
      .build();
  } else {
    /**
     * Native XLM path — pass the XLM SAC address as the 3rd argument.
     * The contract validates this matches the asset stored at initialize-time,
     * then calls XLM_SAC.transfer(pledger, contract, amount) internally.
     */
    const assetScVal    = new Address(XLM_SAC_CONTRACT_ID).toScVal();
    const escrowContract = new Contract(ESCROW_CONTRACT_ID);

    unsignedTx = new TransactionBuilder(senderAccount, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        escrowContract.call("pledge", pledgerScVal, amountScVal, assetScVal)
      )
      .setTimeout(180)
      .build();
  }

  // ── 3. Simulate → assemble (resource fees + Soroban auth entry) ─────────────
  let preparedTx: Transaction | FeeBumpTransaction;
  try {
    const simulation = await rpc.simulateTransaction(unsignedTx);

    if (SorobanRpc.Api.isSimulationError(simulation)) {
      // Decode contract error from simulation error string — this is the
      // most common path for DeadlinePassed / GoalAlreadyMet / InvalidPledgeAmount
      const simErrStr = typeof simulation.error === "string"
        ? simulation.error
        : JSON.stringify(simulation.error ?? "");
      const contractErr = decodeContractError(simErrStr)
                       ?? decodeContractError(simulation);
      if (contractErr) throw new Error(contractErr);
      throw new Error(`Simulation failed: ${simErrStr}`);
    }

    preparedTx = SorobanRpc.assembleTransaction(unsignedTx, simulation).build();
  } catch (err: unknown) {
    if (err instanceof Error) throw err; // already processed above
    const contractErr = decodeContractError(err);
    if (contractErr) throw new Error(contractErr);
    throw new Error(`Simulation failed: ${String(err)}`);
  }

  // ── 4. Sign via Freighter ────────────────────────────────────────────────────
  let signedXDR: string;
  try {
    const { signedTxXdr } = await StellarWalletsKit.signTransaction(
      preparedTx.toXDR(),
      { networkPassphrase: Networks.TESTNET, address: senderPublicKey }
    );
    signedXDR = signedTxXdr;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const lc  = msg.toLowerCase();
    if (lc.includes("declined") || lc.includes("rejected") ||
        lc.includes("cancel")   || lc.includes("user denied")) {
      throw new Error("Transaction was rejected in Freighter.");
    }
    throw new Error(`Signing failed: ${msg}`);
  }

  // ── 5. Submit + poll ─────────────────────────────────────────────────────────
  let txHash: string;
  try {
    const signedTx   = TransactionBuilder.fromXDR(signedXDR, Networks.TESTNET);
    const sendResult = await rpc.sendTransaction(signedTx);

    if (sendResult.status === "ERROR") {
      // errorResult is an xdr.TransactionResult object
      const contractErr = decodeContractError(sendResult.errorResult)
                       ?? decodeContractError(sendResult);
      if (contractErr) throw new Error(contractErr);
      const xdrB64 = sendResult.errorResult?.toXDR("base64") ?? "unknown";
      throw new Error(`RPC rejected the transaction. errorResult XDR: ${xdrB64}`);
    }

    txHash = sendResult.hash;

    // Poll every 2 s until confirmed (up to 60 s)
    const MAX_ATTEMPTS = 30;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const poll = await rpc.getTransaction(txHash);

      if (poll.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) break;

      if (poll.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
        // poll.resultXdr is an xdr.TransactionResult on the SDK type
        const contractErr = decodeContractError(poll.resultXdr)
                         ?? decodeContractError(poll);
        if (contractErr) throw new Error(contractErr);

        // Fallback: try to base64-encode the resultXdr for display
        let xdrInfo = "unknown";
        try {
          xdrInfo = (poll.resultXdr as unknown as { toXDR: (e: string) => string })
            .toXDR("base64");
        } catch { /* ignore */ }
        throw new Error(`Transaction failed on-chain. resultXdr: ${xdrInfo}`);
      }

      if (i === MAX_ATTEMPTS - 1) {
        throw new Error(
          `Transaction ${txHash} still pending after 60 s. Check Stellar Expert for final status.`
        );
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error) throw err;
    const contractErr = decodeContractError(err);
    if (contractErr) throw new Error(contractErr);
    throw new Error(`Submission failed: ${String(err)}`);
  }

  return {
    txHash,
    explorerUrl: `${STELLAR_EXPERT_TESTNET}/tx/${txHash}`,
    assetSymbol: selectedAsset,
  };
}

// ─── Formatters ───────────────────────────────────────────────────────────────

export function truncateKey(publicKey: string, startLen = 4, endLen = 4): string {
  if (!publicKey || publicKey.length < startLen + endLen + 3) return publicKey;
  return `${publicKey.slice(0, startLen)}...${publicKey.slice(-endLen)}`;
}

export function formatXLM(balance: string, decimals = 4): string {
  const num = parseFloat(balance);
  if (isNaN(num)) return "—";
  return num.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function validatePledgeAmount(
  amountStr: string,
  xlmBalance: string,
  asset: AssetType = "XLM"
): string | null {
  const amount  = parseFloat(amountStr);
  const balance = parseFloat(xlmBalance);
  const sym     = asset === "USDC" ? "USDC" : "XLM";

  if (!amountStr || amountStr.trim() === "") return "Please enter an amount.";
  if (isNaN(amount))  return "Please enter a valid number.";
  if (amount <= 0)    return `Amount must be greater than 0 ${sym}.`;
  if (amount < 1)     return `Minimum pledge is 1 ${sym}.`;

  if (asset === "USDC") {
    // For USDC we can't check balance from the XLM field;
    // we just validate the numeric bounds and leave balance guard to Freighter/RPC.
    return null;
  }

  if (isNaN(balance)) return "Could not read your balance.";

  const available = balance - 2; // keep 2 XLM as Stellar reserve
  if (available <= 0) return "Insufficient balance (need at least 2 XLM in reserve).";
  if (amount > available)
    return `Insufficient balance. Max pledgeable: ${available.toFixed(4)} XLM (2 XLM reserve).`;

  return null;
}
