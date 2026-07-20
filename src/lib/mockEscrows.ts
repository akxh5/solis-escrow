/**
 * src/lib/mockEscrows.ts
 *
 * Realistic mock data for the Escrow Explorer feed.
 * In Level 5, this will be replaced by live Spring Boot API calls +
 * on-chain Soroban RPC data. For now, this provides a realistic,
 * representative dataset for the UI.
 */

import type { EscrowListing } from "./escrowTypes";

export const MOCK_ESCROWS: EscrowListing[] = [
  {
    id: "esc-001",
    contractId: "CA4ZEVCVB2N7N7M3SN3BDTRLXLNCQX4GHP7IY57MCGYTQLSWE6UO5ZMS",
    creatorWallet: "GDQJUTQYK2MQX2ZJARTPAYUJDEFKMPH7GCD5HXN5EOQ4A5ISYS5PUH4",
    title: "Build Solis Escrow Smart Contract",
    description:
      "Implement a secure, multi-party escrow contract on Stellar using Soroban. Funds released upon milestone verification. This is the core contract powering the entire platform.",
    tags: ["Smart Contract", "Bounty", "OSS"],
    githubRepoUrl: "https://github.com/solis-escrow/contracts",
    goalAmount: 5000,
    assetSymbol: "XLM",
    pledgedTotal: 3875,
    pledgerCount: 12,
    fundingPct: 77.5,
    status: "ACTIVE",
    deadlineAt: new Date(Date.now() + 14 * 86400000).toISOString(),
    createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
    accentColor: "yellow",
    recentPledgers: [
      { wallet: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5", amount: 500, assetSymbol: "XLM", txHash: "abc123", pledgedAt: new Date(Date.now() - 1 * 86400000).toISOString() },
      { wallet: "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGWKX2ZXK5QDTXWUIFKYM2", amount: 750, assetSymbol: "XLM", txHash: "def456", pledgedAt: new Date(Date.now() - 2 * 86400000).toISOString() },
    ],
  },
  {
    id: "esc-002",
    contractId: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
    creatorWallet: "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGWKX2ZXK5QDTXWUIFKYM2",
    title: "Soroban DeFi Liquidity Oracle",
    description:
      "Build a decentralized price oracle for Stellar assets using Soroban's on-chain computation. Must support XLM/USDC, XLM/BTC pairs with a 5-second update frequency.",
    tags: ["DeFi", "Infrastructure", "Smart Contract"],
    goalAmount: 12500,
    assetSymbol: "XLM",
    pledgedTotal: 12500,
    pledgerCount: 28,
    fundingPct: 100,
    status: "FUNDED",
    deadlineAt: new Date(Date.now() + 30 * 86400000).toISOString(),
    createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
    accentColor: "cyan",
    recentPledgers: [
      { wallet: "GDQJUTQYK2MQX2ZJARTPAYUJDEFKMPH7GCD5HXN5EOQ4A5ISYS5PUH4", amount: 2000, assetSymbol: "XLM", txHash: "ghi789", pledgedAt: new Date(Date.now() - 3 * 86400000).toISOString() },
      { wallet: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5", amount: 1500, assetSymbol: "XLM", txHash: "jkl012", pledgedAt: new Date(Date.now() - 4 * 86400000).toISOString() },
    ],
  },
  {
    id: "esc-003",
    contractId: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    creatorWallet: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    title: "React Native Stellar Wallet SDK",
    description:
      "Develop a comprehensive React Native SDK for Stellar wallet integration. Must support Freighter, xBull, and Albedo wallets with transaction signing, account management, and Soroban contract interaction.",
    tags: ["Tooling", "Frontend", "OSS"],
    githubRepoUrl: "https://github.com/stellar-mobile/rn-sdk",
    goalAmount: 8000,
    assetSymbol: "USDC",
    pledgedTotal: 1600,
    pledgerCount: 7,
    fundingPct: 20,
    status: "ACTIVE",
    deadlineAt: new Date(Date.now() + 45 * 86400000).toISOString(),
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    accentColor: "pink",
    recentPledgers: [
      { wallet: "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGWKX2ZXK5QDTXWUIFKYM2", amount: 200, assetSymbol: "USDC", txHash: "mno345", pledgedAt: new Date(Date.now() - 1 * 86400000).toISOString() },
    ],
  },
  {
    id: "esc-004",
    contractId: "CC5YOLHFQ5BNRAQSQB35GV47FD3BUVL74YQNQIXCX3BWCB5NNKXNXYZ",
    creatorWallet: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN",
    title: "Stellar Soroban Security Audit Suite",
    description:
      "Create an automated security audit toolchain for Soroban smart contracts. Must detect reentrancy patterns, integer overflow, unauthorized access, and provide a PDF report.",
    tags: ["Security", "Audit", "Tooling"],
    goalAmount: 20000,
    assetSymbol: "XLM",
    pledgedTotal: 14200,
    pledgerCount: 19,
    fundingPct: 71,
    status: "ACTIVE",
    deadlineAt: new Date(Date.now() + 21 * 86400000).toISOString(),
    createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    accentColor: "orange",
    recentPledgers: [
      { wallet: "GDQJUTQYK2MQX2ZJARTPAYUJDEFKMPH7GCD5HXN5EOQ4A5ISYS5PUH4", amount: 3000, assetSymbol: "XLM", txHash: "pqr678", pledgedAt: new Date(Date.now() - 2 * 86400000).toISOString() },
      { wallet: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5", amount: 2500, assetSymbol: "XLM", txHash: "stu901", pledgedAt: new Date(Date.now() - 5 * 86400000).toISOString() },
    ],
  },
  {
    id: "esc-005",
    contractId: "CE3AQHZZ5BNRAQSQB35GV47FD3BUVL74YQNQIXCX3BWCB5NNKXNPQRS",
    creatorWallet: "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGWKX2ZXK5QDTXWUIFKYM2",
    title: "Cross-Chain Bridge: Stellar ↔ Ethereum",
    description:
      "Design and implement a trustless cross-chain bridge between Stellar and Ethereum mainnet. Use a validator network with multisig and Soroban for the Stellar side, Solidity for Ethereum.",
    tags: ["DeFi", "Infrastructure", "Research"],
    goalAmount: 50000,
    assetSymbol: "XLM",
    pledgedTotal: 8750,
    pledgerCount: 31,
    fundingPct: 17.5,
    status: "ACTIVE",
    deadlineAt: new Date(Date.now() + 90 * 86400000).toISOString(),
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    accentColor: "lime",
    recentPledgers: [
      { wallet: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN", amount: 1000, assetSymbol: "XLM", txHash: "vwx234", pledgedAt: new Date(Date.now() - 1 * 86400000).toISOString() },
    ],
  },
  {
    id: "esc-006",
    contractId: "CF5ABCDEFG6BNRAQSQB35GV47FD3BUVL74YQNQIXCX3BWCB5NNKXTUV",
    creatorWallet: "GDQJUTQYK2MQX2ZJARTPAYUJDEFKMPH7GCD5HXN5EOQ4A5ISYS5PUH4",
    title: "Stellar Testnet Block Explorer v2",
    description:
      "Rebuild the Stellar Testnet block explorer with real-time Soroban event decoding, advanced contract invocation visualization, and a developer-friendly API. Open source under MIT.",
    tags: ["Tooling", "OSS", "Frontend"],
    githubRepoUrl: "https://github.com/stellar-explorer/v2",
    goalAmount: 15000,
    assetSymbol: "XLM",
    pledgedTotal: 15000,
    pledgerCount: 44,
    fundingPct: 100,
    status: "RELEASED",
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    accentColor: "cyan",
    recentPledgers: [
      { wallet: "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGWKX2ZXK5QDTXWUIFKYM2", amount: 500, assetSymbol: "XLM", txHash: "yza567", pledgedAt: new Date(Date.now() - 30 * 86400000).toISOString() },
    ],
  },
];

/**
 * Simulates a network fetch with artificial delay.
 * Replace with `fetch("/api/escrows")` in Level 5.
 */
export async function fetchEscrowListings(): Promise<EscrowListing[]> {
  await new Promise((resolve) => setTimeout(resolve, 1400));
  return MOCK_ESCROWS;
}
