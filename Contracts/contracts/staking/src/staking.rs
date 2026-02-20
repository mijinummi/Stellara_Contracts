use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror, Address, Env, String, Symbol, Vec,
    token, Map
};

/// Staking position with variable rewards
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StakingPosition {
    pub user: Address,
    pub amount: i128,
    pub start_time: u64,
    pub last_reward_time: u64,
    pub reward_multiplier: u32, // Multiplier for variable rewards
    pub lock_period: u64, // Lock period in seconds
    pub has_vesting: bool,
    pub vesting_total_periods: u32,
    pub vesting_current_period: u32,
    pub vesting_period_duration: u64,
    pub vesting_cliff_percentage: u32,
}

/// Vesting schedule for staking rewards
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VestingSchedule {
    pub total_periods: u32,
    pub current_period: u32,
    pub period_duration: u64, // Duration of each vesting period in seconds
    pub cliff_percentage: u32, // Percentage available after cliff (basis points)
}

/// Staking pool configuration
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StakingPool {
    pub token: Address,
    pub total_staked: i128,
    pub reward_rate: i128, // Base reward rate per second
    pub bonus_multiplier: u32, // Bonus multiplier for long-term stakers
    pub min_stake: i128,
    pub max_stake: i128,
    pub emergency_withdrawal_fee: u32, // Fee for early withdrawal (basis points)
}

/// Reward calculation result
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RewardCalculation {
    pub base_rewards: i128,
    pub bonus_rewards: i128,
    pub total_rewards: i128,
    pub vesting_amount: i128,
    pub claimable_amount: i128,
}

/// Staking error types
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum StakingError {
    NotInitialized = 1,
    Unauthorized = 2,
    InsufficientBalance = 3,
    InvalidAmount = 4,
    InvalidLockPeriod = 5,
    PositionNotFound = 6,
    AlreadyStaked = 7,
    NotStaked = 8,
    LockPeriodNotExpired = 9,
    EmergencyMode = 10,
    InvalidPoolConfig = 11,
    RewardCalculationFailed = 12,
}

// Events are published directly using env.events().publish()

#[contract]
pub struct StakingContract;

#[contractimpl]
impl StakingContract {
    /// Initialize the staking contract
    pub fn initialize(
        env: Env,
        admin: Address,
        token: Address,
        reward_rate: i128,
        bonus_multiplier: u32,
        min_stake: i128,
        max_stake: i128,
    ) -> Result<(), StakingError> {
        if storage::has_admin(&env) {
            return Err(StakingError::NotInitialized);
        }

        admin.require_auth();

        // Validate parameters
        if reward_rate < 0 {
            return Err(StakingError::InvalidPoolConfig);
        }
        if min_stake < 0 || max_stake <= min_stake {
            return Err(StakingError::InvalidPoolConfig);
        }

        // Set admin
        storage::set_admin(&env, &admin);

        // Initialize staking pool
        let pool = StakingPool {
            token: token.clone(),
            total_staked: 0,
            reward_rate,
            bonus_multiplier,
            min_stake,
            max_stake,
            emergency_withdrawal_fee: 500, // 5% fee
        };

        storage::set_staking_pool(&env, &pool);
        storage::set_emergency_mode(&env, false);

        env.events().publish(
            (Symbol::new(&env, "pool_initialized"), admin),
            (reward_rate, bonus_multiplier),
        );

        Ok(())
    }

    /// Stake tokens with variable rewards based on lock period
    pub fn stake(
        env: Env,
        user: Address,
        amount: i128,
        lock_period: u64,
        vesting_periods: Option<u32>,
    ) -> Result<(), StakingError> {
        user.require_auth();

        let pool = storage::get_staking_pool(&env);
        if storage::get_emergency_mode(&env) {
            return Err(StakingError::EmergencyMode);
        }

        // Validate parameters
        if amount < pool.min_stake || amount > pool.max_stake {
            return Err(StakingError::InvalidAmount);
        }

        // Check if lock period is valid and get reward multiplier
        let reward_multiplier = Self::get_reward_multiplier(lock_period);
        if reward_multiplier == 0 {
            return Err(StakingError::InvalidLockPeriod);
        }

        // Check if user already has a position
        if storage::has_staking_position(&env, &user) {
            return Err(StakingError::AlreadyStaked);
        }

        // Create vesting schedule values if specified
        let (has_vesting, vesting_total_periods, vesting_current_period, vesting_period_duration, vesting_cliff_percentage) = 
            if let Some(periods) = vesting_periods {
                (true, periods, 0, lock_period / (periods as u64), 2500)
            } else {
                (false, 0, 0, 0, 0)
            };

        // Transfer tokens to contract
        let token_client = token::Client::new(&env, &pool.token);
        let user_balance = token_client.balance(&user);
        if user_balance < amount {
            return Err(StakingError::InsufficientBalance);
        }

        token_client.transfer(&user, &env.current_contract_address(), &amount);

        // Create staking position
        let position = StakingPosition {
            user: user.clone(),
            amount,
            start_time: env.ledger().timestamp(),
            last_reward_time: env.ledger().timestamp(),
            reward_multiplier,
            lock_period,
            has_vesting,
            vesting_total_periods,
            vesting_current_period,
            vesting_period_duration,
            vesting_cliff_percentage,
        };

        // Update pool state
        let mut updated_pool = pool;
        updated_pool.total_staked = updated_pool.total_staked.checked_add(amount)
            .expect("Overflow in total staked");
        storage::set_staking_pool(&env, &updated_pool);

        // Store position
        storage::set_staking_position(&env, &user, &position);

        // Emit event
        env.events().publish(
            (Symbol::new(&env, "staked"), user),
            (amount, lock_period, reward_multiplier, env.ledger().timestamp()),
        );

        Ok(())
    }

    /// Unstake tokens and claim rewards
    pub fn unstake(env: Env, user: Address) -> Result<i128, StakingError> {
        user.require_auth();

        let pool = storage::get_staking_pool(&env);
        let position = storage::get_staking_position(&env, &user)
            .ok_or(StakingError::NotStaked)?;

        let current_time = env.ledger().timestamp();
        let time_staked = current_time.saturating_sub(position.start_time);

        // Check if lock period has expired
        if time_staked < position.lock_period && !storage::get_emergency_mode(&env) {
            return Err(StakingError::LockPeriodNotExpired);
        }

        // Calculate rewards
        let rewards = Self::calculate_rewards(&env, &position, &pool, current_time)?;

        // Calculate withdrawal fee if early withdrawal
        let fee = if time_staked < position.lock_period && !storage::get_emergency_mode(&env) {
            position.amount.checked_mul(pool.emergency_withdrawal_fee as i128)
                .expect("Fee calculation overflow") / 10000
        } else {
            0
        };

        // Transfer tokens back to user
        let token_client = token::Client::new(&env, &pool.token);
        let total_amount = position.amount.checked_add(rewards.claimable_amount)
            .expect("Total amount overflow")
            .checked_sub(fee)
            .expect("Total amount after fee overflow");

        token_client.transfer(
            &env.current_contract_address(),
            &user,
            &total_amount,
        );

        // Update pool state
        let mut updated_pool = pool;
        updated_pool.total_staked = updated_pool.total_staked.checked_sub(position.amount)
            .expect("Underflow in total staked");
        storage::set_staking_pool(&env, &updated_pool);

        // Remove position
        storage::remove_staking_position(&env, &user);

        // Emit event
        env.events().publish(
            (Symbol::new(&env, "unstaked"), user),
            (position.amount, rewards.claimable_amount, fee, current_time),
        );

        Ok(rewards.claimable_amount)
    }

    /// Claim rewards without unstaking
    pub fn claim_rewards(env: Env, user: Address) -> Result<i128, StakingError> {
        user.require_auth();

        let pool = storage::get_staking_pool(&env);
        let mut position = storage::get_staking_position(&env, &user)
            .ok_or(StakingError::NotStaked)?;

        let current_time = env.ledger().timestamp();
        let rewards = Self::calculate_rewards(&env, &position, &pool, current_time)?;

        if rewards.claimable_amount == 0 {
            return Ok(0);
        }

        // Transfer rewards to user
        let token_client = token::Client::new(&env, &pool.token);
        token_client.transfer(
            &env.current_contract_address(),
            &user,
            &rewards.claimable_amount,
        );

        // Update position
        position.last_reward_time = current_time;
        
        // Update vesting if applicable
        if position.has_vesting && position.vesting_current_period < position.vesting_total_periods {
            position.vesting_current_period += 1;
        }

        storage::set_staking_position(&env, &user, &position);

        // Emit event
        env.events().publish(
            (Symbol::new(&env, "rewards_claimed"), user),
            (rewards.base_rewards, rewards.bonus_rewards, current_time),
        );

        Ok(rewards.claimable_amount)
    }

    /// Get user's staking position
    pub fn get_position(env: Env, user: Address) -> Result<StakingPosition, StakingError> {
        storage::get_staking_position(&env, &user)
            .ok_or(StakingError::PositionNotFound)
    }

    /// Get staking pool information
    pub fn get_pool_info(env: Env) -> StakingPool {
        storage::get_staking_pool(&env)
    }

    /// Calculate pending rewards for a user
    pub fn get_pending_rewards(env: Env, user: Address) -> Result<RewardCalculation, StakingError> {
        let pool = storage::get_staking_pool(&env);
        let position = storage::get_staking_position(&env, &user)
            .ok_or(StakingError::NotStaked)?;

        let current_time = env.ledger().timestamp();
        Self::calculate_rewards(&env, &position, &pool, current_time)
    }

    /// Admin: Update pool configuration
    pub fn update_pool(
        env: Env,
        admin: Address,
        reward_rate: Option<i128>,
        bonus_multiplier: Option<u32>,
    ) -> Result<(), StakingError> {
        admin.require_auth();
        
        // Verify admin
        let stored_admin = storage::get_admin(&env);
        if admin != stored_admin {
            return Err(StakingError::Unauthorized);
        }

        let mut pool = storage::get_staking_pool(&env);

        if let Some(new_rate) = reward_rate {
            if new_rate < 0 {
                return Err(StakingError::InvalidPoolConfig);
            }
            pool.reward_rate = new_rate;
        }

        if let Some(new_multiplier) = bonus_multiplier {
            pool.bonus_multiplier = new_multiplier;
        }

        storage::set_staking_pool(&env, &pool);

        env.events().publish(
            (Symbol::new(&env, "pool_updated"), admin),
            (pool.reward_rate, pool.bonus_multiplier, env.ledger().timestamp()),
        );

        Ok(())
    }

    /// Admin: Enable/disable emergency mode
    pub fn set_emergency_mode(env: Env, admin: Address, enabled: bool) -> Result<(), StakingError> {
        admin.require_auth();
        
        // Verify admin
        let stored_admin = storage::get_admin(&env);
        if admin != stored_admin {
            return Err(StakingError::Unauthorized);
        }

        storage::set_emergency_mode(&env, enabled);

        Ok(())
    }

    /// Get reward multiplier for a lock period
    fn get_reward_multiplier(lock_period: u64) -> u32 {
        const LOCK_30_DAYS: u64 = 30 * 24 * 60 * 60;
        const LOCK_90_DAYS: u64 = 90 * 24 * 60 * 60;
        const LOCK_180_DAYS: u64 = 180 * 24 * 60 * 60;
        const LOCK_365_DAYS: u64 = 365 * 24 * 60 * 60;
        
        match lock_period {
            LOCK_30_DAYS => 100,   // 1x for 30 days
            LOCK_90_DAYS => 150,  // 1.5x for 90 days
            LOCK_180_DAYS => 200, // 2x for 180 days
            LOCK_365_DAYS => 300, // 3x for 365 days
            _ => 0, // Invalid lock period
        }
    }

    /// Calculate rewards for a staking position
    fn calculate_rewards(
        env: &Env,
        position: &StakingPosition,
        pool: &StakingPool,
        current_time: u64,
    ) -> Result<RewardCalculation, StakingError> {
        let time_since_last_reward = current_time.saturating_sub(position.last_reward_time);
        let total_time_staked = current_time.saturating_sub(position.start_time);

        // Calculate base rewards
        let base_rewards = pool.reward_rate
            .checked_mul(position.amount as i128)
            .expect("Base reward calculation overflow")
            .checked_mul(time_since_last_reward as i128)
            .expect("Base reward time overflow") / 1_000_000_000; // Convert from per-second rate

        // Calculate bonus rewards based on lock period and multiplier
        let bonus_multiplier = position.reward_multiplier as i128;
        let bonus_rewards = base_rewards
            .checked_mul(bonus_multiplier - 100) // Bonus over base 100%
            .expect("Bonus reward calculation overflow") / 100;

        let total_rewards = base_rewards.checked_add(bonus_rewards)
            .expect("Total reward calculation overflow");

        // Calculate vesting amount if applicable
        let vesting_amount = if position.has_vesting {
            let periods_completed = total_time_staked / position.vesting_period_duration;
            let max_periods = position.vesting_total_periods as u64;
            
            if periods_completed >= max_periods {
                total_rewards
            } else {
                let cliff_amount = if periods_completed == 0 {
                    0
                } else {
                    total_rewards.checked_mul(position.vesting_cliff_percentage as i128)
                        .expect("Vesting cliff calculation overflow") / 10000
                };

                let vested_periods = u64::min(periods_completed, max_periods);
                let vested_amount = total_rewards
                    .checked_mul(vested_periods as i128)
                    .expect("Vested amount calculation overflow") / max_periods as i128;

                core::cmp::max(cliff_amount, vested_amount)
            }
        } else {
            total_rewards
        };

        let claimable_amount = vesting_amount;

        Ok(RewardCalculation {
            base_rewards,
            bonus_rewards,
            total_rewards,
            vesting_amount,
            claimable_amount,
        })
    }
}

// Storage module for staking contract
pub mod storage {
    use super::*;
    use soroban_sdk::{Env, Address, Map, Vec};

    const ADMIN_KEY: &str = "admin";
    const POOL_KEY: &str = "pool";
    const EMERGENCY_KEY: &str = "emergency";
    const POSITION_PREFIX: &str = "position";

    pub fn has_admin(env: &Env) -> bool {
        env.storage()
            .persistent()
            .has(&Symbol::new(env, ADMIN_KEY))
    }

    pub fn set_admin(env: &Env, admin: &Address) {
        env.storage()
            .persistent()
            .set(&Symbol::new(env, ADMIN_KEY), admin);
    }

    pub fn get_admin(env: &Env) -> Address {
        env.storage()
            .persistent()
            .get(&Symbol::new(env, ADMIN_KEY))
            .unwrap()
    }

    pub fn set_staking_pool(env: &Env, pool: &StakingPool) {
        env.storage()
            .persistent()
            .set(&Symbol::new(env, POOL_KEY), pool);
    }

    pub fn get_staking_pool(env: &Env) -> StakingPool {
        env.storage()
            .persistent()
            .get(&Symbol::new(env, POOL_KEY))
            .unwrap()
    }

    pub fn set_emergency_mode(env: &Env, enabled: bool) {
        env.storage()
            .persistent()
            .set(&Symbol::new(env, EMERGENCY_KEY), &enabled);
    }

    pub fn get_emergency_mode(env: &Env) -> bool {
        env.storage()
            .persistent()
            .get(&Symbol::new(env, EMERGENCY_KEY))
            .unwrap_or(false)
    }

    pub fn set_staking_position(env: &Env, user: &Address, position: &StakingPosition) {
        env.storage()
            .persistent()
            .set(&(Symbol::new(env, POSITION_PREFIX), user), position);
    }

    pub fn get_staking_position(env: &Env, user: &Address) -> Option<StakingPosition> {
        env.storage()
            .persistent()
            .get(&(Symbol::new(env, POSITION_PREFIX), user))
    }

    pub fn has_staking_position(env: &Env, user: &Address) -> bool {
        env.storage()
            .persistent()
            .has(&(Symbol::new(env, POSITION_PREFIX), user))
    }

    pub fn remove_staking_position(env: &Env, user: &Address) {
        env.storage()
            .persistent()
            .remove(&(Symbol::new(env, POSITION_PREFIX), user));
    }
}
