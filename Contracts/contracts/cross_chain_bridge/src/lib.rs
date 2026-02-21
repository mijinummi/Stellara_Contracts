#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol, BytesN};

mod test;

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    ValidatorPubkey,
    Nonce(Address),
}

#[contract]
pub struct CrossChainBridge;

#[contractimpl]
impl CrossChainBridge {
    /// Initialize the bridge with an admin and the public key of the trusted validator.
    pub fn initialize(env: Env, admin: Address, validator_pubkey: BytesN<32>) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::ValidatorPubkey, &validator_pubkey);
    }

    /// User locks tokens on Stellar to be minted on another chain.
    /// In a real scenario, this would transfer tokens to this contract.
    /// For this PoC, we just emit an event.
    pub fn lock_tokens(env: Env, user: Address, amount: i128, destination_chain: Symbol, destination_address: Symbol) {
        user.require_auth();

        // In a real implementation:
        // token_client.transfer(&user, &env.current_contract_address(), &amount);

        // Emit event for relayer to pick up
        env.events().publish(
            (symbol_short!("lock"), user, destination_chain),
            (amount, destination_address)
        );
    }

    /// Process a payload from the validator to mint/release tokens on Stellar.
    /// This PoC simplifies signature verification (mocked logic or simple check).
    pub fn process_payload(env: Env, user: Address, amount: i128, nonce: i128, _signature: BytesN<64>) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth(); // For PoC, only admin can call this, simulating a trusted relayer

        let key = DataKey::Nonce(user.clone());
        let current_nonce: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        
        if nonce != current_nonce + 1 {
            panic!("Invalid nonce");
        }

        env.storage().persistent().set(&key, &nonce);

        // In a real implementation:
        // token_client.mint(&user, &amount);

        // Emit event for successful bridge-in
        env.events().publish(
            (symbol_short!("mint"), user),
            amount
        );
    }

    pub fn get_nonce(env: Env, user: Address) -> i128 {
        env.storage().persistent().get(&DataKey::Nonce(user)).unwrap_or(0)
    }
}
