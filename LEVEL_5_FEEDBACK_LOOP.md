# Solis Escrow — Level 5 (Blue Belt) Feedback Loop

> **Phase:** Level 5 — Product Scaling & User Retention  
> **Branch:** `level-5-scaling`  
> **Target:** 50+ unique users · 20+ meaningful commits · Iterative UX improvements  
> **Network:** Stellar Testnet  
> **Last Updated:** 2026-07-22

---

## 📋 Iteration Tracking Table

This document tracks user-reported friction points through the full product iteration cycle. Each row represents a feedback signal that has been triaged, planned, and (when shipped) linked to a specific atomic commit.

| User Feedback / Issue | Planned Improvement | Implemented Feature | Git Commit Link |
|---|---|---|---|
| Users cannot browse active campaigns without first connecting their wallet — high drop-off at landing. | Allow anonymous read-only browsing of all escrow listings. Gate wallet prompts only at pledge initiation. | — | — |
| No visible confirmation after a pledge is submitted — users refresh the page to verify. | Build a reusable `PledgeSuccessBanner` component that displays the transaction hash + Stellar Expert deep link on success. | — | — |
| Contract state TTL costs are uncontrolled — persistent storage entries may expire during active campaigns. | Draft TTL extension logic in the Soroban vault to bump persistent storage TTL after every pledge/claim/refund. | — | — |
| No on-chain audit trail for key state transitions (lock, unlock, pledge). | Emit structured Soroban events for `pledge`, `lock`, and `unlock` actions to support indexing and analytics. | — | — |
| Progress bar and goal numbers sourced from mock data — misleads users about real on-chain state. | Wire live `get_goal` and `get_total` RPC reads into every escrow card dynamically. | ✅ Shipped (Level 4) | `3fea262` |

---

## 🗺️ Level 5 Sprint Roadmap

### Phase A — Foundation (This Sprint)
- [ ] Anonymous browsing (no wallet required to explore)
- [ ] `PledgeSuccessBanner` component
- [ ] Soroban event emission scaffolding (`pledge`, `lock`, `unlock`)
- [ ] TTL extension logic in Soroban vault

### Phase B — Scale (50+ Users)
- [ ] Invite / referral flow for new testers
- [ ] Mobile UX audit pass
- [ ] Analytics funnel: Landing → Browse → Pledge → Confirm

### Phase C — Iteration
- [ ] Triage feedback from Phase B testers
- [ ] Ship UX fixes with atomic commits
- [ ] Final documentation sync for submission

---

> 📌 All commits referenced in this table are on the `level-5-scaling` branch unless otherwise noted.  
> 🔗 Verifiable at: [Stellar Expert Testnet Explorer](https://stellar.expert/explorer/testnet)
