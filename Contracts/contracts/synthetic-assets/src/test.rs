#![cfg(test)]

use super::*;
use soroban_sdk::{
    symbol_short,
    testutils::Address as _,
    token::{Client as TokenClient, StellarAssetClient},
    Address, Env,
};

fn create_collateral_token(
    env: &Env,
    admin: &Address,
) -> (Address, TokenClient<'static>, StellarAssetClient<'static>) {
    let addr = env.register_stellar_asset_contract(admin.clone());
    (
        addr.clone(),
        TokenClient::new(env, &addr),
        StellarAssetClient::new(env, &addr),
    )
}

#[test]
fn test_cdp_full_lifecycle() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    // Contract must be the admin of the synthetic token so it can mint/burn
    let contract_id = env.register_contract(None, SyntheticAssetsContract);

    let (coll_addr, coll_client, coll_admin) = create_collateral_token(&env, &admin);
    let synth_addr = env.register_stellar_asset_contract(contract_id.clone());
    let synth_client = TokenClient::new(&env, &synth_addr);

    let sc = SyntheticAssetsContractClient::new(&env, &contract_id);
    sc.initialize(&admin);

    let asset = symbol_short!("sUSD");
    sc.register_asset(
        &admin, &asset,
        &15000,   // min_cratio: 150%
        &12000,   // liq_cratio: 120%
        &1300,    // liq_penalty: 13%
        &50,
        &coll_addr,
        &synth_addr,
    );
    sc.update_price(&admin, &asset, &1_000_000); // $1.00

    coll_admin.mint(&user, &10000);

    // Open CDP — collateral moves from user to contract
    sc.open_cdp(&user, &asset, &1500);
    assert_eq!(coll_client.balance(&user), 8500);
    assert_eq!(coll_client.balance(&contract_id), 1500);

    // Mint 1000 synthetic tokens
    // cratio = (1500 * 1e6 / 1e6) * 10000 / 1000 = 15000 (exactly 150%)
    sc.mint(&user, &asset, &1000);
    assert_eq!(synth_client.balance(&user), 1000);

    // Burn 500 tokens — balance halves
    sc.burn(&user, &asset, &500);
    assert_eq!(synth_client.balance(&user), 500);

    // Burn remaining debt before closing
    sc.burn(&user, &asset, &500);
    assert_eq!(synth_client.balance(&user), 0);

    // Close CDP — full collateral returned
    let returned = sc.close_cdp(&user, &asset);
    assert_eq!(returned, 1500);
    assert_eq!(coll_client.balance(&user), 10000);
    assert_eq!(coll_client.balance(&contract_id), 0);

    let cdp = sc.get_cdp(&user, &asset);
    assert!(!cdp.is_active);
}

#[test]
fn test_add_collateral_transfers_tokens() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    let contract_id = env.register_contract(None, SyntheticAssetsContract);
    let (coll_addr, coll_client, coll_admin) = create_collateral_token(&env, &admin);
    let synth_addr = env.register_stellar_asset_contract(contract_id.clone());

    let sc = SyntheticAssetsContractClient::new(&env, &contract_id);
    sc.initialize(&admin);

    let asset = symbol_short!("sETH");
    sc.register_asset(&admin, &asset, &15000, &12000, &1300, &50, &coll_addr, &synth_addr);
    sc.update_price(&admin, &asset, &1_000_000);

    coll_admin.mint(&user, &5000);
    sc.open_cdp(&user, &asset, &1000);
    assert_eq!(coll_client.balance(&user), 4000);
    assert_eq!(coll_client.balance(&contract_id), 1000);

    sc.add_collateral(&user, &asset, &500);
    assert_eq!(coll_client.balance(&user), 3500);
    assert_eq!(coll_client.balance(&contract_id), 1500);

    let cdp = sc.get_cdp(&user, &asset);
    assert_eq!(cdp.collateral_amount, 1500);
}

#[test]
fn test_liquidation_transfers_collateral_to_liquidator() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let liquidator = Address::generate(&env);

    let contract_id = env.register_contract(None, SyntheticAssetsContract);
    let (coll_addr, coll_client, coll_admin) = create_collateral_token(&env, &admin);
    let synth_addr = env.register_stellar_asset_contract(contract_id.clone());
    let synth_client = TokenClient::new(&env, &synth_addr);

    let sc = SyntheticAssetsContractClient::new(&env, &contract_id);
    sc.initialize(&admin);

    let asset = symbol_short!("sBTC");
    // liq_cratio (16000) > min_cratio (15000) so a position minted at exactly
    // 150% cratio is already below the liquidation threshold — making it
    // immediately liquidatable without needing a price feed drop.
    sc.register_asset(
        &admin, &asset,
        &15000,   // min_cratio: 150%
        &16000,   // liq_cratio: 160% (intentionally > min for test setup)
        &1300,    // liq_penalty: 13%
        &50,
        &coll_addr,
        &synth_addr,
    );
    sc.update_price(&admin, &asset, &1_000_000);

    coll_admin.mint(&user, &10000);

    // Open CDP and mint at exactly 150% → stored cratio = 15000 < liq_cratio (16000)
    sc.open_cdp(&user, &asset, &1500);
    sc.mint(&user, &asset, &1000);

    assert_eq!(coll_client.balance(&user), 8500);
    assert_eq!(synth_client.balance(&user), 1000);

    // Give the liquidator the synthetic tokens they need to repay the debt
    synth_client.transfer(&user, &liquidator, &1000);
    assert_eq!(synth_client.balance(&liquidator), 1000);

    // seized = 1500 - (1500 * 1300 / 10000) = 1500 - 195 = 1305
    let expected_seized = 1500_i128 - (1500_i128 * 1300 / 10000);
    let liq_coll_before = coll_client.balance(&liquidator);

    let seized = sc.liquidate(&liquidator, &user, &asset);

    assert_eq!(seized, expected_seized);
    // Liquidator burned debt tokens
    assert_eq!(synth_client.balance(&liquidator), 0);
    // Liquidator received the seized collateral
    assert_eq!(coll_client.balance(&liquidator), liq_coll_before + seized);
    // Penalty collateral (195) remains in contract
    assert_eq!(coll_client.balance(&contract_id), 1500 - seized);

    // CDP is wiped
    let cdp = sc.get_cdp(&user, &asset);
    assert!(!cdp.is_active);
    assert_eq!(cdp.minted_amount, 0);
    assert_eq!(cdp.collateral_amount, 0);
}
