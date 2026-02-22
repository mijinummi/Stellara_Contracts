import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Horizon } from '@stellar/stellar-sdk';
import { v4 as uuidv4 } from 'uuid';
import { EventStorageService } from './event-storage.service';
import { WebhookDeliveryService } from './webhook-delivery.service';
import { StellarEvent } from '../entities/stellar-event.entity';
import { EventType } from '../types/stellar.types';

interface HorizonPaymentOperation {
  id: string;
  paging_token: string;
  source_account: string;
  type_i: number;
  type: string;
  created_at: string;
  transaction_hash: string;
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  from: string;
  to: string;
  amount: string;
  transaction_attr: {
    ledger: number;
    memo?: string;
    memo_type?: string;
  };
}

interface HorizonManageOfferOperation {
  id: string;
  paging_token: string;
  source_account: string;
  type_i: number;
  type: string;
  created_at: string;
  transaction_hash: string;
  offer_id?: string;
  amount: string;
  price: string;
  selling_asset_type: string;
  selling_asset_code?: string;
  selling_asset_issuer?: string;
  buying_asset_type: string;
  buying_asset_code?: string;
  buying_asset_issuer?: string;
  transaction_attr: {
    ledger: number;
  };
}

@Injectable()
export class StellarEventMonitorService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(StellarEventMonitorService.name);
  private horizonServer: Horizon.Server;
  private paymentStream: (() => void) | null = null;
  private offerStream: (() => void) | null = null;
  private isMonitoring = false;
  private lastLedgerSequence = 0;

  constructor(
    private readonly eventStorageService: EventStorageService,
    private readonly webhookDeliveryService: WebhookDeliveryService,
  ) {
    const horizonUrl =
      process.env.HORIZON_URL || 'https://horizon-testnet.stellar.org';
    this.horizonServer = new Horizon.Server(horizonUrl);
    this.logger.log(`Initialized Horizon server at ${horizonUrl}`);
  }

  async onModuleInit() {
    if (process.env.STELLAR_MONITOR_ENABLED !== 'false') {
      await this.startMonitoring();
    }
  }

  async onModuleDestroy() {
    await this.stopMonitoring();
  }

  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      this.logger.warn('Monitoring is already running');
      return;
    }

    try {
      this.isMonitoring = true;

      // Get current ledger to start from
      const ledger = await this.horizonServer
        .ledgers()
        .order('desc')
        .limit(1)
        .call();
      this.lastLedgerSequence = ledger.records[0].sequence;

      this.logger.log(
        `Starting monitoring from ledger ${this.lastLedgerSequence}`,
      );

      // Start streaming payments
      this.startPaymentStream();

      // Start streaming offers
      this.startOfferStream();

      this.logger.log('Stellar event monitoring started successfully');
    } catch (error) {
      this.logger.error(
        `Failed to start monitoring: ${error.message}`,
        error.stack,
      );
      this.isMonitoring = false;
      throw error;
    }
  }

  async stopMonitoring(): Promise<void> {
    if (!this.isMonitoring) {
      return;
    }

    this.logger.log('Stopping Stellar event monitoring...');

    try {
      if (this.paymentStream) {
        this.paymentStream();
        this.paymentStream = null;
      }

      if (this.offerStream) {
        this.offerStream();
        this.offerStream = null;
      }

      this.isMonitoring = false;
      this.logger.log('Stellar event monitoring stopped');
    } catch (error) {
      this.logger.error(
        `Error stopping monitoring: ${error.message}`,
        error.stack,
      );
    }
  }

  private startPaymentStream(): void {
    this.paymentStream = this.horizonServer
      .payments()
      .cursor('now')
      .stream({
        onmessage: (payment: any) => {
          this.handlePaymentEvent(payment).catch((error) => {
            this.logger.error(
              `Error handling payment event: ${error.message}`,
              error.stack,
            );
          });
        },
        onerror: (event: MessageEvent) => {
          const error = event as unknown as Error;
          this.logger.error(
            `Payment stream error: ${error.message}`,
            error.stack,
          );
          // Attempt to restart the stream
          setTimeout(() => {
            if (this.isMonitoring) {
              this.logger.log('Attempting to restart payment stream...');
              this.startPaymentStream();
            }
          }, 5000);
        },
      });
  }

  private startOfferStream(): void {
    this.offerStream = this.horizonServer
      .operations()
      .cursor('now')
      .stream({
        onmessage: (offer: any) => {
          // Filter for manage offer operations
          if (
            offer.type === 'manage_sell_offer' ||
            offer.type === 'manage_buy_offer'
          ) {
            this.handleOfferEvent(offer).catch((error) => {
              this.logger.error(
                `Error handling offer event: ${error.message}`,
                error.stack,
              );
            });
          }
        },
        onerror: (event: MessageEvent) => {
          const error = event as unknown as Error;
          this.logger.error(
            `Offer stream error: ${error.message}`,
            error.stack,
          );
          // Attempt to restart the stream
          setTimeout(() => {
            if (this.isMonitoring) {
              this.logger.log('Attempting to restart offer stream...');
              this.startOfferStream();
            }
          }, 5000);
        },
      });
  }

  private async handlePaymentEvent(payment: any): Promise<void> {
    try {
      const eventData = {
        id: uuidv4(),
        eventType: EventType.PAYMENT,
        ledgerSequence: payment.transaction_attr.ledger,
        timestamp: new Date(payment.created_at).toISOString(),
        transactionHash: payment.transaction_hash,
        sourceAccount: payment.from,
        payload: {
          amount: payment.amount,
          assetType: payment.asset_type,
          assetCode: payment.asset_code,
          assetIssuer: payment.asset_issuer,
          from: payment.from,
          to: payment.to,
          memo: payment.transaction_attr.memo,
          memoType: payment.transaction_attr.memo_type,
        },
      };

      const savedEvent = await this.eventStorageService.saveEvent(eventData);
      await this.webhookDeliveryService.queueEventForDelivery(savedEvent);

      this.logger.debug(
        `Processed payment event ${savedEvent.id} from ${payment.from} to ${payment.to}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process payment event: ${error.message}`,
        error.stack,
      );
    }
  }

  private async handleOfferEvent(offer: any): Promise<void> {
    try {
      const eventData = {
        id: uuidv4(),
        eventType: EventType.OFFER,
        ledgerSequence: offer.transaction_attr.ledger,
        timestamp: new Date(offer.created_at).toISOString(),
        transactionHash: offer.transaction_hash,
        sourceAccount: offer.source_account,
        payload: {
          offerId: offer.offer_id?.toString(),
          seller: offer.source_account,
          sellingAssetType: offer.selling_asset_type,
          sellingAssetCode: offer.selling_asset_code,
          sellingAssetIssuer: offer.selling_asset_issuer,
          buyingAssetType: offer.buying_asset_type,
          buyingAssetCode: offer.buying_asset_code,
          buyingAssetIssuer: offer.buying_asset_issuer,
          amount: offer.amount,
          price: offer.price,
          type: this.determineOfferType(offer),
        },
      };

      const savedEvent = await this.eventStorageService.saveEvent(eventData);
      await this.webhookDeliveryService.queueEventForDelivery(savedEvent);

      this.logger.debug(
        `Processed offer event ${savedEvent.id} from ${offer.source_account}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process offer event: ${error.message}`,
        error.stack,
      );
    }
  }

  private determineOfferType(offer: any): string {
    // Simplified logic - in reality would need to check if it's create/update/delete
    if (parseFloat(offer.amount) === 0) {
      return 'delete';
    } else if (offer.offer_id) {
      return 'update';
    } else {
      return 'create';
    }
  }

  // Method to simulate events for testing
  async simulatePaymentEvent(
    from: string = 'GAIH3ULLFQ4DGSECF2AR555KZ4KNDGEKN4AFI4SU2M7B43MGK3QJZNSR',
    to: string = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    amount: string = '100',
    assetType: string = 'native',
  ): Promise<StellarEvent> {
    const eventData = {
      id: uuidv4(),
      eventType: EventType.PAYMENT,
      ledgerSequence: this.lastLedgerSequence + 1,
      timestamp: new Date().toISOString(),
      transactionHash: `simulated-${uuidv4()}`,
      sourceAccount: from,
      payload: {
        amount,
        assetType,
        from,
        to,
        simulated: true,
      },
    };

    const savedEvent = await this.eventStorageService.saveEvent(eventData);
    await this.webhookDeliveryService.queueEventForDelivery(savedEvent);

    this.logger.log(`Simulated payment event ${savedEvent.id}`);
    return savedEvent;
  }

  async simulateOfferEvent(
    seller: string = 'GAIH3ULLFQ4DGSECF2AR555KZ4KNDGEKN4AFI4SU2M7B43MGK3QJZNSR',
    sellingAmount: string = '1000',
    buyingAmount: string = '50',
  ): Promise<StellarEvent> {
    const price = (
      parseFloat(buyingAmount) / parseFloat(sellingAmount)
    ).toString();

    const eventData = {
      id: uuidv4(),
      eventType: EventType.OFFER,
      ledgerSequence: this.lastLedgerSequence + 1,
      timestamp: new Date().toISOString(),
      transactionHash: `simulated-${uuidv4()}`,
      sourceAccount: seller,
      payload: {
        offerId: 'simulated-' + Date.now(),
        seller,
        sellingAssetType: 'credit_alphanum4',
        sellingAssetCode: 'USD',
        sellingAssetIssuer:
          'GAIH3ULLFQ4DGSECF2AR555KZ4KNDGEKN4AFI4SU2M7B43MGK3QJZNSR',
        buyingAssetType: 'native',
        amount: sellingAmount,
        price,
        type: 'create',
        simulated: true,
      },
    };

    const savedEvent = await this.eventStorageService.saveEvent(eventData);
    await this.webhookDeliveryService.queueEventForDelivery(savedEvent);

    this.logger.log(`Simulated offer event ${savedEvent.id}`);
    return savedEvent;
  }

  getStatus(): {
    isMonitoring: boolean;
    lastLedgerSequence: number;
    horizonUrl: string;
  } {
    return {
      isMonitoring: this.isMonitoring,
      lastLedgerSequence: this.lastLedgerSequence,
      horizonUrl: this.horizonServer.serverURL.toString(),
    };
  }

  async getLatestLedger(): Promise<number> {
    try {
      const ledger = await this.horizonServer
        .ledgers()
        .order('desc')
        .limit(1)
        .call();
      return ledger.records[0].sequence;
    } catch (error) {
      this.logger.error(
        `Failed to get latest ledger: ${error.message}`,
        error.stack,
      );
      return this.lastLedgerSequence;
    }
  }
}
