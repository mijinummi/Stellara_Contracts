#![allow(dead_code)]

/// Impermanent loss estimation and hedging for the Stellara Advanced AMM.
///
/// # IL Formula
///
/// For a position that was created when the pool price was `P_entry` and the
/// pool price is now `P_current`:
///
/// ```text
/// r   = P_current / P_entry          (scaled by 1_000_000 to stay integer)
/// IL  = 2 * sqrt(r) / (1 + r) - 1   (result in basis points * 10_000)
/// ```
///
/// # Hedging
///
/// When `|IL| > HEDGE_THRESHOLD_BPS` the contract locks an IL reserve:
///
/// ```text
/// reserve_a += position_value_a * HEDGE_RATIO_BPS / 10_000
/// reserve_b += position_value_b * HEDGE_RATIO_BPS / 10_000
/// ```
///
/// On `remove_liquidity` the reserve is partially released proportionally to
/// the fraction of liquidity being removed, compensating the LP.

use crate::{AmmError, LpPosition, PoolState};
use crate::pool::tick_to_sqrt_price;

// ─── Constants ────────────────────────────────────────────────────────────────

/// IL must exceed this many bps before the hedge reserve is funded (default 200 bps = 2%).
pub const HEDGE_THRESHOLD_BPS: i128 = 200;

/// Fraction of position value locked in the reserve when IL > threshold (500 bps = 5%).
pub const HEDGE_RATIO_BPS: i128 = 500;

/// Precision scalar for integer ratio arithmetic.
const SCALE: i128 = 1_000_000;

// ─── Integer sqrt ─────────────────────────────────────────────────────────────

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

// ─── IL estimation ────────────────────────────────────────────────────────────

/// Estimate the impermanent loss for `position` given the current pool state.
///
/// Returns IL in basis points (negative value = LP is worse off than HODL).
/// Returns `0` if price has not moved from entry.
///
/// `entry_sqrt_price` is computed from the midpoint tick of the position at
/// creation time (stored as `(tick_lower + tick_upper) / 2`).
pub fn estimate_il_bps(position: &LpPosition, pool: &PoolState) -> i128 {
    // Entry price approximated from midpoint of position's tick range
    let mid_tick = (position.tick_lower + position.tick_upper) / 2;
    let entry_sqrt_price = match tick_to_sqrt_price(mid_tick) {
        Ok(v) => v,
        Err(_) => return 0,
    };

    if entry_sqrt_price == 0 {
        return 0;
    }

    // sqrt_r = sqrt(P_current / P_entry) = sqrt_P_current / sqrt_P_entry
    // Scale by SCALE to preserve precision.
    let sqrt_r_scaled = pool.sqrt_price.saturating_mul(SCALE) / entry_sqrt_price;
    
    // r_scaled = (sqrt_r_scaled * sqrt_r_scaled) / SCALE
    let r_scaled = sqrt_r_scaled.saturating_mul(sqrt_r_scaled) / SCALE;

    // IL = 2 * sqrt(r) / (1 + r) - 1
    // In integer arithmetic (all * SCALE):
    //   numerator   = 2 * sqrt_r_scaled
    //   denominator = SCALE + r_scaled
    //   il_scaled   = numerator * SCALE / denominator - SCALE
    let numerator = 2 * sqrt_r_scaled;
    let denominator = SCALE + r_scaled;
    let il_scaled = numerator.saturating_mul(SCALE) / denominator.max(1) - SCALE;

    // Convert to bps: il_scaled / SCALE * 10_000
    il_scaled * 10_000 / SCALE
}

// ─── Hedge reserve calculation ────────────────────────────────────────────────

/// Compute the additional reserve tokens (token_a, token_b) that should be
/// locked when a position's IL exceeds `HEDGE_THRESHOLD_BPS`.
///
/// `amount_a` / `amount_b` are the tokens being deposited for this position.
///
/// Returns `(reserve_a, reserve_b)` to add to the pool's IL reserve fields,
/// or `(0, 0)` if hedging is not triggered.
pub fn compute_hedge_reserve(
    il_bps: i128,
    amount_a: i128,
    amount_b: i128,
) -> (i128, i128) {
    if il_bps.abs() < HEDGE_THRESHOLD_BPS {
        return (0, 0);
    }
    let reserve_a = amount_a * HEDGE_RATIO_BPS / 10_000;
    let reserve_b = amount_b * HEDGE_RATIO_BPS / 10_000;
    (reserve_a, reserve_b)
}

/// Compute the hedge reserve to **release** proportionally when `liquidity_removed`
/// out of `total_liquidity` is burned.
///
/// Returns `(release_a, release_b)`.
pub fn compute_hedge_release(
    pool: &PoolState,
    liquidity_removed: i128,
    total_liquidity: i128,
) -> (i128, i128) {
    if total_liquidity == 0 {
        return (0, 0);
    }
    let frac_a = pool.il_reserve_a * liquidity_removed / total_liquidity.max(1);
    let frac_b = pool.il_reserve_b * liquidity_removed / total_liquidity.max(1);
    (frac_a, frac_b)
}

// ─── Entry sqrt price helpers ─────────────────────────────────────────────────

/// Check if a position's IL has exceeded the hedge threshold given current pool.
/// Returns the IL in bps and whether hedging should trigger.
pub fn should_hedge(
    position: &LpPosition,
    pool: &PoolState,
) -> Result<(i128, bool), AmmError> {
    let il = estimate_il_bps(position, pool);
    Ok((il, il.abs() >= HEDGE_THRESHOLD_BPS))
}

// ─── Capital efficiency ────────────────────────────────────────────────────────

/// Capital efficiency = active_liquidity / total_liquidity_ever_deposited.
///
/// Returns a value in bps (0–10_000).  10_000 means 100% of liquidity is
/// active (all positions in range).
pub fn capital_efficiency_bps(active_liquidity: i128, total_liquidity: i128) -> i128 {
    if total_liquidity == 0 {
        return 0;
    }
    (active_liquidity * 10_000 / total_liquidity).min(10_000)
}
