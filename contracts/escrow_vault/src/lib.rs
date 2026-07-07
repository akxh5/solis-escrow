#![no_std]

//! # Solis Escrow Vault — Soroban Smart Contract
//!
//! A crowdfund escrow vault on the Stellar Testnet.
//! Pledgers send XLM tracked by this contract. After the deadline:
//!   - If goal was MET   → admin can `claim` the full pot.
//!   - If goal was UNMET → each pledger can `refund` their own contribution.
//!
//! Orange Belt additions over Yellow Belt:
//!   - `claim(admin)`  — admin withdraws the full balance after a successful round.
//!   - `refund(pledger)` — pledger reclaims their contribution after a failed round.
//!   - Two new Error variants: `ClaimNotAllowed` (#6), `NothingToRefund` (#7).

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
}

// ─── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct EscrowVault;

#[contractimpl]
impl EscrowVault {
    // ── initialize ──────────────────────────────────────────────────────────────

    /// Set up the vault. Can only be called once.
    pub fn initialize(env: Env, admin: Address, goal: i128, deadline: u32) -> Result<(), Error> {
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

        log!(&env, "EscrowVault initialized: goal={}, deadline={}", goal, deadline);
        Ok(())
    }

    // ── pledge ──────────────────────────────────────────────────────────────────

    /// Record a pledge. The actual token transfer must be paired in the same tx.
    pub fn pledge(env: Env, pledger: Address, amount: i128) -> Result<(), Error> {
        pledger.require_auth();

        if !env.storage().instance().has(&KEY_GOAL) {
            return Err(Error::NotInitialized);
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

        let new_total = total + amount;
        env.storage().instance().set(&KEY_TOTAL, &new_total);

        let record = PledgeRecord {
            pledger: pledger.clone(),
            amount,
            ledger: env.ledger().sequence(),
        };
        env.storage().instance().set(&pledger, &record);

        env.events().publish(
            (symbol_short!("pledge"), pledger.clone()),
            amount,
        );

        log!(&env, "pledge_received: pledger={}, amount={}, total={}", pledger, amount, new_total);
        Ok(())
    }

    // ── claim ───────────────────────────────────────────────────────────────────

    /// Admin withdraws the entire balance after a successful campaign.
    ///
    /// Requirements: deadline has passed AND total >= goal AND not yet claimed.
    ///
    /// In the Soroban simulation environment (unit tests) the contract does not
    /// actually hold tokens; `claim` records success and emits an event.
    /// On-chain, pair this with a SAC `transfer_from` in the same transaction.
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
    /// Like `claim`, the actual token movement must be paired in the calling tx.
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

        env.events().publish(
            (symbol_short!("refund"), pledger.clone()),
            refund_amount,
        );

        log!(&env, "refund: pledger={}, amount={}", pledger, refund_amount);
        Ok(refund_amount)
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

