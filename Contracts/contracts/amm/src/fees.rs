#![allow(dead_code)]

/// Dynamic fee computation for the Stellara Advanced AMM.
///
/// # Design
///
/// Each pool has a `fee_tier` (base bps: 5, 30, or 100) set at creation.
/// The runtime `dynamic_fee_bps` is recomputed by `update_dynamic_fee()` using
/// a rolling 24-period price-variance oracle:
///
/// ```text
/// variance       = mean((price[i] - mean_price)^2)
/// volatility_bps = integer_sqrt(variance) * 10_000 / mean_price
/// premium        = min(volatility_bps / VOLATILITY_DIVISOR, MAX_FEE_PREMIUM_BPS)
/// dynamic_fee    = base_fee + premium
/// ```
///
/// The history ring-buffer stores one price sample per period.
/// A "period" is defined as `ORACLE_PERIOD_SECS` ledger seconds.

use soroban_sdk::{symbol_short, Address, Env};

use crate::PoolKey;

// ─── Constants ────────────────────────────────────────────────────────────────

/// Valid fee tiers in basis points.
pub const FEE_TIER_LOW: u32 = 5;
pub const FEE_TIER_MID: u32 = 30;
pub const FEE_TIER_HIGH: u32 = 100;

/// Maximum additional fee premium that volatility can add (50 bps = 0.50%).
pub const MAX_FEE_PREMIUM_BPS: u32 = 50;

/// Divisor applied to volatility_bps before adding to base fee.
/// Lower = more aggressive fee scaling.
pub const VOLATILITY_DIVISOR: u32 = 10;

/// Number of historical price periods kept in the rolling buffer.
pub const ORACLE_PERIODS: u32 = 24;

/// Duration of each oracle period in ledger seconds (~1 hour).
pub const ORACLE_PERIOD_SECS: u64 = 3_600;

// ─── Validation ───────────────────────────────────────────────────────────────

/// Returns `true` if `fee_tier` is one of the three supported values.
pub fn is_valid_fee_tier(fee_tier: u32) -> bool {
    matches!(fee_tier, FEE_TIER_LOW | FEE_TIER_MID | FEE_TIER_HIGH)
}

// ─── Oracle storage ───────────────────────────────────────────────────────────

/// Storage key for a single price sample at a given period index.
fn price_sample_key(
    pool_key: &PoolKey,
    period: u64,
) -> (soroban_sdk::Symbol, Address, Address, u64) {
    (
        symbol_short!("vol_hist"),
        pool_key.token_a.clone(),
        pool_key.token_b.clone(),
        period,
    )
}

/// Record the current pool price (sqrt_price) for the current oracle period.
pub fn record_price_sample(env: &Env, pool_key: &PoolKey, sqrt_price: i128) {
    let now = env.ledger().timestamp();
    let period = now / ORACLE_PERIOD_SECS;
    let key = price_sample_key(pool_key, period);
    env.storage().persistent().set(&key, &sqrt_price);
}

/// Read a stored price sample for `period`. Returns `None` if not recorded yet.
pub fn read_price_sample(env: &Env, pool_key: &PoolKey, period: u64) -> Option<i128> {
    let key = price_sample_key(pool_key, period);
    env.storage().persistent().get(&key)
}

// ─── Volatility computation ────────────────────────────────────────────────────

/// Integer square-root via Newton's method (no_std safe).
fn isqrt(n: i128) -> i128 {
    if n <= 0 {
        return 0;
    }
    let mut x = n;
    let mut y = (x + 1) / 2;
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x
}

/// Collect the last `ORACLE_PERIODS` price samples ending at the current period,
/// then compute:
///   1. Mean price (mean of sqrt_prices — reasonable proxy for log-normal price)
///   2. Variance
///   3. Volatility in bps = isqrt(variance) * 10_000 / mean
///   4. Premium = min(volatility / VOLATILITY_DIVISOR, MAX_FEE_PREMIUM_BPS)
///
/// Returns `(new_dynamic_fee_bps, sample_count)`.
pub fn compute_dynamic_fee(
    env: &Env,
    pool_key: &PoolKey,
    base_fee: u32,
) -> (u32, u32) {
    let now = env.ledger().timestamp();
    let current_period = now / ORACLE_PERIOD_SECS;

    // Collect samples from the last ORACLE_PERIODS periods
    let mut sum: i128 = 0;
    let mut count: u32 = 0;
    let mut samples: [i128; 24] = [0i128; 24];

    for i in 0..ORACLE_PERIODS {
        let period = current_period.saturating_sub(i as u64);
        if let Some(sample) = read_price_sample(env, pool_key, period) {
            samples[count as usize] = sample;
            sum += sample;
            count += 1;
        }
    }

    if count < 2 {
        // Not enough data — use base fee
        return (base_fee, count);
    }

    let mean = sum / count as i128;
    if mean == 0 {
        return (base_fee, count);
    }

    // Compute variance
    let mut variance_sum: i128 = 0;
    for i in 0..count as usize {
        let diff = samples[i] - mean;
        variance_sum += diff * diff;
    }
    let variance = variance_sum / count as i128;

    // Volatility in bps: sqrt(variance) * 10_000 / mean
    let vol_bps = isqrt(variance) * 10_000 / mean.max(1);

    // Premium: cap at MAX_FEE_PREMIUM_BPS
    let premium = (vol_bps as u32 / VOLATILITY_DIVISOR).min(MAX_FEE_PREMIUM_BPS);

    let dynamic_fee = base_fee + premium;
    (dynamic_fee, count)
}

// ─── Fee growth accounting ─────────────────────────────────────────────────────

/// Increment the global fee-growth accumulator for a pool after a swap.
///
/// `fee_amount` — raw fee tokens collected in this swap step
/// `liquidity`  — active liquidity at the time of the swap
/// `is_token_a` — which accumulator to update
///
/// fee_growth_global is scaled by Q64 so position-level math works correctly.
pub fn accumulate_fee_growth(
    fee_amount: i128,
    liquidity: i128,
    global_fee_growth: i128,
) -> i128 {
    if liquidity == 0 {
        return global_fee_growth;
    }
    // fee_growth_per_unit = fee_amount * Q64 / liquidity
    let increment = fee_amount * crate::pool::Q64 / liquidity;
    global_fee_growth + increment
}
