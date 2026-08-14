//! # Solis Escrow Vault — Unit Test Suite
//!
//! Level 5 (Phase 2): 20 tests covering the full multi-asset contract lifecycle,
//! all error paths, release_escrow_funds, and claim_refund.
//! Tests use the Soroban native token mock to exercise the SAC transfer paths.

#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::{Client as TokenClient, StellarAssetClient},
    Env,
};

// ─── Constants ────────────────────────────────────────────────────────────────

const XLM: i128 = 10_000_000; // 1 XLM in stroops
const GOAL: i128 = 5_000 * XLM; // 5,000 XLM

// ─── Test helpers ─────────────────────────────────────────────────────────────

/// Boot a fresh environment, deploy a mock token (SAC), register the escrow contract,
/// and return everything needed for the tests.
fn setup() -> (Env, Address, EscrowVaultClient<'static>, Address, TokenClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();

    let token_admin = Address::generate(&env);
    let token_contract_id = env.register_stellar_asset_contract_v2(token_admin.clone());
    let sac_admin    = StellarAssetClient::new(&env, &token_contract_id.address());
    let token_client = TokenClient::new(&env, &token_contract_id.address());
    let asset_address = token_contract_id.address();

    sac_admin.mint(&token_admin, &(1_000_000 * XLM));

    let contract_id = env.register_contract(None, EscrowVault);
    let client = EscrowVaultClient::new(&env, &contract_id);
    let admin  = Address::generate(&env);

    // Give the admin a starting balance so balance assertions are unambiguous
    sac_admin.mint(&admin, &(100_000 * XLM));

    (env, admin, client, asset_address, token_client)
}

/// Initialize with a deadline 1000 ledgers from now, GOAL stroops, and the asset address.
fn init(env: &Env, admin: &Address, client: &EscrowVaultClient, asset: &Address) -> u32 {
    let deadline = env.ledger().sequence() + 1_000;
    client.initialize(admin, &GOAL, &deadline, asset);
    deadline
}

/// Mint tokens directly to a pledger address using the StellarAssetClient.
fn fund_pledger(env: &Env, asset: &Address, pledger: &Address, amount: i128) {
    let sac = StellarAssetClient::new(env, asset);
    sac.mint(pledger, &amount);
}

// ═══ Original 14 Tests (unchanged) ══════════════════════════════════════════

// ─── Test 1: Successful initialization ───────────────────────────────────────

#[test]
fn test_initialize_success() {
    let (env, admin, client, asset, _token) = setup();
    let deadline = env.ledger().sequence() + 500;

    client.initialize(&admin, &GOAL, &deadline, &asset);

    assert_eq!(client.get_goal(), GOAL);
    assert_eq!(client.get_deadline(), deadline);
    assert_eq!(client.get_total(), 0);
    assert_eq!(client.get_asset(), asset);
    assert!(!client.is_claimed());
}

// ─── Test 2: Double initialization is rejected ────────────────────────────────

#[test]
fn test_initialize_only_once() {
    let (env, admin, client, asset, _token) = setup();
    let deadline = env.ledger().sequence() + 500;

    client.initialize(&admin, &GOAL, &deadline, &asset);

    let result = client.try_initialize(&admin, &GOAL, &deadline, &asset);
    assert_eq!(result, Err(Ok(Error::AlreadyInitialized)));
}

// ─── Test 3: Single valid pledge ──────────────────────────────────────────────

#[test]
fn test_single_valid_pledge() {
    let (env, admin, client, asset, _token) = setup();
    init(&env, &admin, &client, &asset);

    let pledger = Address::generate(&env);
    let amount  = 50 * XLM;
    fund_pledger(&env, &asset, &pledger, amount);
    client.pledge(&pledger, &amount, &asset);

    assert_eq!(client.get_total(), amount);
    let record = client.get_pledge(&pledger).expect("record should exist");
    assert_eq!(record.amount, amount);
    assert_eq!(record.pledger, pledger);
}

// ─── Test 4: Accumulated pledges from multiple users ─────────────────────────

#[test]
fn test_accumulated_pledges() {
    let (env, admin, client, asset, _token) = setup();
    init(&env, &admin, &client, &asset);

    let pledges = [100 * XLM, 250 * XLM, 75 * XLM, 500 * XLM];
    let expected_total: i128 = pledges.iter().sum();

    for &amount in &pledges {
        let pledger = Address::generate(&env);
        fund_pledger(&env, &asset, &pledger, amount);
        client.pledge(&pledger, &amount, &asset);
    }

    assert_eq!(client.get_total(), expected_total);
}

// ─── Test 5: Pledge after deadline is rejected ────────────────────────────────

#[test]
fn test_error_pledge_past_deadline() {
    let (env, admin, client, asset, _token) = setup();
    let deadline = init(&env, &admin, &client, &asset);

    env.ledger().set_sequence_number(deadline + 1);

    let pledger = Address::generate(&env);
    fund_pledger(&env, &asset, &pledger, 10 * XLM);
    let result = client.try_pledge(&pledger, &(10 * XLM), &asset);
    assert_eq!(result, Err(Ok(Error::DeadlinePassed)));
}

// ─── Test 6a: Zero pledge is rejected ────────────────────────────────────────

#[test]
fn test_error_pledge_zero_amount() {
    let (env, admin, client, asset, _token) = setup();
    init(&env, &admin, &client, &asset);

    let pledger = Address::generate(&env);
    let result  = client.try_pledge(&pledger, &0_i128, &asset);
    assert_eq!(result, Err(Ok(Error::InvalidPledgeAmount)));
}

// ─── Test 6b: Negative pledge is rejected ────────────────────────────────────

#[test]
fn test_error_pledge_negative_amount() {
    let (env, admin, client, asset, _token) = setup();
    init(&env, &admin, &client, &asset);

    let pledger = Address::generate(&env);
    let result  = client.try_pledge(&pledger, &(-1 * XLM), &asset);
    assert_eq!(result, Err(Ok(Error::InvalidPledgeAmount)));
}

// ─── Test 7: Goal met — pledge after goal is rejected ─────────────────────────

#[test]
fn test_error_pledge_goal_already_met() {
    let (env, admin, client, asset, _token) = setup();
    init(&env, &admin, &client, &asset);

    let big_pledger = Address::generate(&env);
    fund_pledger(&env, &asset, &big_pledger, GOAL);
    client.pledge(&big_pledger, &GOAL, &asset);
    assert_eq!(client.get_total(), GOAL);

    let late_pledger = Address::generate(&env);
    fund_pledger(&env, &asset, &late_pledger, XLM);
    let result = client.try_pledge(&late_pledger, &XLM, &asset);
    assert_eq!(result, Err(Ok(Error::GoalAlreadyMet)));
}

// ─── Test 8: Asset mismatch is rejected ──────────────────────────────────────

#[test]
fn test_error_asset_mismatch() {
    let (env, admin, client, asset, _token) = setup();
    init(&env, &admin, &client, &asset);

    let pledger     = Address::generate(&env);
    let wrong_asset = Address::generate(&env);
    fund_pledger(&env, &asset, &pledger, 50 * XLM);

    let result = client.try_pledge(&pledger, &(50 * XLM), &wrong_asset);
    assert_eq!(result, Err(Ok(Error::AssetMismatch)));
}

// ─── Test 9: Successful admin claim after goal met + deadline passed ──────────

#[test]
fn test_claim_success() {
    let (env, admin, client, asset, token) = setup();
    let deadline = init(&env, &admin, &client, &asset);

    let pledger = Address::generate(&env);
    fund_pledger(&env, &asset, &pledger, GOAL);
    client.pledge(&pledger, &GOAL, &asset);

    env.ledger().set_sequence_number(deadline + 1);

    let claimed = client.claim(&admin);
    assert_eq!(claimed, GOAL);
    assert!(client.is_claimed());
    assert_eq!(token.balance(&admin), 100_000 * XLM + GOAL);
}

// ─── Test 10: Claim before deadline is rejected ────────────────────────────────

#[test]
fn test_error_claim_before_deadline() {
    let (env, admin, client, asset, _token) = setup();
    init(&env, &admin, &client, &asset);

    let pledger = Address::generate(&env);
    fund_pledger(&env, &asset, &pledger, GOAL);
    client.pledge(&pledger, &GOAL, &asset);

    let result = client.try_claim(&admin);
    assert_eq!(result, Err(Ok(Error::ClaimNotAllowed)));
}

// ─── Test 11: Claim when goal not reached is rejected ────────────────────────

#[test]
fn test_error_claim_goal_not_reached() {
    let (env, admin, client, asset, _token) = setup();
    let deadline = init(&env, &admin, &client, &asset);

    let pledger = Address::generate(&env);
    fund_pledger(&env, &asset, &pledger, 100 * XLM);
    client.pledge(&pledger, &(100 * XLM), &asset);

    env.ledger().set_sequence_number(deadline + 1);

    let result = client.try_claim(&admin);
    assert_eq!(result, Err(Ok(Error::ClaimNotAllowed)));
}

// ─── Test 12: Successful refund when goal not reached after deadline ──────────

#[test]
fn test_refund_disbursal() {
    let (env, admin, client, asset, token) = setup();
    let deadline = init(&env, &admin, &client, &asset);

    let alice        = Address::generate(&env);
    let bob          = Address::generate(&env);
    let alice_amount = 200 * XLM;
    let bob_amount   = 100 * XLM;

    fund_pledger(&env, &asset, &alice, alice_amount);
    fund_pledger(&env, &asset, &bob,   bob_amount);
    client.pledge(&alice, &alice_amount, &asset);
    client.pledge(&bob,   &bob_amount,   &asset);

    env.ledger().set_sequence_number(deadline + 1);

    let alice_refund = client.refund(&alice);
    let bob_refund   = client.refund(&bob);

    assert_eq!(alice_refund, alice_amount);
    assert_eq!(bob_refund,   bob_amount);
    assert_eq!(token.balance(&alice), alice_amount);
    assert_eq!(token.balance(&bob),   bob_amount);

    // Double refund is blocked
    let double = client.try_refund(&alice);
    assert_eq!(double, Err(Ok(Error::NothingToRefund)));
}

// ─── Test 13: Refund not allowed if goal was reached ─────────────────────────

#[test]
fn test_error_refund_goal_reached() {
    let (env, admin, client, asset, _token) = setup();
    let deadline = init(&env, &admin, &client, &asset);

    let pledger = Address::generate(&env);
    fund_pledger(&env, &asset, &pledger, GOAL);
    client.pledge(&pledger, &GOAL, &asset);

    env.ledger().set_sequence_number(deadline + 1);

    let result = client.try_refund(&pledger);
    assert_eq!(result, Err(Ok(Error::NothingToRefund)));
}

// ─── Test 14: Double initialization is rejected ───────────────────────────────

#[test]
fn test_error_pledge_zero_amount_after_refund() {
    // Regression: verify zero-amount check fires independently of other state
    let (env, admin, client, asset, _token) = setup();
    init(&env, &admin, &client, &asset);
    let pledger = Address::generate(&env);
    let result  = client.try_pledge(&pledger, &0_i128, &asset);
    assert_eq!(result, Err(Ok(Error::InvalidPledgeAmount)));
}

// ═══ Phase 2 Tests ═══════════════════════════════════════════════════════════

// ─── Test 15: release_escrow_funds — successful disbursement ─────────────────

#[test]
fn test_release_escrow_funds_success() {
    let (env, admin, client, asset, token) = setup();
    init(&env, &admin, &client, &asset);

    // Fill the entire goal (no deadline requirement for release_escrow_funds)
    let pledger = Address::generate(&env);
    fund_pledger(&env, &asset, &pledger, GOAL);
    client.pledge(&pledger, &GOAL, &asset);

    assert_eq!(client.get_total(), GOAL);

    let escrow_id: u64 = 1;
    let released = client.release_escrow_funds(&admin, &escrow_id);

    // Returns the full disbursed amount
    assert_eq!(released, GOAL);

    // State is marked as disbursed
    assert!(client.is_claimed());

    // Admin receives the funds on top of their starting balance
    assert_eq!(token.balance(&admin), 100_000 * XLM + GOAL);
}

// ─── Test 16: release_escrow_funds — double-disbursal is rejected ─────────────

#[test]
fn test_release_escrow_funds_double_disbursal_rejected() {
    let (env, admin, client, asset, _token) = setup();
    init(&env, &admin, &client, &asset);

    let pledger = Address::generate(&env);
    fund_pledger(&env, &asset, &pledger, GOAL);
    client.pledge(&pledger, &GOAL, &asset);

    let escrow_id: u64 = 1;
    client.release_escrow_funds(&admin, &escrow_id); // first succeeds

    let result = client.try_release_escrow_funds(&admin, &escrow_id);
    assert_eq!(result, Err(Ok(Error::AlreadyDisbursed)));
}

// ─── Test 17: release_escrow_funds — goal not met is rejected ────────────────

#[test]
fn test_release_escrow_funds_goal_not_met_rejected() {
    let (env, admin, client, asset, _token) = setup();
    init(&env, &admin, &client, &asset);

    // Partial pledge only — goal is NOT reached
    let pledger = Address::generate(&env);
    fund_pledger(&env, &asset, &pledger, 100 * XLM);
    client.pledge(&pledger, &(100 * XLM), &asset);

    let escrow_id: u64 = 1;
    let result = client.try_release_escrow_funds(&admin, &escrow_id);
    assert_eq!(result, Err(Ok(Error::GoalNotMet)));
}

// ─── Test 18: release_escrow_funds — non-admin caller is rejected ─────────────

#[test]
fn test_release_escrow_funds_unauthorized() {
    let (env, admin, client, asset, _token) = setup();
    init(&env, &admin, &client, &asset);

    let pledger = Address::generate(&env);
    fund_pledger(&env, &asset, &pledger, GOAL);
    client.pledge(&pledger, &GOAL, &asset);

    let impostor   = Address::generate(&env);
    let escrow_id: u64 = 1;
    let result = client.try_release_escrow_funds(&impostor, &escrow_id);
    assert_eq!(result, Err(Ok(Error::Unauthorized)));
}

// ─── Test 19: claim_refund — successful refund to contributor ─────────────────

#[test]
fn test_claim_refund_success() {
    let (env, admin, client, asset, token) = setup();
    let deadline = init(&env, &admin, &client, &asset);

    // Alice pledges 300 XLM but goal of 5000 XLM is NOT reached
    let alice        = Address::generate(&env);
    let alice_amount = 300 * XLM;
    fund_pledger(&env, &asset, &alice, alice_amount);
    client.pledge(&alice, &alice_amount, &asset);

    // Deadline passes
    env.ledger().set_sequence_number(deadline + 1);

    let escrow_id: u64 = 1;
    let refunded = client.claim_refund(&escrow_id, &alice);

    // Exact pledged amount is returned
    assert_eq!(refunded, alice_amount);

    // Alice's token balance is fully restored
    assert_eq!(token.balance(&alice), alice_amount);

    // Reentrancy guard: second call is blocked
    let double = client.try_claim_refund(&escrow_id, &alice);
    assert_eq!(double, Err(Ok(Error::NothingToRefund)));
}

// ─── Test 20: claim_refund — reentrancy double-refund is rejected ─────────────

#[test]
fn test_claim_refund_double_refund_rejected() {
    let (env, admin, client, asset, _token) = setup();
    let deadline = init(&env, &admin, &client, &asset);

    let alice        = Address::generate(&env);
    let alice_amount = 150 * XLM;
    fund_pledger(&env, &asset, &alice, alice_amount);
    client.pledge(&alice, &alice_amount, &asset);

    env.ledger().set_sequence_number(deadline + 1);

    let escrow_id: u64 = 42;
    client.claim_refund(&escrow_id, &alice); // first succeeds

    // Second call must fail — record was zeroed before the first transfer
    let result = client.try_claim_refund(&escrow_id, &alice);
    assert_eq!(result, Err(Ok(Error::NothingToRefund)));
}

// ─── Test 21: claim_refund — rejected when goal was met ───────────────────────

#[test]
fn test_claim_refund_rejected_when_goal_met() {
    let (env, admin, client, asset, _token) = setup();
    let deadline = init(&env, &admin, &client, &asset);

    // Fill the entire goal
    let pledger = Address::generate(&env);
    fund_pledger(&env, &asset, &pledger, GOAL);
    client.pledge(&pledger, &GOAL, &asset);

    env.ledger().set_sequence_number(deadline + 1);

    let escrow_id: u64 = 1;
    // Refund must be denied — goal was reached, admin should use release_escrow_funds
    let result = client.try_claim_refund(&escrow_id, &pledger);
    assert_eq!(result, Err(Ok(Error::NothingToRefund)));
}

// ─── Test 22: claim_refund — rejected before deadline passes ─────────────────

#[test]
fn test_claim_refund_before_deadline_rejected() {
    let (env, admin, client, asset, _token) = setup();
    init(&env, &admin, &client, &asset); // deadline = current + 1000

    let alice = Address::generate(&env);
    fund_pledger(&env, &asset, &alice, 50 * XLM);
    client.pledge(&alice, &(50 * XLM), &asset);

    // Do NOT advance ledger — deadline has NOT passed
    let escrow_id: u64 = 5;
    let result = client.try_claim_refund(&escrow_id, &alice);
    assert_eq!(result, Err(Ok(Error::NothingToRefund)));
}
