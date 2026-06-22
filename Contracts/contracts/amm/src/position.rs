#![allow(dead_code)]

/// LP position CRUD for the Stellara Advanced AMM.
///
/// Each position is uniquely identified by a monotonically-increasing u64 id.
/// Positions track:
///   - The pool they belong to (token_a, token_b pair)
///   - The tick range [tick_lower, tick_upper)
///   - The amount of liquidity the owner has deposited
///   - Fee growth checkpoints for accurate per-position fee attribution
///   - Accrued (uncollected) token fees

use soroban_sdk::{symbol_short, Address, Env, Vec};

use crate::{AmmError, LpPosition, PoolKey};

// ─── Storage helpers ───────────────────────────────────────────────────────────

fn pos_key(position_id: u64) -> (soroban_sdk::Symbol, u64) {
    (symbol_short!("pos"), position_id)
}

fn pos_count_key() -> soroban_sdk::Symbol {
    symbol_short!("pos_cnt")
}

/// Key that maps an owner to their list of position IDs.
fn owner_positions_key(owner: &Address) -> (soroban_sdk::Symbol, Address) {
    (symbol_short!("own_pos"), owner.clone())
}

// ─── Position CRUD ─────────────────────────────────────────────────────────────

/// Allocate the next position ID (monotonically increasing).
pub fn next_position_id(env: &Env) -> u64 {
    let key = pos_count_key();
    let id: u64 = env.storage().persistent().get(&key).unwrap_or(0) + 1;
    env.storage().persistent().set(&key, &id);
    id
}

/// Persist a position.
pub fn write_position(env: &Env, position: &LpPosition) {
    let key = pos_key(position.id);
    env.storage().persistent().set(&key, position);
}

/// Load a position by ID, returning `None` if not found.
pub fn read_position(env: &Env, position_id: u64) -> Option<LpPosition> {
    let key = pos_key(position_id);
    env.storage().persistent().get(&key)
}

/// Load a position or return `PositionNotFound`.
pub fn require_position(env: &Env, position_id: u64) -> Result<LpPosition, AmmError> {
    read_position(env, position_id).ok_or(AmmError::PositionNotFound)
}

/// Delete a position from storage (used on full burn).
pub fn delete_position(env: &Env, position_id: u64) {
    let key = pos_key(position_id);
    env.storage().persistent().remove(&key);
}

// ─── Owner index ───────────────────────────────────────────────────────────────

/// Add a position ID to the owner's index list.
pub fn index_owner_position(env: &Env, owner: &Address, position_id: u64) {
    let key = owner_positions_key(owner);
    let mut ids: Vec<u64> = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| Vec::new(env));
    ids.push_back(position_id);
    env.storage().persistent().set(&key, &ids);
}

/// Remove a position ID from the owner's index list.
pub fn deindex_owner_position(env: &Env, owner: &Address, position_id: u64) {
    let key = owner_positions_key(owner);
    let ids: Vec<u64> = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| Vec::new(env));
    let mut updated = Vec::new(env);
    for id in ids.iter() {
        if id != position_id {
            updated.push_back(id);
        }
    }
    env.storage().persistent().set(&key, &updated);
}

/// Return all positions belonging to `owner`.
pub fn get_owner_positions(env: &Env, owner: &Address) -> Vec<LpPosition> {
    let key = owner_positions_key(owner);
    let ids: Vec<u64> = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| Vec::new(env));

    let mut positions = Vec::new(env);
    for id in ids.iter() {
        if let Some(pos) = read_position(env, id) {
            positions.push_back(pos);
        }
    }
    positions
}

// ─── Mint helper ───────────────────────────────────────────────────────────────

/// Create and persist a brand new LP position; returns the position ID.
pub fn mint_position(
    env: &Env,
    owner: Address,
    pool_key: PoolKey,
    tick_lower: i32,
    tick_upper: i32,
    liquidity: i128,
    fee_growth_inside_a: i128,
    fee_growth_inside_b: i128,
) -> u64 {
    let position_id = next_position_id(env);

    let position = LpPosition {
        id: position_id,
        owner: owner.clone(),
        pool_key,
        tick_lower,
        tick_upper,
        liquidity,
        fee_growth_inside_a_last: fee_growth_inside_a,
        fee_growth_inside_b_last: fee_growth_inside_b,
        tokens_owed_a: 0,
        tokens_owed_b: 0,
        created_at: env.ledger().timestamp(),
    };

    write_position(env, &position);
    index_owner_position(env, &owner, position_id);

    position_id
}

// ─── Accrual helper ────────────────────────────────────────────────────────────

/// Update a position's accrued fee tokens based on how much fee_growth has
/// occurred inside its range since the last checkpoint.
///
/// Δfees_a = liquidity * (fee_growth_inside_a_now - fee_growth_inside_a_last)
pub fn accrue_position_fees(
    position: &mut LpPosition,
    fee_growth_inside_a_now: i128,
    fee_growth_inside_b_now: i128,
) {
    let fee_per_unit_a = fee_growth_inside_a_now - position.fee_growth_inside_a_last;
    let fee_per_unit_b = fee_growth_inside_b_now - position.fee_growth_inside_b_last;

    // fee_growth is stored scaled by Q64; divide to get token amounts.
    let scale = crate::pool::Q64;
    if fee_per_unit_a > 0 {
        position.tokens_owed_a += position.liquidity * fee_per_unit_a / scale;
    }
    if fee_per_unit_b > 0 {
        position.tokens_owed_b += position.liquidity * fee_per_unit_b / scale;
    }

    position.fee_growth_inside_a_last = fee_growth_inside_a_now;
    position.fee_growth_inside_b_last = fee_growth_inside_b_now;
}
