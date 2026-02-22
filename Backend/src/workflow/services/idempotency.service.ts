import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  /**
   * Stable stringification for consistent hashing
   */
  private stableStringify(obj: any): string {
    return JSON.stringify(obj, Object.keys(obj).sort());
  }

  /**
   * Generate a deterministic idempotency key for a workflow
   */
  generateWorkflowIdempotencyKey(
    workflowType: string,
    userId: string,
    input: Record<string, any>,
    additionalContext?: Record<string, any>,
  ): string {
    const keyData = {
      workflowType,
      userId,
      input: this.stableStringify(input),
      additionalContext: additionalContext
        ? this.stableStringify(additionalContext)
        : undefined,
      timestamp: new Date().toISOString().split('T')[0], // Daily key rotation
    };

    const hash = createHash('sha256')
      .update(JSON.stringify(keyData, Object.keys(keyData).sort()))
      .digest('hex');

    return `workflow:${workflowType}:${userId}:${hash}`;
  }

  /**
   * Generate a deterministic idempotency key for a specific step
   */
  generateStepIdempotencyKey(
    workflowIdempotencyKey: string,
    stepName: string,
    stepInput: Record<string, any>,
  ): string {
    const keyData = {
      workflowIdempotencyKey,
      stepName,
      stepInput: this.stableStringify(stepInput),
    };

    const hash = createHash('sha256')
      .update(JSON.stringify(keyData, Object.keys(keyData).sort()))
      .digest('hex');

    return `step:${stepName}:${hash}`;
  }

  /**
   * Generate a unique idempotency key for one-time operations
   */
  generateUniqueIdempotencyKey(
    operationType: string,
    identifier: string,
  ): string {
    return `${operationType}:${identifier}:${uuidv4()}`;
  }

  /**
   * Validate if an input matches the expected idempotency key
   */
  validateIdempotencyKey(
    expectedKey: string,
    workflowType: string,
    userId: string,
    input: Record<string, any>,
    additionalContext?: Record<string, any>,
  ): boolean {
    const generatedKey = this.generateWorkflowIdempotencyKey(
      workflowType,
      userId,
      input,
      additionalContext,
    );

    return expectedKey === generatedKey;
  }

  /**
   * Extract metadata from idempotency key for debugging
   */
  parseIdempotencyKey(idempotencyKey: string): {
    type: 'workflow' | 'step' | 'unique';
    prefix: string;
    identifier: string;
    hash?: string;
  } {
    const parts = idempotencyKey.split(':');

    if (parts[0] === 'workflow' && parts.length >= 4) {
      return {
        type: 'workflow',
        prefix: parts[0],
        identifier: `${parts[1]}:${parts[2]}`,
        hash: parts[3],
      };
    }

    if (parts[0] === 'step' && parts.length >= 3) {
      return {
        type: 'step',
        prefix: parts[0],
        identifier: parts[1],
        hash: parts[2],
      };
    }

    if (parts[0] === 'unique' && parts.length >= 3) {
      return {
        type: 'unique',
        prefix: parts[0],
        identifier: parts[1],
        hash: parts[2],
      };
    }

    // Fallback for unknown formats
    return {
      type: 'unique',
      prefix: parts[0] || 'unknown',
      identifier: parts[1] || 'unknown',
      hash: parts[2],
    };
  }

  /**
   * Check if an operation should be skipped based on idempotency
   */
  async checkIdempotency(
    idempotencyKey: string,
    operation: () => Promise<any>,
    cache?: {
      get: (key: string) => Promise<any>;
      set: (key: string, value: any) => Promise<void>;
    },
  ): Promise<{ result: any; isDuplicate: boolean }> {
    // If cache is provided, check for existing result
    if (cache) {
      try {
        const cachedResult = await cache.get(idempotencyKey);
        if (cachedResult) {
          this.logger.debug(
            `Returning cached result for idempotency key: ${idempotencyKey}`,
          );
          return { result: cachedResult, isDuplicate: true };
        }
      } catch (error) {
        this.logger.warn('Failed to check idempotency cache:', error);
      }
    }

    // Execute the operation
    this.logger.debug(
      `Executing operation for idempotency key: ${idempotencyKey}`,
    );
    const result = await operation();

    // Cache the result if cache is provided
    if (cache) {
      try {
        await cache.set(idempotencyKey, result);
      } catch (error) {
        this.logger.warn('Failed to cache idempotency result:', error);
      }
    }

    return { result, isDuplicate: false };
  }
}
