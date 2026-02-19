import * as StellarSdk from '@stellar/stellar-sdk';
import { 
  DEFAULT_STELLAR_NETWORK, 
  STELLAR_HORIZON_URLS, 
  STELLAR_NETWORK 
} from '@/lib/constants';
import { StellarAccount, StellarTransaction } from '@/types';

class StellarService {
  private server: StellarSdk.Horizon.Server;
  private networkPassphrase: string;

  constructor(network: keyof typeof STELLAR_NETWORK = DEFAULT_STELLAR_NETWORK as keyof typeof STELLAR_NETWORK) {
    const horizonUrl = STELLAR_HORIZON_URLS[network];
    this.server = new StellarSdk.Horizon.Server(horizonUrl);
    
    this.networkPassphrase = (network as string) === 'public' 
      ? StellarSdk.Networks.PUBLIC 
      : (network as string) === 'testnet' 
        ? StellarSdk.Networks.TESTNET 
        : StellarSdk.Networks.FUTURENET;
  }

  // Get account details
  async getAccount(publicKey: string): Promise<StellarAccount | null> {
    try {
      const account = await this.server.loadAccount(publicKey);
      
      return {
        publicKey: account.id,
        balance: account.balances.find(b => b.asset_type === 'native')?.balance || '0',
        sequence: account.sequence,
        subentryCount: account.subentry_count,
      };
    } catch (error) {
      console.error('Error fetching account:', error);
      return null;
    }
  }

  // Get account transactions
  async getAccountTransactions(
    publicKey: string, 
    limit: number = 20
  ): Promise<StellarTransaction[]> {
    try {
      const transactions = await this.server
        .transactions()
        .forAccount(publicKey)
        .limit(limit)
        .order('desc')
        .call();

      return transactions.records.map(tx => ({
        id: tx.id,
        source: tx.source_account,
        destination: tx.source_account, // Will be updated when we parse operations
        amount: '0', // Will be updated when we parse operations
        asset: 'XLM',
        timestamp: new Date(tx.created_at),
        status: tx.successful ? 'success' : 'failed',
      }));
    } catch (error) {
      console.error('Error fetching transactions:', error);
      return [];
    }
  }

  // Generate key pair
  generateKeyPair(): { publicKey: string; secretKey: string } {
    const pair = StellarSdk.Keypair.random();
    return {
      publicKey: pair.publicKey(),
      secretKey: pair.secret(),
    };
  }

  // Validate public key
  isValidPublicKey(publicKey: string): boolean {
    try {
      return StellarSdk.StrKey.isValidEd25519PublicKey(publicKey);
    } catch {
      return false;
    }
  }

  // Create and submit transaction
  async submitTransaction(
    sourceKeypair: StellarSdk.Keypair,
    destination: string,
    amount: string,
    memo?: string
  ): Promise<StellarTransaction | null> {
    try {
      // Load source account
      const sourceAccount = await this.server.loadAccount(sourceKeypair.publicKey());

      // Build transaction
      const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          StellarSdk.Operation.payment({
            destination,
            asset: StellarSdk.Asset.native(),
            amount,
          })
        );

      // Add memo if provided
      if (memo) {
        transaction.addMemo(StellarSdk.Memo.text(memo));
      }

      // Build and sign transaction
      const builtTransaction = transaction.setTimeout(30).build();
      builtTransaction.sign(sourceKeypair);

      // Submit transaction
      const result = await this.server.submitTransaction(builtTransaction);

      return {
        id: result.hash,
        source: sourceKeypair.publicKey(),
        destination,
        amount,
        asset: 'XLM',
        timestamp: new Date(),
        status: 'success',
      };
    } catch (error) {
      console.error('Error submitting transaction:', error);
      return null;
    }
  }

  // Get network details
  getNetworkDetails() {
    return {
      network: DEFAULT_STELLAR_NETWORK,
      horizonUrl: STELLAR_HORIZON_URLS[DEFAULT_STELLAR_NETWORK],
      networkPassphrase: this.networkPassphrase,
    };
  }

  // Get asset information
  async getAssetInfo(assetCode: string, assetIssuer?: string) {
    try {
      if (!assetIssuer) {
        // Native XLM asset
        return {
          code: 'XLM',
          issuer: null,
          name: 'Stellar Lumens',
          type: 'native',
        };
      }

      const asset = new StellarSdk.Asset(assetCode, assetIssuer);
      const assets = await this.server
        .assets()
        .forCode(assetCode)
        .forIssuer(assetIssuer)
        .call();

      if (assets.records.length > 0) {
        return {
          code: assetCode,
          issuer: assetIssuer,
          name: `${assetCode} Token`,
          type: 'credit_alphanum4',
        };
      }

      return null;
    } catch (error) {
      console.error('Error fetching asset info:', error);
      return null;
    }
  }
}

// Export singleton instance
export const stellarService = new StellarService();