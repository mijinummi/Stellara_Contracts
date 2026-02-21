#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::{Address as _}, Address, Env, BytesN, symbol_short};

#[test]
fn test_initialize() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let validator_pubkey = BytesN::from_array(&env, &[0u8; 32]);

    let contract_id = env.register_contract(None, CrossChainBridge);
    let client = CrossChainBridgeClient::new(&env, &contract_id);

    client.initialize(&admin, &validator_pubkey);
}

#[test]
fn test_lock_tokens() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let validator_pubkey = BytesN::from_array(&env, &[0u8; 32]);

    let contract_id = env.register_contract(None, CrossChainBridge);
    let client = CrossChainBridgeClient::new(&env, &contract_id);

    client.initialize(&admin, &validator_pubkey);

    let user = Address::generate(&env);
    let amount = 1000i128;
    let dest_chain = symbol_short!("ETH");
    let dest_addr = symbol_short!("0x123");
    client.lock_tokens(&user, &amount, &dest_chain, &dest_addr);
}

#[test]
fn test_process_payload() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let validator_pubkey = BytesN::from_array(&env, &[0u8; 32]);

    let contract_id = env.register_contract(None, CrossChainBridge);
    let client = CrossChainBridgeClient::new(&env, &contract_id);

    client.initialize(&admin, &validator_pubkey);

    let user = Address::generate(&env);
    let amount = 1000i128;
    let nonce = 1i128;
    let signature = BytesN::from_array(&env, &[0u8; 64]);
    
    client.process_payload(&user, &amount, &nonce, &signature);
    assert_eq!(client.get_nonce(&user), 1);
}
