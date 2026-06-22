#![cfg(test)]

extern crate std;

use super::*;
use shared::circuit_breaker::CircuitBreakerConfig;
use shared::governance::ProposalStatus;
use soroban_sdk::{
    symbol_short,
    testutils::{Address as _, Ledger},
    Address, Env, String, Vec,
};
use std::string::String as StdString;

use crate::UpgradeableMessagingContractClient;

fn setup_contract(
    env: &Env,
) -> (
    UpgradeableMessagingContractClient<'_>,
    Address,
    Address,
    Address,
) {
    let contract_id = env.register_contract(None, UpgradeableMessagingContract);
    let client = UpgradeableMessagingContractClient::new(env, &contract_id);

    let admin = Address::generate(env);
    let approver = Address::generate(env);
    let executor = Address::generate(env);

    let mut approvers = Vec::new(env);
    approvers.push_back(approver.clone());

    let cb_config = CircuitBreakerConfig {
        max_volume_per_period: 100,
        max_tx_count_per_period: 100,
        period_duration: 3600,
    };

    env.mock_all_auths();
    client.init(&admin, &approvers, &executor, &cb_config);

    (client, admin, approver, executor)
}

#[test]
fn test_contract_initialization() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1000);
    env.mock_all_auths();

    let (client, _admin, _approver, _executor) = setup_contract(&env);
    assert_eq!(client.get_version(), 1);

    let stats = client.get_stats();
    assert_eq!(stats.total_messages, 0);
    assert_eq!(stats.unread_messages, 0);
    assert_eq!(stats.last_message_id, 0);
}

#[test]
fn test_contract_cannot_be_initialized_twice() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1000);
    env.mock_all_auths();

    let contract_id = env.register_contract(None, UpgradeableMessagingContract);
    let client = UpgradeableMessagingContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let approver = Address::generate(&env);
    let executor = Address::generate(&env);

    let mut approvers = Vec::new(&env);
    approvers.push_back(approver.clone());

    let cb_config = CircuitBreakerConfig {
        max_volume_per_period: 100,
        max_tx_count_per_period: 100,
        period_duration: 3600,
    };

    client.init(&admin, &approvers, &executor, &cb_config);

    let result = client.try_init(&admin, &approvers, &executor, &cb_config);
    assert!(result.is_err());
}

// #[test]
// fn test_send_message_with_various_payloads() {
//     let env = Env::default();
//     env.ledger().with_mut(|li| li.timestamp = 1000);

//     let (client, _admin, _approver, _executor) = setup_contract(&env);
//     let alice = Address::generate(&env);
//     let bob = Address::generate(&env);

//     let id1 = client.send_message(&alice, &bob, &String::from_str(&env, "short message"));
//     let id2 = client.send_message(
//         &alice,
//         &bob,
//         &String::from_str(&env, "message with punctuation: hello, bob."),
//     );

//     assert_eq!(id1, 1);
//     assert_eq!(id2, 2);

//     let received = client.get_messages(&bob, &false, &true, &false);
//     assert_eq!(received.len(), 2);
//     assert_eq!(
//         received.get(0).unwrap().payload,
//         String::from_str(&env, "short message")
//     );
//     assert_eq!(
//         received.get(1).unwrap().payload,
//         String::from_str(&env, "message with punctuation: hello, bob.")
//     );

//     let stats = client.get_stats();
//     assert_eq!(stats.total_messages, 2);
//     assert_eq!(stats.unread_messages, 2);
//     assert_eq!(stats.last_message_id, 2);
// }

#[test]
fn test_send_message_rejects_invalid_payloads() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1000);

    let (client, _admin, _approver, _executor) = setup_contract(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    let empty_result = client.try_send_message(&alice, &bob, &String::from_str(&env, ""));
    assert!(empty_result.is_err());

    let oversized = StdString::from("a").repeat(1025);
    let oversized_result =
        client.try_send_message(&alice, &bob, &String::from_str(&env, &oversized));
    assert!(oversized_result.is_err());

    let self_result =
        client.try_send_message(&alice, &alice, &String::from_str(&env, "self message"));
    assert!(self_result.is_err());
}

#[test]
fn test_mark_as_read_updates_unread_counts() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1000);

    let (client, _admin, _approver, _executor) = setup_contract(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    let message_id = client.send_message(&alice, &bob, &String::from_str(&env, "hello"));
    assert_eq!(client.get_unread_count(&bob), 1);

    client.mark_as_read(&bob, &message_id);

    assert_eq!(client.get_unread_count(&bob), 0);

    let received = client.get_messages(&bob, &false, &true, &false);
    assert_eq!(received.len(), 1);
    assert!(received.get(0).unwrap().read);

    let stats = client.get_stats();
    assert_eq!(stats.unread_messages, 0);
}

#[test]
fn test_mark_as_read_rejects_invalid_access() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1000);

    let (client, _admin, _approver, _executor) = setup_contract(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let mallory = Address::generate(&env);

    let message_id = client.send_message(&alice, &bob, &String::from_str(&env, "secret"));

    let wrong_user = client.try_mark_as_read(&mallory, &message_id);
    assert!(wrong_user.is_err());

    let missing_message = client.try_mark_as_read(&bob, &999u64);
    assert!(missing_message.is_err());

    client.mark_as_read(&bob, &message_id);
    let second_read = client.try_mark_as_read(&bob, &message_id);
    assert!(second_read.is_err());
}

// #[test]
// fn test_get_messages_filtering() {
//     let env = Env::default();
//     env.ledger().with_mut(|li| li.timestamp = 1000);

//     let (client, _admin, _approver, _executor) = setup_contract(&env);
//     let alice = Address::generate(&env);
//     let bob = Address::generate(&env);

//     let first_to_bob = client.send_message(&alice, &bob, &String::from_str(&env, "first"));
//     client.send_message(&alice, &bob, &String::from_str(&env, "second"));
//     client.send_message(&bob, &alice, &String::from_str(&env, "reply"));

//     client.mark_as_read(&bob, &first_to_bob);

//     let bob_received = client.get_messages(&bob, &false, &true, &false);
//     assert_eq!(bob_received.len(), 2);
//     assert_eq!(
//         bob_received.get(0).unwrap().payload,
//         String::from_str(&env, "first")
//     );
//     assert_eq!(
//         bob_received.get(1).unwrap().payload,
//         String::from_str(&env, "second")
//     );

//     let bob_unread = client.get_messages(&bob, &false, &true, &true);
//     assert_eq!(bob_unread.len(), 1);
//     assert_eq!(
//         bob_unread.get(0).unwrap().payload,
//         String::from_str(&env, "second")
//     );

//     let alice_sent = client.get_messages(&alice, &true, &false, &false);
//     assert_eq!(alice_sent.len(), 2);
//     assert_eq!(alice_sent.get(0).unwrap().recipient, bob.clone());
//     assert_eq!(alice_sent.get(1).unwrap().recipient, bob);
// }

// #[test]
// fn test_get_unread_count_tracks_multiple_messages() {
//     let env = Env::default();
//     env.ledger().with_mut(|li| li.timestamp = 1000);

//     let (client, _admin, _approver, _executor) = setup_contract(&env);
//     let alice = Address::generate(&env);
//     let bob = Address::generate(&env);
//     let carol = Address::generate(&env);

//     let first = client.send_message(&alice, &bob, &String::from_str(&env, "one"));
//     client.send_message(&carol, &bob, &String::from_str(&env, "two"));
//     client.send_message(&alice, &carol, &String::from_str(&env, "three"));

//     assert_eq!(client.get_unread_count(&bob), 2);
//     assert_eq!(client.get_unread_count(&carol), 1);

//     client.mark_as_read(&bob, &first);
//     assert_eq!(client.get_unread_count(&bob), 1);
//     assert_eq!(client.get_unread_count(&carol), 1);
// }

#[test]
fn test_upgrade_proposal_creation() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1000);
    env.mock_all_auths();

    let (client, admin, approver, _executor) = setup_contract(&env);

    let mut approvers = Vec::new(&env);
    approvers.push_back(approver.clone());

    let proposal_id = client.propose_upgrade(
        &admin,
        &symbol_short!("v2hash"),
        &symbol_short!("Upgrade"),
        &approvers,
        &1u32,
        &3600u64,
    );

    assert_eq!(proposal_id, 1);

    let proposal = client.get_upgrade_proposal(&proposal_id);
    assert_eq!(proposal.status, ProposalStatus::Pending);
    assert_eq!(proposal.approvals_count, 0);
}

#[test]
fn test_upgrade_proposal_approval_and_execution_flow() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1000);
    env.mock_all_auths();

    let contract_id = env.register_contract(None, UpgradeableMessagingContract);
    let client = UpgradeableMessagingContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let approver1 = Address::generate(&env);
    let approver2 = Address::generate(&env);
    let executor = Address::generate(&env);

    let mut approvers = Vec::new(&env);
    approvers.push_back(approver1.clone());
    approvers.push_back(approver2.clone());

    let cb_config = CircuitBreakerConfig {
        max_volume_per_period: 100,
        max_tx_count_per_period: 100,
        period_duration: 3600,
    };

    client.init(&admin, &approvers, &executor, &cb_config);

    let proposal_id = client.propose_upgrade(
        &admin,
        &symbol_short!("v2hash"),
        &symbol_short!("Upgrade"),
        &approvers,
        &2u32,
        &3600u64,
    );

    client.approve_upgrade(&proposal_id, &approver1);
    let proposal = client.get_upgrade_proposal(&proposal_id);
    assert_eq!(proposal.status, ProposalStatus::Pending);
    assert_eq!(proposal.approvals_count, 1);

    client.approve_upgrade(&proposal_id, &approver2);
    let proposal = client.get_upgrade_proposal(&proposal_id);
    assert_eq!(proposal.status, ProposalStatus::Approved);
    assert_eq!(proposal.approvals_count, 2);

    let early_execute = client.try_execute_upgrade(&proposal_id, &executor);
    assert!(early_execute.is_err());

    env.ledger().with_mut(|li| li.timestamp = 1000 + 3601);
    client.execute_upgrade(&proposal_id, &executor);

    let proposal = client.get_upgrade_proposal(&proposal_id);
    assert_eq!(proposal.status, ProposalStatus::Executed);
    assert!(proposal.executed);
}

#[test]
fn test_upgrade_rejection_and_cancellation_flow() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1000);
    env.mock_all_auths();

    let (client, admin, approver, _executor) = setup_contract(&env);
    let mut approvers = Vec::new(&env);
    approvers.push_back(approver.clone());

    let reject_id = client.propose_upgrade(
        &admin,
        &symbol_short!("v2hash"),
        &symbol_short!("Rejectd"),
        &approvers,
        &1u32,
        &3600u64,
    );
    client.reject_upgrade(&reject_id, &approver);
    assert_eq!(
        client.get_upgrade_proposal(&reject_id).status,
        ProposalStatus::Rejected
    );

    let cancel_id = client.propose_upgrade(
        &admin,
        &symbol_short!("v3hash"),
        &symbol_short!("Cancel"),
        &approvers,
        &1u32,
        &3600u64,
    );
    client.cancel_upgrade(&cancel_id, &admin);
    assert_eq!(
        client.get_upgrade_proposal(&cancel_id).status,
        ProposalStatus::Cancelled
    );
}

#[test]
fn test_duplicate_upgrade_approval_prevention() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1000);
    env.mock_all_auths();

    let (client, admin, approver, _executor) = setup_contract(&env);
    let mut approvers = Vec::new(&env);
    approvers.push_back(approver.clone());

    let proposal_id = client.propose_upgrade(
        &admin,
        &symbol_short!("v2hash"),
        &symbol_short!("Upgrade"),
        &approvers,
        &1u32,
        &3600u64,
    );

    client.approve_upgrade(&proposal_id, &approver);
    let duplicate = client.try_approve_upgrade(&proposal_id, &approver);
    assert!(duplicate.is_err());
}

// #[test]
// fn test_replay_message_rejected() {
//     let env = Env::default();
//     env.ledger().with_mut(|li| li.timestamp = 1000);

//     let (client, _admin, _approver, _executor) = setup_contract(&env);
//     let alice = Address::generate(&env);
//     let bob = Address::generate(&env);

//     let payload = String::from_str(&env, "replay test");
//     let id1 = client.send_message(&alice, &bob, &payload);
//     assert_eq!(id1, 1);

//     let attempt = client.try_send_message(&alice, &bob, &payload);
//     assert!(attempt.is_err(), "Replay should be rejected");
// }
