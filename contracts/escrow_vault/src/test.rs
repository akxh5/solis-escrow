//! # Solis Escrow Vault — Unit Test Suite
//!
//! Level 4: 13 tests covering the full multi-asset contract lifecycle and all error paths.
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

    // Deploy a mock Stellar Asset Contract (SAC) for the token used in tests
    let token_admin = Address::generate(&env);
    let token_contract_id = env.register_stellar_asset_contract_v2(token_admin.clone());
    let sac_admin = StellarAssetClient::new(&env, &token_contract_id.address());
    let token_client = TokenClient::new(&env, &token_contract_id.address());
    let asset_address = token_contract_id.address();

    // Mint a large supply to the token admin for distribution in tests
    sac_admin.mint(&token_admin, &(1_000_000 * XLM));

    let contract_id = env.register_contract(None, EscrowVault);
    let client = EscrowVaultClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    // Give the admin some tokens so they can fund test pledgers as needed
    sac_admin.mint(&admin, &(100_000 * XLM));

    (env, admin, client, asset_address, token_client)
}

/// Initialize with a deadline 1000 ledgers from now, GOAL stroops, and the asset address.
fn init(
    env: &Env,
    admin: &Address,
    client: &EscrowVaultClient,
    asset: &Address,
) -> u32 {
    let deadline = env.ledger().sequence() + 1_000;
    client.initialize(admin, &GOAL, &deadline, asset);
    deadline
}

/// Mint tokens directly to a pledger address using the StellarAssetClient.
fn fund_pledger(env: &Env, asset: &Address, pledger: &Address, amount: i128) {
    let sac = StellarAssetClient::new(env, asset);
    sac.mint(pledger, &amount);
}

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

    // First call succeeds
    client.initialize(&admin, &GOAL, &deadline, &asset);

    // Second call must return AlreadyInitialized
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

    // Fast-forward past the deadline
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
    let result = client.try_pledge(&pledger, &0_i128, &asset);
    assert_eq!(result, Err(Ok(Error::InvalidPledgeAmount)));
}

// ─── Test 6b: Negative pledge is rejected ────────────────────────────────────

#[test]
fn test_error_pledge_negative_amount() {
    let (env, admin, client, asset, _token) = setup();
    init(&env, &admin, &client, &asset);

    let pledger = Address::generate(&env);
    let result = client.try_pledge(&pledger, &(-1 * XLM), &asset);
    assert_eq!(result, Err(Ok(Error::InvalidPledgeAmount)));
}

// ─── Test 7: Goal met — pledge after goal is rejected ─────────────────────────

#[test]
fn test_error_pledge_goal_already_met() {
    let (env, admin, client, asset, _token) = setup();
    init(&env, &admin, &client, &asset);

    // One pledger fills the entire goal
    let big_pledger = Address::generate(&env);
    fund_pledger(&env, &asset, &big_pledger, GOAL);
    client.pledge(&big_pledger, &GOAL, &asset);
    assert_eq!(client.get_total(), GOAL);

    // A second pledger is now rejected
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

    let pledger = Address::generate(&env);
    fund_pledger(&env, &asset, &pledger, 50 * XLM);

    // Use a different (wrong) asset address
    let wrong_asset = Address::generate(&env);
    let result = client.try_pledge(&pledger, &(50 * XLM), &wrong_asset);
    assert_eq!(result, Err(Ok(Error::AssetMismatch)));
}

// ─── Test 9: Successful admin claim after goal met + deadline passed ──────────

#[test]
fn test_claim_success() {
    let (env, admin, client, asset, token) = setup();
    let deadline = init(&env, &admin, &client, &asset);

    // Fill the goal
    let pledger = Address::generate(&env);
    fund_pledger(&env, &asset, &pledger, GOAL);
    client.pledge(&pledger, &GOAL, &asset);

    // Advance past deadline
    env.ledger().set_sequence_number(deadline + 1);

    // Admin claims — should return the full GOAL amount
    let claimed = client.claim(&admin);
    assert_eq!(claimed, GOAL);
    assert!(client.is_claimed());

    // Admin's token balance should have increased by GOAL
    assert_eq!(token.balance(&admin), 100_000 * XLM + GOAL);
}

// ─── Test 10: Claim before deadline is rejected ────────────────────────────────

#[test]
fn test_error_claim_before_deadline() {
    let (env, admin, client, asset, _token) = setup();
    init(&env, &admin, &client, &asset);

    // Fill the goal but do NOT advance ledger
    let pledger = Address::generate(&env);
    fund_pledger(&env, &asset, &pledger, GOAL);
    client.pledge(&pledger, &GOAL, &asset);

    // Claim should fail — deadline hasn't passed
    let result = client.try_claim(&admin);
    assert_eq!(result, Err(Ok(Error::ClaimNotAllowed)));
}

// ─── Test 11: Claim when goal not reached is rejected ────────────────────────

#[test]
fn test_error_claim_goal_not_reached() {
    let (env, admin, client, asset, _token) = setup();
    let deadline = init(&env, &admin, &client, &asset);

    // Partial pledge — goal not met
    let pledger = Address::generate(&env);
    fund_pledger(&env, &asset, &pledger, 100 * XLM);
    client.pledge(&pledger, &(100 * XLM), &asset); // only 100 of 5000 XLM

    // Advance past deadline
    env.ledger().set_sequence_number(deadline + 1);

    let result = client.try_claim(&admin);
    assert_eq!(result, Err(Ok(Error::ClaimNotAllowed)));
}

// ─── Test 12: Successful refund when goal not reached after deadline ──────────

#[test]
fn test_refund_disbursal() {
    let (env, admin, client, asset, token) = setup();
    let deadline = init(&env, &admin, &client, &asset);

    // Two pledgers contribute but goal is not reached
    let alice = Address::generate(&env);
    let bob   = Address::generate(&env);
    let alice_amount = 200 * XLM;
    let bob_amount   = 100 * XLM;

    fund_pledger(&env, &asset, &alice, alice_amount);
    fund_pledger(&env, &asset, &bob,   bob_amount);

    client.pledge(&alice, &alice_amount, &asset);
    client.pledge(&bob,   &bob_amount,   &asset);

    // Advance past deadline (goal of 5000 XLM was not met)
    env.ledger().set_sequence_number(deadline + 1);

    // Both can refund their exact amounts
    let alice_refund = client.refund(&alice);
    let bob_refund   = client.refund(&bob);

    assert_eq!(alice_refund, alice_amount);
    assert_eq!(bob_refund, bob_amount);

    // Token balances should be restored
    assert_eq!(token.balance(&alice), alice_amount);
    assert_eq!(token.balance(&bob),   bob_amount);

    // Records are zeroed out — double refund returns NothingToRefund
    let double_refund = client.try_refund(&alice);
    assert_eq!(double_refund, Err(Ok(Error::NothingToRefund)));
}

// ─── Test 13: Refund not allowed if goal was reached ─────────────────────────

#[test]
fn test_error_refund_goal_reached() {
    let (env, admin, client, asset, _token) = setup();
    let deadline = init(&env, &admin, &client, &asset);

    // Fill the goal
    let pledger = Address::generate(&env);
    fund_pledger(&env, &asset, &pledger, GOAL);
    client.pledge(&pledger, &GOAL, &asset);

    // Advance past deadline
    env.ledger().set_sequence_number(deadline + 1);

    // Refund should be denied because goal WAS reached (admin should claim instead)
    let result = client.try_refund(&pledger);
    assert_eq!(result, Err(Ok(Error::NothingToRefund)));
}
