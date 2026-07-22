#![no_std]

//! # Solis Escrow Vault — Soroban Smart Contract
//!
//! A crowdfund escrow vault on the Stellar Testnet.
//! Pledgers send XLM or USDC tracked by this contract. After the deadline:
//!   - If goal was MET   → admin can `claim` the full pot.
//!   - If goal was UNMET → each pledger can `refund` their own contribution.
//!
//! Level 4 additions over Orange Belt:
//!   - `initialize` now accepts an `asset: Address` (SAC contract address).
//!   - `pledge` now accepts `asset: Address` and validates it matches the
//!     configured asset before pulling funds via the token SAC interface.
//!   - Supports Native XLM SAC and USDC SAC interchangeably.
//!
//! Level 5 additions (Blue Belt):
//!   - TTL extension on every mutating call — prevents instance storage expiry
//!     during active campaigns (rent optimisation).
//!   - Structured `lock` / `unlock` events scaffold for milestone-phase analytics.
//!   - Persistent storage TTL bump pattern prepared for per-pledger records.

use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror,
    symbol_short,
    token,
    Address, Env, Symbol,
    log,
};

// ─── Storage keys ─────────────────────────────────────────────────────────────

const KEY_ADMIN:    Symbol = symbol_short!("ADMIN");
const KEY_GOAL:     Symbol = symbol_short!("GOAL");
const KEY_DEADLINE: Symbol = symbol_short!("DEADLINE");
const KEY_TOTAL:    Symbol = symbol_short!("TOTAL");
const KEY_CLAIMED:  Symbol = symbol_short!("CLAIMED");
const KEY_ASSET:    Symbol = symbol_short!("ASSET");

// ─── Data types ───────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub struct PledgeRecord {
    pub pledger: Address,
    pub amount:  i128,
    pub ledger:  u32,
}

// ─── Custom errors ────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// Current ledger ≥ deadline → pledging window closed.
    DeadlinePassed      = 1,

    /// Pledge amount must be > 0.
    InvalidPledgeAmount = 2,

    /// Running total has already reached the goal.
    GoalAlreadyMet      = 3,

    /// `initialize` was never called.
    NotInitialized      = 4,

    /// Caller is not the admin.
    Unauthorized        = 5,

    /// `claim` conditions not satisfied:
    /// either deadline has not passed, or goal was not reached.
    ClaimNotAllowed     = 6,

    /// `refund` conditions not satisfied:
    /// either deadline has not passed, goal was reached, or pledger has no record.
    NothingToRefund     = 7,

    /// Contract has already been initialized.
    AlreadyInitialized  = 8,

    /// The asset address provided does not match the configured asset.
    AssetMismatch       = 9,
}

// ─── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct EscrowVault;

#[contractimpl]
impl EscrowVault {
    // ── TTL helpers ─────────────────────────────────────────────────────────────

    /// Bumps instance storage TTL so the vault state never expires while a
    /// campaign is still live. Called at the end of every mutating operation.
    ///
    /// `min_ledgers_to_live`  — how many additional ledgers of lifetime to
    ///   guarantee (≈ 7 days at 5 s/ledger → 120_960 ledgers).
    fn bump_instance_ttl(env: &Env) {
        const TTL_BUMP_LEDGERS: u32 = 120_960; // ~7 days
        env.storage()
            .instance()
            .extend_ttl(TTL_BUMP_LEDGERS, TTL_BUMP_LEDGERS);
    }

    /// Bumps TTL for a specific persistent pledger record key.
    ///
    /// Per-pledger records are in instance storage right now; this helper is
    /// wired up so migration to `persistent()` in a future upgrade is trivial.
    fn bump_pledger_ttl(env: &Env, key: &Address) {
        const PLEDGER_TTL: u32 = 241_920; // ~14 days
        // Currently a no-op guard — will be active when pledger data moves
        // to env.storage().persistent() during the Level 5 storage refactor.
        let _ = (env, key, PLEDGER_TTL); // suppress unused warnings
    }

    // ── initialize ──────────────────────────────────────────────────────────────

    /// Set up the vault. Can only be called once.
    ///
    /// `asset` is the Stellar Asset Contract (SAC) address for the token this
    /// vault will accept — either the Native XLM SAC or the USDC SAC.
    pub fn initialize(
        env:      Env,
        admin:    Address,
        goal:     i128,
        deadline: u32,
        asset:    Address,
    ) -> Result<(), Error> {
        admin.require_auth();

        // Prevent double-initialization
        if env.storage().instance().has(&KEY_GOAL) {
            return Err(Error::AlreadyInitialized);
        }

        env.storage().instance().set(&KEY_ADMIN,    &admin);
        env.storage().instance().set(&KEY_GOAL,     &goal);
        env.storage().instance().set(&KEY_DEADLINE, &deadline);
        env.storage().instance().set(&KEY_TOTAL,    &0_i128);
        env.storage().instance().set(&KEY_CLAIMED,  &false);
        env.storage().instance().set(&KEY_ASSET,    &asset);

        // Bump TTL on init so the vault doesn't expire before the deadline
        Self::bump_instance_ttl(&env);

        log!(&env, "EscrowVault initialized: goal={}, deadline={}, asset={}", goal, deadline, asset);
        Ok(())
    }

    // ── pledge ──────────────────────────────────────────────────────────────────

    /// Record a pledge and pull funds from the pledger via the token SAC.
    ///
    /// `asset` must match the SAC address stored during `initialize`.
    /// The contract calls `token::Client::transfer_from` on that SAC to
    /// move `amount` stroops from `pledger` to the contract itself.
    pub fn pledge(
        env:     Env,
        pledger: Address,
        amount:  i128,
        asset:   Address,
    ) -> Result<(), Error> {
        pledger.require_auth();

        if !env.storage().instance().has(&KEY_GOAL) {
            return Err(Error::NotInitialized);
        }

        // Validate the supplied asset matches the one configured at init-time
        let configured_asset: Address = env.storage().instance().get(&KEY_ASSET).unwrap();
        if asset != configured_asset {
            return Err(Error::AssetMismatch);
        }

        let deadline: u32 = env.storage().instance().get(&KEY_DEADLINE).unwrap();
        if env.ledger().sequence() >= deadline {
            return Err(Error::DeadlinePassed);
        }

        if amount <= 0 {
            return Err(Error::InvalidPledgeAmount);
        }

        let goal: i128  = env.storage().instance().get(&KEY_GOAL).unwrap();
        let total: i128 = env.storage().instance().get(&KEY_TOTAL).unwrap();
        if total >= goal {
            return Err(Error::GoalAlreadyMet);
        }

        // Pull funds from the pledger via the Stellar Asset Contract (SAC).
        // The pledger must have authorised this contract to spend on their behalf
        // (handled by the auth entry assembled by assembleTransaction on the frontend).
        let token_client = token::Client::new(&env, &configured_asset);
        token_client.transfer(&pledger, &env.current_contract_address(), &amount);

        let new_total = total + amount;
        env.storage().instance().set(&KEY_TOTAL, &new_total);

        let record = PledgeRecord {
            pledger: pledger.clone(),
            amount,
            ledger: env.ledger().sequence(),
        };
        env.storage().instance().set(&pledger, &record);

        // Bump TTL on every pledge to extend campaign state lifetime
        Self::bump_instance_ttl(&env);
        Self::bump_pledger_ttl(&env, &pledger);

        env.events().publish(
            (symbol_short!("pledge"), pledger.clone()),
            amount,
        );

        log!(&env, "pledge_received: pledger={}, amount={}, total={}, asset={}", pledger, amount, new_total, asset);
        Ok(())
    }

    // ── claim ───────────────────────────────────────────────────────────────────

    /// Admin withdraws the entire balance after a successful campaign.
    ///
    /// Requirements: deadline has passed AND total >= goal AND not yet claimed.
    ///
    /// Transfers the full accumulated balance from the contract to the admin
    /// using the stored asset SAC.
    pub fn claim(env: Env, admin: Address) -> Result<i128, Error> {
        admin.require_auth();

        if !env.storage().instance().has(&KEY_GOAL) {
            return Err(Error::NotInitialized);
        }

        // Verify admin identity
        let stored_admin: Address = env.storage().instance().get(&KEY_ADMIN).unwrap();
        if admin != stored_admin {
            return Err(Error::Unauthorized);
        }

        let deadline: u32 = env.storage().instance().get(&KEY_DEADLINE).unwrap();
        let goal: i128    = env.storage().instance().get(&KEY_GOAL).unwrap();
        let total: i128   = env.storage().instance().get(&KEY_TOTAL).unwrap();
        let claimed: bool = env.storage().instance().get(&KEY_CLAIMED).unwrap_or(false);

        // Deadline must have passed
        if env.ledger().sequence() < deadline {
            return Err(Error::ClaimNotAllowed);
        }

        // Goal must have been reached
        if total < goal {
            return Err(Error::ClaimNotAllowed);
        }

        // Can only claim once
        if claimed {
            return Err(Error::ClaimNotAllowed);
        }

        env.storage().instance().set(&KEY_CLAIMED, &true);

        // Transfer the full balance to the admin via the asset SAC
        let asset: Address = env.storage().instance().get(&KEY_ASSET).unwrap();
        let token_client = token::Client::new(&env, &asset);
        token_client.transfer(&env.current_contract_address(), &admin, &total);

        // Bump TTL one final time so the claimed state remains queryable
        Self::bump_instance_ttl(&env);

        env.events().publish(
            (symbol_short!("claim"), admin.clone()),
            total,
        );

        log!(&env, "claim: admin={}, amount={}", admin, total);
        Ok(total)
    }

    // ── refund ──────────────────────────────────────────────────────────────────

    /// A pledger reclaims their contribution after a failed campaign.
    ///
    /// Requirements: deadline has passed AND total < goal AND pledger has a record.
    ///
    /// Transfers the pledger's contribution back via the asset SAC.
    pub fn refund(env: Env, pledger: Address) -> Result<i128, Error> {
        pledger.require_auth();

        if !env.storage().instance().has(&KEY_GOAL) {
            return Err(Error::NotInitialized);
        }

        let deadline: u32 = env.storage().instance().get(&KEY_DEADLINE).unwrap();
        let goal: i128    = env.storage().instance().get(&KEY_GOAL).unwrap();
        let total: i128   = env.storage().instance().get(&KEY_TOTAL).unwrap();

        // Deadline must have passed
        if env.ledger().sequence() < deadline {
            return Err(Error::NothingToRefund);
        }

        // Goal must NOT have been reached (failed campaign)
        if total >= goal {
            return Err(Error::NothingToRefund);
        }

        // Pledger must have a record
        let record: Option<PledgeRecord> = env.storage().instance().get(&pledger);
        let record = record.ok_or(Error::NothingToRefund)?;

        if record.amount <= 0 {
            return Err(Error::NothingToRefund);
        }

        let refund_amount = record.amount;

        // Zero out the record so they cannot double-refund
        let zeroed = PledgeRecord {
            pledger: pledger.clone(),
            amount: 0,
            ledger: record.ledger,
        };
        env.storage().instance().set(&pledger, &zeroed);

        // Reduce the total
        let new_total = total - refund_amount;
        env.storage().instance().set(&KEY_TOTAL, &new_total);

        // Return funds to the pledger via the asset SAC
        let asset: Address = env.storage().instance().get(&KEY_ASSET).unwrap();
        let token_client = token::Client::new(&env, &asset);
        token_client.transfer(&env.current_contract_address(), &pledger, &refund_amount);

        // Bump TTL so remaining pledger records stay accessible
        Self::bump_instance_ttl(&env);

        env.events().publish(
            (symbol_short!("refund"), pledger.clone()),
            refund_amount,
        );

        log!(&env, "refund: pledger={}, amount={}", pledger, refund_amount);
        Ok(refund_amount)
    }

    // ── lock / unlock event scaffolds ────────────────────────────────────────────

    /// Emits a `lock` event signalling the campaign has hit its goal and
    /// further pledges are now closed. Callable by admin only.
    ///
    /// This is a *scaffold* for the Level 5 milestone-phase state machine.
    /// The full state-transition guard will be wired in a follow-up commit once
    /// the `LOCKED` storage key is introduced.
    pub fn emit_lock(env: Env, admin: Address) -> Result<(), Error> {
        admin.require_auth();

        if !env.storage().instance().has(&KEY_GOAL) {
            return Err(Error::NotInitialized);
        }

        let stored_admin: Address = env.storage().instance().get(&KEY_ADMIN).unwrap();
        if admin != stored_admin {
            return Err(Error::Unauthorized);
        }

        env.events().publish(
            (symbol_short!("lock"), admin.clone()),
            env.ledger().sequence(),
        );

        log!(&env, "campaign_locked: admin={}, ledger={}", admin, env.ledger().sequence());
        Ok(())
    }

    /// Emits an `unlock` event signalling the campaign deadline has expired
    /// without meeting goal — refund window is now open. Callable by admin.
    ///
    /// This is a *scaffold* for the Level 5 milestone-phase state machine.
    pub fn emit_unlock(env: Env, admin: Address) -> Result<(), Error> {
        admin.require_auth();

        if !env.storage().instance().has(&KEY_GOAL) {
            return Err(Error::NotInitialized);
        }

        let stored_admin: Address = env.storage().instance().get(&KEY_ADMIN).unwrap();
        if admin != stored_admin {
            return Err(Error::Unauthorized);
        }

        let deadline: u32 = env.storage().instance().get(&KEY_DEADLINE).unwrap();
        if env.ledger().sequence() < deadline {
            return Err(Error::ClaimNotAllowed); // deadline not yet passed
        }

        env.events().publish(
            (symbol_short!("unlock"), admin.clone()),
            env.ledger().sequence(),
        );

        log!(&env, "campaign_unlocked: admin={}, ledger={}", admin, env.ledger().sequence());
        Ok(())
    }

    // ── read-only getters ────────────────────────────────────────────────────────

    pub fn get_total(env: Env) -> i128 {
        env.storage().instance().get(&KEY_TOTAL).unwrap_or(0)
    }

    pub fn get_goal(env: Env) -> Result<i128, Error> {
        env.storage().instance().get(&KEY_GOAL).ok_or(Error::NotInitialized)
    }

    pub fn get_deadline(env: Env) -> Result<u32, Error> {
        env.storage().instance().get(&KEY_DEADLINE).ok_or(Error::NotInitialized)
    }

    pub fn get_asset(env: Env) -> Result<Address, Error> {
        env.storage().instance().get(&KEY_ASSET).ok_or(Error::NotInitialized)
    }

    pub fn get_pledge(env: Env, pledger: Address) -> Option<PledgeRecord> {
        env.storage().instance().get(&pledger)
    }

    pub fn is_claimed(env: Env) -> bool {
        env.storage().instance().get(&KEY_CLAIMED).unwrap_or(false)
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod test;
