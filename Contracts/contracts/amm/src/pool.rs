#![allow(dead_code)]

/// Pool state, tick math, and swap math for the Stellara Advanced AMM.
///
/// Concentrated liquidity model:
///   - Liquidity is only active when current_tick ∈ [tick_lower, tick_upper).
///   - Prices are represented as sqrt_price in Q64.64 fixed-point (scaled by 2^64).
///   - Ticks map to sqrt prices via TICK_SQRT_RATIOS table (covers ±8192 ticks).

use soroban_sdk::{symbol_short, Address, Env};

use crate::{AmmError, PoolKey, PoolState};

// ─── Constants ────────────────────────────────────────────────────────────────

/// Scaling factor for Q64.64 fixed-point arithmetic: 2^64
pub const Q64: i128 = 1i128 << 64;

/// Minimum supported tick index.
pub const MIN_TICK: i32 = -8192;

/// Maximum supported tick index.
pub const MAX_TICK: i32 = 8192;

/// Each tick represents a price ratio of 1.0001^tick.
/// sqrt_ratio = sqrt(1.0001^tick) = 1.00005^tick
/// We store the ratio scaled by Q64.
///
/// Precomputed: TICK_SQRT_RATIOS[i] ≈ floor(sqrt(1.0001^i) * 2^64)
/// We use a 32-entry stepped table and interpolate between steps of 512.
/// Full range covered: -8192 to +8192 in steps of 512.
///
/// Values below were computed offline:
///   sqrt(1.0001^(k*512)) * 2^64  for k = 0..=32
const TICK_SQRT_TABLE: [(i32, i128); 33] = [
    (-8192, 12_247_334_978_884_438_016),
    (-7680, 12_564_898_345_393_909_760),
    (-7168, 12_890_695_869_940_434_944),
    (-6656, 13_224_941_057_498_855_424),
    (-6144, 13_567_852_949_053_179_904),
    (-5632, 13_919_656_265_140_750_336),
    (-5120, 14_280_581_553_118_414_848),
    (-4608, 14_650_865_338_247_188_480),
    (-4096, 15_030_750_278_694_412_288),
    (-3584, 15_420_485_324_554_993_664),
    (-3072, 15_820_325_880_995_923_968),
    (-2560, 16_230_533_975_631_024_128),
    (-2048, 16_651_378_430_235_568_128),
    (-1536, 17_083_135_036_913_317_888),
    (-1024, 17_526_086_738_831_433_728),
    (-512, 17_980_523_815_641_698_304),
    (0, 18_446_744_073_709_551_616),
    (512, 18_925_053_041_275_609_088),
    (1024, 19_415_764_168_677_568_512),
    (1536, 19_919_199_033_763_692_544),
    (2048, 20_435_687_552_632_508_416),
    (2560, 20_965_568_195_836_801_024),
    (3072, 21_509_188_210_193_616_896),
    (3584, 22_066_903_846_345_601_024),
    (4096, 22_639_080_592_222_822_400),
    (4608, 23_226_093_412_558_073_856),
    (5120, 23_828_326_994_612_617_216),
    (5632, 24_446_176_000_273_354_752),
    (6144, 25_080_045_324_686_745_600),
    (6656, 25_730_350_361_598_795_776),
    (7168, 26_397_517_275_575_197_696),
    (7680, 27_081_983_281_279_832_064),
    (8192, 27_784_196_929_994_764_288),
];

// ─── Tick / sqrt-price math ────────────────────────────────────────────────────

/// Return the Q64.64 sqrt_price for a given tick by linear interpolation
/// between the two nearest table entries.
pub fn tick_to_sqrt_price(tick: i32) -> Result<i128, AmmError> {
    if tick < MIN_TICK || tick > MAX_TICK {
        return Err(AmmError::InvalidTickRange);
    }

    // Find surrounding table entries
    let step = 512i32;
    let lower_idx = ((tick - MIN_TICK) / step) as usize;
    let lower_idx = lower_idx.min(TICK_SQRT_TABLE.len() - 2);
    let (t0, s0) = TICK_SQRT_TABLE[lower_idx];
    let (t1, s1) = TICK_SQRT_TABLE[lower_idx + 1];

    // Linear interpolation between s0 and s1
    let num = (tick - t0) as i128;
    let den = (t1 - t0) as i128;
    let interpolated = s0 + (s1 - s0) * num / den;
    Ok(interpolated)
}

/// Recover the approximate tick from a Q64 sqrt_price via binary search in the table.
pub fn sqrt_price_to_tick(sqrt_price: i128) -> i32 {
    for i in 0..TICK_SQRT_TABLE.len() - 1 {
        let (t0, s0) = TICK_SQRT_TABLE[i];
        let (_t1, s1) = TICK_SQRT_TABLE[i + 1];
        if sqrt_price >= s0 && sqrt_price < s1 {
            // Linear interpolation back to tick
            let frac = (sqrt_price - s0) as i128 * 512 / (s1 - s0).max(1);
            return t0 + frac as i32;
        }
    }
    if sqrt_price <= TICK_SQRT_TABLE[0].1 {
        MIN_TICK
    } else {
        MAX_TICK
    }
}

// ─── Liquidity math ────────────────────────────────────────────────────────────

/// Compute the amounts of token_a and token_b needed to mint `liquidity` units
/// in range [tick_lower, tick_upper], given current sqrt_price.
///
/// Δx = L * (1/√P_lower - 1/√P_upper)   — this is token_a (X)
/// Δy = L * (√P_upper - √P_lower)        — this is token_b (Y)
///
/// All sqrt prices in Q64.64.
pub fn amounts_for_liquidity(
    liquidity: i128,
    sqrt_price_lower: i128,
    sqrt_price_upper: i128,
    current_sqrt_price: i128,
) -> (i128, i128) {
    // Clamp current price to the position range
    let sq_cur = current_sqrt_price.max(sqrt_price_lower).min(sqrt_price_upper);

    // amount_a: from sq_cur to sqrt_price_upper
    // Δx = L * (√P_upper - √P_cur) * Q64 / (√P_upper * √P_cur)
    let amount_a = if sqrt_price_upper > sq_cur {
        let diff = sqrt_price_upper - sq_cur;
        let step1 = liquidity.saturating_mul(diff) / sqrt_price_upper.max(1);
        step1.saturating_mul(Q64) / sq_cur.max(1)
    } else {
        0
    };

    // amount_b: from sqrt_price_lower to sq_cur
    // Δy = L * (√P_cur - √P_lower) / Q64
    let amount_b = if sq_cur > sqrt_price_lower {
        liquidity * (sq_cur - sqrt_price_lower) / Q64
    } else {
        0
    };

    (amount_a, amount_b)
}

/// Compute liquidity from token amounts and price range.
/// Returns the minimum liquidity that can be provided.
pub fn liquidity_from_amounts(
    amount_a: i128,
    amount_b: i128,
    sqrt_price_lower: i128,
    sqrt_price_upper: i128,
    current_sqrt_price: i128,
) -> i128 {
    let sq_cur = current_sqrt_price.max(sqrt_price_lower).min(sqrt_price_upper);

    let liq_a = if sqrt_price_upper > sq_cur {
        let diff = sqrt_price_upper - sq_cur;
        if diff == 0 {
            i128::MAX
        } else {
            // L = amount_a * S_upper * S_cur / (diff * Q64)
            let step1 = amount_a.saturating_mul(sqrt_price_upper) / Q64;
            step1.saturating_mul(sq_cur) / diff
        }
    } else {
        i128::MAX
    };

    let liq_b = if sq_cur > sqrt_price_lower {
        amount_b * Q64 / (sq_cur - sqrt_price_lower).max(1)
    } else {
        i128::MAX
    };

    liq_a.min(liq_b).max(0)
}

// ─── Swap math ─────────────────────────────────────────────────────────────────

/// Result of a single swap step (within one tick crossing).
pub struct SwapStep {
    pub amount_in: i128,
    pub amount_out: i128,
    pub fee_paid: i128,
    pub new_sqrt_price: i128,
}

/// Execute one swap step for an exact-input trade within [sqrt_price_lower, sqrt_price_upper].
///
/// `amount_in_remaining` — tokens yet to be swapped.
/// `fee_bps`            — fee in basis points (e.g. 30 = 0.30%).
/// `zero_for_one`       — true = selling token_a (X) for token_b (Y).
pub fn compute_swap_step(
    current_sqrt_price: i128,
    target_sqrt_price: i128,
    liquidity: i128,
    amount_in_remaining: i128,
    fee_bps: u32,
) -> SwapStep {
    // Fee deducted from input first
    let fee_denom = 10_000i128;
    let fee_bps_i = fee_bps as i128;
    let fee_paid = amount_in_remaining * fee_bps_i / fee_denom;
    let amount_after_fee = (amount_in_remaining - fee_paid).max(0);

    let (mut new_sqrt_price, amount_in, amount_out);

    if current_sqrt_price > target_sqrt_price {
        // Selling token_a (zero_for_one): price decreases
        // amount_in = L * (P_cur - P_target) * Q64 / (P_cur * P_target)
        let price_delta = current_sqrt_price - target_sqrt_price;
        let max_in = if current_sqrt_price == 0 || target_sqrt_price == 0 {
            0
        } else {
            let step1 = liquidity.saturating_mul(price_delta) / current_sqrt_price;
            step1.saturating_mul(Q64) / target_sqrt_price
        };

        if amount_after_fee >= max_in {
            // Full step — price moves to target
            new_sqrt_price = target_sqrt_price;
            amount_in = max_in;
        } else {
            // Partial step — compute how far price moves
            // P_new = (P_cur * Q64) / ((amount_in * P_cur)/L + Q64)
            let term = amount_after_fee.saturating_mul(current_sqrt_price) / liquidity.max(1);
            let den = term.saturating_add(Q64);
            new_sqrt_price = current_sqrt_price.saturating_mul(Q64) / den.max(1);
            new_sqrt_price = new_sqrt_price.max(target_sqrt_price);
            amount_in = amount_after_fee;
        }

        // amount_out = L * (P_cur - P_new) / Q64  (token_b received)
        let p_diff_out = current_sqrt_price - new_sqrt_price;
        amount_out = liquidity.saturating_mul(p_diff_out) / Q64;
    } else {
        // Buying token_a (one_for_zero): price increases
        // amount_in = L * (P_target - P_cur) / Q64  (token_b in)
        let price_delta = target_sqrt_price - current_sqrt_price;
        let max_in = liquidity.saturating_mul(price_delta) / Q64;

        if amount_after_fee >= max_in {
            new_sqrt_price = target_sqrt_price;
            amount_in = max_in;
        } else {
            let moved = amount_after_fee.saturating_mul(Q64) / liquidity.max(1);
            new_sqrt_price = current_sqrt_price.saturating_add(moved).min(target_sqrt_price);
            amount_in = amount_after_fee;
        }

        // amount_out = L * (P_new - P_cur) * Q64 / (P_cur * P_new)  (token_a received)
        let p_diff_out = new_sqrt_price - current_sqrt_price;
        amount_out = if current_sqrt_price == 0 || new_sqrt_price == 0 {
            0
        } else {
            let step1 = liquidity.saturating_mul(p_diff_out) / current_sqrt_price;
            step1.saturating_mul(Q64) / new_sqrt_price
        };
    }

    SwapStep {
        amount_in,
        amount_out,
        fee_paid,
        new_sqrt_price,
    }
}

// ─── Pool storage helpers ──────────────────────────────────────────────────────

pub fn pool_storage_key(pool_key: &PoolKey) -> (soroban_sdk::Symbol, Address, Address) {
    (symbol_short!("pool"), pool_key.token_a.clone(), pool_key.token_b.clone())
}

pub fn read_pool(env: &Env, pool_key: &PoolKey) -> Option<PoolState> {
    let key = pool_storage_key(pool_key);
    env.storage().persistent().get(&key)
}

pub fn write_pool(env: &Env, pool_key: &PoolKey, state: &PoolState) {
    let key = pool_storage_key(pool_key);
    env.storage().persistent().set(&key, state);
}

pub fn require_pool(env: &Env, pool_key: &PoolKey) -> Result<PoolState, AmmError> {
    read_pool(env, pool_key).ok_or(AmmError::PoolNotFound)
}

// ─── Tick-level fee growth (per-tick outside accumulator) ─────────────────────

/// Key for storing the fee_growth_outside values at a specific tick boundary.
pub fn tick_fee_key(pool_key: &PoolKey, tick: i32, is_a: bool) -> (soroban_sdk::Symbol, Address, Address, i32, bool) {
    (
        symbol_short!("tfee"),
        pool_key.token_a.clone(),
        pool_key.token_b.clone(),
        tick,
        is_a,
    )
}

pub fn read_tick_fee_outside(env: &Env, pool_key: &PoolKey, tick: i32, is_a: bool) -> i128 {
    let key = tick_fee_key(pool_key, tick, is_a);
    env.storage().persistent().get(&key).unwrap_or(0)
}

pub fn write_tick_fee_outside(env: &Env, pool_key: &PoolKey, tick: i32, is_a: bool, value: i128) {
    let key = tick_fee_key(pool_key, tick, is_a);
    env.storage().persistent().set(&key, &value);
}

/// Compute fee_growth_inside for token_a and token_b within [tick_lower, tick_upper].
/// Uses the standard "fee growth outside" algorithm.
pub fn fee_growth_inside(
    env: &Env,
    pool_key: &PoolKey,
    pool: &PoolState,
    tick_lower: i32,
    tick_upper: i32,
) -> (i128, i128) {
    let fog_lower_a = read_tick_fee_outside(env, pool_key, tick_lower, true);
    let fog_lower_b = read_tick_fee_outside(env, pool_key, tick_lower, false);
    let fog_upper_a = read_tick_fee_outside(env, pool_key, tick_upper, true);
    let fog_upper_b = read_tick_fee_outside(env, pool_key, tick_upper, false);

    let below_a = if pool.current_tick >= tick_lower { fog_lower_a } else { pool.fee_growth_global_a - fog_lower_a };
    let below_b = if pool.current_tick >= tick_lower { fog_lower_b } else { pool.fee_growth_global_b - fog_lower_b };
    let above_a = if pool.current_tick < tick_upper  { fog_upper_a } else { pool.fee_growth_global_a - fog_upper_a };
    let above_b = if pool.current_tick < tick_upper  { fog_upper_b } else { pool.fee_growth_global_b - fog_upper_b };

    (
        pool.fee_growth_global_a - below_a - above_a,
        pool.fee_growth_global_b - below_b - above_b,
    )
}

/// Cross a tick: flip its fee_growth_outside values.
pub fn cross_tick(env: &Env, pool_key: &PoolKey, pool: &PoolState, tick: i32) {
    let old_a = read_tick_fee_outside(env, pool_key, tick, true);
    let old_b = read_tick_fee_outside(env, pool_key, tick, false);
    write_tick_fee_outside(env, pool_key, tick, true,  pool.fee_growth_global_a - old_a);
    write_tick_fee_outside(env, pool_key, tick, false, pool.fee_growth_global_b - old_b);
}
