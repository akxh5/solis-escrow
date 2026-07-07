//! # Solis Escrow Vault — Unit Test Suite
//!
//! Orange Belt: 12 tests covering the full contract lifecycle and all error paths.

#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Env,
};

// ─── Constants ────────────────────────────────────────────────────────────────

const XLM: i128 = 10_000_000; // 1 XLM in stroops
const GOAL: i128 = 5_000 * XLM; // 5,000 XLM

// ─── Test helpers ─────────────────────────────────────────────────────────────

/// Boot a fresh environment, register the contract, and return everything needed.
fn setup() -> (Env, Address, EscrowVaultClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, EscrowVault);
    let client = EscrowVaultClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    (env, admin, client)
}

/// Initialize with a deadline 1000 ledgers from now and GOAL stroops.
fn init(env: &Env, admin: &Address, client: &EscrowVaultClient) -> u32 {
    let deadline = env.ledger().sequence() + 1_000;
    client.initialize(admin, &GOAL, &deadline);
    deadline
}

// ─── Test 1: Successful initialization ───────────────────────────────────────

#[test]
fn test_initialize_success() {
    let (env, admin, client) = setup();
    let deadline = env.ledger().sequence() + 500;

    client.initialize(&admin, &GOAL, &deadline);

    assert_eq!(client.get_goal(), GOAL);
    assert_eq!(client.get_deadline(), deadline);
    assert_eq!(client.get_total(), 0);
    assert!(!client.is_claimed());
}

// ─── Test 2: Double initialization is rejected ────────────────────────────────

#[test]
fn test_initialize_only_once() {
    let (env, admin, client) = setup();
    let deadline = env.ledger().sequence() + 500;

    // First call succeeds
    client.initialize(&admin, &GOAL, &deadline);

    // Second call must return AlreadyInitialized
    let result = client.try_initialize(&admin, &GOAL, &deadline);
    assert_eq!(result, Err(Ok(Error::AlreadyInitialized)));
}

// ─── Test 3: Single valid pledge ──────────────────────────────────────────────

#[test]
fn test_single_valid_pledge() {
    let (env, admin, client) = setup();
    init(&env, &admin, &client);

    let pledger = Address::generate(&env);
    let amount  = 50 * XLM;

    client.pledge(&pledger, &amount);

    assert_eq!(client.get_total(), amount);

    let record = client.get_pledge(&pledger).expect("record should exist");
    assert_eq!(record.amount, amount);
    assert_eq!(record.pledger, pledger);
}

// ─── Test 4: Accumulated pledges from multiple users ─────────────────────────

#[test]
fn test_accumulated_pledges() {
    let (env, admin, client) = setup();
    init(&env, &admin, &client);

    let pledges = [100 * XLM, 250 * XLM, 75 * XLM, 500 * XLM];
    let expected_total: i128 = pledges.iter().sum();

    for &amount in &pledges {
        let pledger = Address::generate(&env);
        client.pledge(&pledger, &amount);
    }

    assert_eq!(client.get_total(), expected_total);
}

// ─── Test 5: Pledge after deadline is rejected ────────────────────────────────

#[test]
fn test_error_pledge_past_deadline() {
    let (env, admin, client) = setup();
    let deadline = init(&env, &admin, &client);

    // Fast-forward past the deadline
    env.ledger().set_sequence_number(deadline + 1);

    let pledger = Address::generate(&env);
    let result = client.try_pledge(&pledger, &(10 * XLM));
    assert_eq!(result, Err(Ok(Error::DeadlinePassed)));
}

// ─── Test 6a: Zero pledge is rejected ────────────────────────────────────────

#[test]
fn test_error_pledge_zero_amount() {
    let (env, admin, client) = setup();
    init(&env, &admin, &client);

    let pledger = Address::generate(&env);
    let result = client.try_pledge(&pledger, &0_i128);
    assert_eq!(result, Err(Ok(Error::InvalidPledgeAmount)));
}

// ─── Test 6b: Negative pledge is rejected ────────────────────────────────────

#[test]
fn test_error_pledge_negative_amount() {
    let (env, admin, client) = setup();
    init(&env, &admin, &client);

    let pledger = Address::generate(&env);
    let result = client.try_pledge(&pledger, &(-1 * XLM));
    assert_eq!(result, Err(Ok(Error::InvalidPledgeAmount)));
}

// ─── Test 7: Goal met — pledge after goal is rejected ─────────────────────────

#[test]
fn test_error_pledge_goal_already_met() {
    let (env, admin, client) = setup();
    init(&env, &admin, &client);

    // One pledger fills the entire goal
    let big_pledger = Address::generate(&env);
    client.pledge(&big_pledger, &GOAL);
    assert_eq!(client.get_total(), GOAL);

    // A second pledger is now rejected
    let late_pledger = Address::generate(&env);
    let result = client.try_pledge(&late_pledger, &XLM);
    assert_eq!(result, Err(Ok(Error::GoalAlreadyMet)));
}

// ─── Test 8: Successful admin claim after goal met + deadline passed ──────────

#[test]
fn test_claim_success() {
    let (env, admin, client) = setup();
    let deadline = init(&env, &admin, &client);

    // Fill the goal
    let pledger = Address::generate(&env);
    client.pledge(&pledger, &GOAL);

    // Advance past deadline
    env.ledger().set_sequence_number(deadline + 1);

    // Admin claims — should return the full GOAL amount
    let claimed = client.claim(&admin);
    assert_eq!(claimed, GOAL);
    assert!(client.is_claimed());
}

// ─── Test 9: Claim before deadline is rejected ────────────────────────────────

#[test]
fn test_error_claim_before_deadline() {
    let (env, admin, client) = setup();
    init(&env, &admin, &client);

    // Fill the goal but do NOT advance ledger
    let pledger = Address::generate(&env);
    client.pledge(&pledger, &GOAL);

    // Claim should fail — deadline hasn't passed
    let result = client.try_claim(&admin);
    assert_eq!(result, Err(Ok(Error::ClaimNotAllowed)));
}

// ─── Test 10: Claim when goal not reached is rejected ────────────────────────

#[test]
fn test_error_claim_goal_not_reached() {
    let (env, admin, client) = setup();
    let deadline = init(&env, &admin, &client);

    // Partial pledge — goal not met
    let pledger = Address::generate(&env);
    client.pledge(&pledger, &(100 * XLM)); // only 100 of 5000 XLM

    // Advance past deadline
    env.ledger().set_sequence_number(deadline + 1);

    let result = client.try_claim(&admin);
    assert_eq!(result, Err(Ok(Error::ClaimNotAllowed)));
}

// ─── Test 11: Successful refund when goal not reached after deadline ──────────

#[test]
fn test_refund_disbursal() {
    let (env, admin, client) = setup();
    let deadline = init(&env, &admin, &client);

    // Two pledgers contribute but goal is not reached
    let alice = Address::generate(&env);
    let bob   = Address::generate(&env);
    let alice_amount = 200 * XLM;
    let bob_amount   = 100 * XLM;

    client.pledge(&alice, &alice_amount);
    client.pledge(&bob,   &bob_amount);

    // Advance past deadline (goal of 5000 XLM was not met)
    env.ledger().set_sequence_number(deadline + 1);

    // Both can refund their exact amounts
    let alice_refund = client.refund(&alice);
    let bob_refund   = client.refund(&bob);

    assert_eq!(alice_refund, alice_amount);
    assert_eq!(bob_refund, bob_amount);

    // Records are zeroed out — double refund returns NothingToRefund
    let double_refund = client.try_refund(&alice);
    assert_eq!(double_refund, Err(Ok(Error::NothingToRefund)));
}

// ─── Test 12: Refund not allowed if goal was reached ─────────────────────────

#[test]
fn test_error_refund_goal_reached() {
    let (env, admin, client) = setup();
    let deadline = init(&env, &admin, &client);

    // Fill the goal
    let pledger = Address::generate(&env);
    client.pledge(&pledger, &GOAL);

    // Advance past deadline
    env.ledger().set_sequence_number(deadline + 1);

    // Refund should be denied because goal WAS reached (admin should claim instead)
    let result = client.try_refund(&pledger);
    assert_eq!(result, Err(Ok(Error::NothingToRefund)));
}
