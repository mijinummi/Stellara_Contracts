use soroban_sdk::{contracttype, symbol_short, Env};

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ReentrancyStatus {
    Inactive = 0,
    Active = 1,
}

pub struct ReentrancyGuard;

impl ReentrancyGuard {
    pub const STATUS_KEY: soroban_sdk::Symbol = symbol_short!("_status");

    pub fn enter(env: &Env) {
        let status: ReentrancyStatus = env
            .storage()
            .persistent()
            .get(&Self::STATUS_KEY)
            .unwrap_or(ReentrancyStatus::Inactive);

        if status == ReentrancyStatus::Active {
            panic!("REENTRANCY_DETECTED");
        }

        env.storage()
            .persistent()
            .set(&Self::STATUS_KEY, &ReentrancyStatus::Active);
    }

    pub fn exit(env: &Env) {
        env.storage()
            .persistent()
            .set(&Self::STATUS_KEY, &ReentrancyStatus::Inactive);
    }
}
