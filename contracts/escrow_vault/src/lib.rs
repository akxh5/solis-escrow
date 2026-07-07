#![no_std]

//! # Solis Escrow Vault — Soroban Smart Contract
//!
//! A simple crowdfund escrow vault on the Stellar Testnet.
//! Anyone can pledge XLM to this contract's balance while the round is live.
//! The contract tracks each pledger's contribution and the running total.
//!
//! ## Key design decisions
//! - Storage is kept in `instance` ledger entries (simplest, fine for a testnet demo).
//! - XLM is handled via the Stellar Asset Contract (SAC) approach: the contract's
//!   *own account* receives the native XLM transfer through an attached token transfer
//!   in the invoking transaction (see `pledge`).
//! - For the Yellow Belt phase, the `pledge` function validates the call and emits an
//!   event; the actual XLM movement is handled by the caller pairing an asset-transfer
//!   operation with the contract invocation (standard Soroban pattern for native XLM).

use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror,
    symbol_short,
    Address, Env, Symbol,
    log,
};

// ─── Storage keys ─────────────────────────────────────────────────────────────

const KEY_ADMIN:    Symbol = symbol_short!("ADMIN");
const KEY_GOAL:     Symbol = symbol_short!("GOAL");
const KEY_DEADLINE: Symbol = symbol_short!("DEADLINE");
const KEY_TOTAL:    Symbol = symbol_short!("TOTAL");

// ─── Data types ───────────────────────────────────────────────────────────────

/// A pledge entry stored per pledger address.
#[contracttype]
#[derive(Clone)]
pub struct PledgeRecord {
    pub pledger:  Address,
    pub amount:   i128,
    pub ledger:   u32,
}

// ─── Custom errors ────────────────────────────────────────────────────────────

/// All contract-specific errors surfaced to the frontend.
/// Each variant maps to a unique integer code that the SDK can decode.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// The crowdfund deadline ledger has already passed.
    DeadlinePassed      = 1,

    /// Pledge amount must be strictly greater than zero.
    InvalidPledgeAmount = 2,

    /// The funding goal has already been met; no further pledges are accepted.
    GoalAlreadyMet      = 3,

    /// Contract has not been initialized yet.
    NotInitialized      = 4,

    /// Caller is not authorized to perform admin operations.
    Unauthorized        = 5,
}

// ─── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct EscrowVault;

#[contractimpl]
impl EscrowVault {
    // ── initialize ──────────────────────────────────────────────────────────────

    /// Initialize the vault.
    ///
    /// # Arguments
    /// * `admin`    – The account that owns this contract (may later release funds).
    /// * `goal`     – Target XLM amount in stroops (1 XLM = 10_000_000 stroops).
    /// * `deadline` – Absolute ledger sequence number after which pledging is closed.
    pub fn initialize(env: Env, admin: Address, goal: i128, deadline: u32) -> Result<(), Error> {
        admin.require_auth();

        env.storage().instance().set(&KEY_ADMIN,    &admin);
        env.storage().instance().set(&KEY_GOAL,     &goal);
        env.storage().instance().set(&KEY_DEADLINE, &deadline);
        env.storage().instance().set(&KEY_TOTAL,    &0_i128);

        log!(&env, "EscrowVault initialized: goal={}, deadline={}", goal, deadline);

        Ok(())
    }

    // ── pledge ──────────────────────────────────────────────────────────────────

    /// Record a pledge by `pledger` of `amount` stroops.
    ///
    /// The *actual XLM transfer* must be paired with this invocation as a
    /// Stellar `Payment` (or SAC `transfer`) operation in the same transaction.
    /// This function validates the round state and emits an event.
    ///
    /// # Arguments
    /// * `pledger` – The account making the pledge (must have signed the transaction).
    /// * `amount`  – Amount in stroops (1 XLM = 10_000_000 stroops). Must be > 0.
    ///
    /// # Errors
    /// * `Error::NotInitialized`    – `initialize` was never called.
    /// * `Error::DeadlinePassed`    – Current ledger ≥ configured deadline.
    /// * `Error::InvalidPledgeAmount` – Amount is zero or negative.
    /// * `Error::GoalAlreadyMet`    – Running total has already reached the goal.
    pub fn pledge(env: Env, pledger: Address, amount: i128) -> Result<(), Error> {
        // Auth: the pledger must have signed this transaction
        pledger.require_auth();

        // ── Guard: initialized? ────────────────────────────────────────────────
        if !env.storage().instance().has(&KEY_GOAL) {
            return Err(Error::NotInitialized);
        }

        // ── Guard: deadline ────────────────────────────────────────────────────
        let deadline: u32 = env.storage().instance().get(&KEY_DEADLINE).unwrap();
        let current_ledger = env.ledger().sequence();
        if current_ledger >= deadline {
            return Err(Error::DeadlinePassed);
        }

        // ── Guard: amount > 0 ──────────────────────────────────────────────────
        if amount <= 0 {
            return Err(Error::InvalidPledgeAmount);
        }

        // ── Guard: goal not yet met ────────────────────────────────────────────
        let goal: i128 = env.storage().instance().get(&KEY_GOAL).unwrap();
        let total: i128 = env.storage().instance().get(&KEY_TOTAL).unwrap();
        if total >= goal {
            return Err(Error::GoalAlreadyMet);
        }

        // ── Record the pledge ──────────────────────────────────────────────────
        let new_total = total + amount;
        env.storage().instance().set(&KEY_TOTAL, &new_total);

        // Per-pledger record (keyed by address)
        let record = PledgeRecord {
            pledger: pledger.clone(),
            amount,
            ledger: current_ledger,
        };
        env.storage().instance().set(&pledger, &record);

        // ── Emit event ─────────────────────────────────────────────────────────
        // Topics:  ["pledge_received", pledger_address]
        // Data:    amount (i128 stroops)
        env.events().publish(
            (symbol_short!("pledge"), pledger.clone()),
            amount,
        );

        log!(&env, "pledge_received: pledger={}, amount={}, total={}", pledger, amount, new_total);

        Ok(())
    }

    // ── get_total ───────────────────────────────────────────────────────────────

    /// Returns the current running total of all pledges (in stroops).
    pub fn get_total(env: Env) -> i128 {
        env.storage().instance().get(&KEY_TOTAL).unwrap_or(0)
    }

    // ── get_goal ────────────────────────────────────────────────────────────────

    /// Returns the funding goal (in stroops).
    pub fn get_goal(env: Env) -> Result<i128, Error> {
        env.storage().instance().get(&KEY_GOAL).ok_or(Error::NotInitialized)
    }

    // ── get_deadline ────────────────────────────────────────────────────────────

    /// Returns the deadline ledger sequence number.
    pub fn get_deadline(env: Env) -> Result<u32, Error> {
        env.storage().instance().get(&KEY_DEADLINE).ok_or(Error::NotInitialized)
    }

    // ── get_pledge ──────────────────────────────────────────────────────────────

    /// Returns the pledge record for a specific pledger, if any.
    pub fn get_pledge(env: Env, pledger: Address) -> Option<PledgeRecord> {
        env.storage().instance().get(&pledger)
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::{Address as _, Ledger}, Env};

    fn setup() -> (Env, Address, EscrowVaultClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, EscrowVault);
        let client: EscrowVaultClient = EscrowVaultClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        (env, admin, client)
    }

    #[test]
    fn test_initialize_and_pledge() {
        let (env, admin, client) = setup();
        // goal = 100 XLM, deadline = current ledger + 1000
        let deadline = env.ledger().sequence() + 1000;
        client.initialize(&admin, &(100 * 10_000_000_i128), &deadline).unwrap();

        let pledger = Address::generate(&env);
        client.pledge(&pledger, &(10 * 10_000_000_i128)).unwrap();

        assert_eq!(client.get_total(), 10 * 10_000_000_i128);
    }

    #[test]
    fn test_error_deadline_passed() {
        let (env, admin, client) = setup();
        let deadline = env.ledger().sequence() + 1;
        client.initialize(&admin, &(100 * 10_000_000_i128), &deadline).unwrap();

        // Advance ledger past deadline
        env.ledger().set_sequence_number(deadline + 1);

        let pledger = Address::generate(&env);
        let result = client.pledge(&pledger, &(10 * 10_000_000_i128));
        assert_eq!(result, Err(Ok(Error::DeadlinePassed)));
    }

    #[test]
    fn test_error_invalid_amount() {
        let (env, admin, client) = setup();
        let deadline = env.ledger().sequence() + 1000;
        client.initialize(&admin, &(100 * 10_000_000_i128), &deadline).unwrap();

        let pledger = Address::generate(&env);
        let result = client.pledge(&pledger, &0_i128);
        assert_eq!(result, Err(Ok(Error::InvalidPledgeAmount)));
    }

    #[test]
    fn test_error_goal_already_met() {
        let (env, admin, client) = setup();
        let goal = 50 * 10_000_000_i128;
        let deadline = env.ledger().sequence() + 1000;
        client.initialize(&admin, &goal, &deadline).unwrap();

        let pledger = Address::generate(&env);
        client.pledge(&pledger, &goal).unwrap(); // fills the goal exactly

        let pledger2 = Address::generate(&env);
        let result = client.pledge(&pledger2, &(1 * 10_000_000_i128));
        assert_eq!(result, Err(Ok(Error::GoalAlreadyMet)));
    }
}
