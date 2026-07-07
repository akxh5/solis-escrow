# Solis Escrow

**A decentralized crowdfunding and bounty platform built on the Stellar Network using Soroban smart contracts.**

Solis Escrow lets developers post bounties backed by XLM held in a trustless Soroban escrow vault. Backers pledge directly to the smart contract; funds are released only when milestones are verified. Built during the White Belt → Yellow Belt milestones of the Solis developer program.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind CSS |
| Wallet | `@creit.tech/stellar-wallets-kit` v2.x · Freighter Browser Extension |
| Blockchain | Stellar Testnet · Soroban Smart Contracts (Rust, `soroban-sdk` v22) |
| RPC | Horizon Testnet · Soroban RPC Testnet |
| Design | Dark glassmorphism · Amber brand · CSS custom properties |

---

## Features

- 🔐 **Freighter wallet integration** — connect/disconnect with session persistence across page refreshes
- 💰 **Live XLM balance** — fetched from Horizon, auto-polls every 30 seconds
- 📜 **Soroban contract invocation** — pledge triggers an `InvokeHostFunction` operation, not a native transfer
- 🛡️ **4-tier error pipeline** — contract errors caught at simulation (before Freighter opens), send, poll, and fallback stages
- 🟢 **Contract ID validation** — UI validates the strkey format (`^C[A-Z2-7]{55}$`) and shows distinct badge states
- ⚡ **4-step tx progress bar** — building → signing → submitting → confirming

---

## Local Setup

### Prerequisites

- Node.js 18+
- [Freighter Wallet](https://freighter.app) browser extension (set to **Testnet**)
- Rust + `wasm32-unknown-unknown` target (for contract development only)
- [Stellar CLI](https://github.com/stellar/stellar-cli) (`cargo install --locked stellar-cli --features opt`)

### 1. Clone & install

```bash
git clone https://github.com/akxh5/solis-escrow.git
cd solis-escrow
npm install
```

### 2. Run the frontend

```bash
npm run dev
# → http://localhost:3000
```

### 3. Connect wallet

Open Freighter, switch network to **Testnet**, and click **Connect Wallet** on the app.  
Fund your testnet account if needed:
```bash
curl "https://friendbot.stellar.org/?addr=YOUR_G_ADDRESS"
```

### 4. Pledge to a bounty

Enter an XLM amount in the BountyCard → click **Pledge to Bounty** → approve in Freighter.  
The transaction invokes the `pledge` function on the live Soroban escrow contract.

---

## Smart Contract

Located in `contracts/escrow_vault/src/lib.rs`.

### Build

```bash
stellar contract build
# Output: target/wasm32v1-none/release/escrow_vault.wasm
```

### Deploy (Testnet)

```bash
stellar contract deploy --wasm target/wasm32v1-none/release/escrow_vault.wasm --source deployer --network testnet
```

### Initialize

```bash
stellar contract invoke --id <CONTRACT_ID> --source deployer --network testnet -- initialize --admin <YOUR_G_ADDRESS> --goal 50000000000 --deadline <LEDGER_NUMBER>
```

> **Note:** `goal` is in stroops (1 XLM = 10,000,000 stroops). `deadline` is a Stellar ledger sequence number (~5s per ledger; 14 days ≈ 241,920 ledgers from current).

### Contract Functions

| Function | Description |
|---|---|
| `initialize(admin, goal, deadline)` | Set vault parameters |
| `pledge(pledger, amount)` | Record a pledge (validates deadline, amount > 0, goal not met) |
| `get_total()` | Returns running pledge total in stroops |
| `get_goal()` | Returns the funding goal in stroops |
| `get_deadline()` | Returns the deadline ledger sequence |
| `get_pledge(address)` | Returns a pledger's record |

### Custom Error Codes

| Code | Variant | Trigger |
|---|---|---|
| `#1` | `DeadlinePassed` | Current ledger ≥ deadline |
| `#2` | `InvalidPledgeAmount` | Amount ≤ 0 |
| `#3` | `GoalAlreadyMet` | Running total ≥ goal |
| `#4` | `NotInitialized` | `initialize` was never called |
| `#5` | `Unauthorized` | Caller is not the admin |

---

## Yellow Belt Deployment Artifacts

### Live Contract

| Field | Value |
|---|---|
| **Contract ID** | `CD2EXRDHSQUZYJZ3MTL25K5LJJI7O7HCVZEZM7IFLUXHJISRB24VNT53` |
| **Network** | Stellar Testnet |
| **Goal** | 5,000 XLM (50,000,000,000 stroops) |
| **Deadline Ledger** | 3,718,186 |
| **Admin** | Deployer keypair |

### Successful Transactions

| Transaction | Hash |
|---|---|
| Contract deploy | `1ecbedc34470695a96bfa7e8e43028591302330f8c31e0ec090b115ed1b61252` |
| Contract initialize | `f3afdd415edabc1d1d05f557accca11da2b3326f969dc1d2081a1983af0ee607` |

🔗 [View contract on Stellar Expert](https://stellar.expert/explorer/testnet/contract/CD2EXRDHSQUZYJZ3MTL25K5LJJI7O7HCVZEZM7IFLUXHJISRB24VNT53)

---

## Screenshots

### Connected UI — Green Contract Badge

![Connected UI with green Soroban contract badge](./ui.png)

### Testnet Transaction — Stellar Expert

![Successful Soroban pledge transaction on Stellar Expert testnet](./testnet.png)

---

## Project Structure

```
solis-escrow/
├── contracts/
│   └── escrow_vault/
│       ├── Cargo.toml          # Crate manifest
│       └── src/lib.rs          # Soroban contract (Rust)
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout + WalletProvider
│   │   ├── page.tsx            # Landing page
│   │   └── globals.css         # Design system (tokens, glassmorphism)
│   ├── components/
│   │   ├── BountyCard.tsx      # Pledge UI + Soroban tx flow
│   │   └── WalletConnect.tsx   # Connect/disconnect button
│   ├── context/
│   │   └── WalletContext.tsx   # Wallet state + session persistence
│   └── lib/
│       └── stellar.ts          # Horizon + Soroban RPC utilities
├── Cargo.toml                  # Workspace root (profile.release lives here)
├── next.config.ts              # Turbopack aliases for Node.js stubs
└── README.md
```

---

## Milestone Progress

| Belt | Goal | Status |
|---|---|---|
| ⚪ White Belt | Freighter connect + XLM balance display | ✅ Complete |
| 🟡 Yellow Belt | Soroban contract deployed + pledge invocation | ✅ Complete |
| 🟠 Orange Belt | Multi-milestone escrow + release logic | 🔜 Next |

---

*Built with ❤️ on Stellar Testnet.*
