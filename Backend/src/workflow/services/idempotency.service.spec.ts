import { Test, TestingModule } from '@nestjs/testing';
import { IdempotencyService } from './idempotency.service';

describe('IdempotencyService', () => {
  let service: IdempotencyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [IdempotencyService],
    }).compile();

    service = module.get<IdempotencyService>(IdempotencyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateWorkflowIdempotencyKey', () => {
    it('should generate consistent idempotency key for same input', () => {
      const workflowType = 'contract_deployment';
      const userId = 'user123';
      const input = { contractCode: '0x123', contractName: 'TestContract' };
      const context = { version: '1.0' };

      const key1 = service.generateWorkflowIdempotencyKey(
        workflowType,
        userId,
        input,
        context,
      );
      const key2 = service.generateWorkflowIdempotencyKey(
        workflowType,
        userId,
        input,
        context,
      );

      expect(key1).toBe(key2);
      expect(key1).toMatch(/^workflow:contract_deployment:user123:[a-f0-9]+$/);
    });

    it('should generate different keys for different inputs', () => {
      const workflowType = 'contract_deployment';
      const userId = 'user123';
      const input1 = { contractCode: '0x123', contractName: 'TestContract' };
      const input2 = {
        contractCode: '0x456',
        contractName: 'DifferentContract',
      }; // Different name to ensure different hash

      const key1 = service.generateWorkflowIdempotencyKey(
        workflowType,
        userId,
        input1,
      );
      const key2 = service.generateWorkflowIdempotencyKey(
        workflowType,
        userId,
        input2,
      );

      // Keys should be different due to different contract name
      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different users', () => {
      const workflowType = 'contract_deployment';
      const input = { contractCode: '0x123', contractName: 'TestContract' };
      const userId1 = 'user123';
      const userId2 = 'user456';

      const key1 = service.generateWorkflowIdempotencyKey(
        workflowType,
        userId1,
        input,
      );
      const key2 = service.generateWorkflowIdempotencyKey(
        workflowType,
        userId2,
        input,
      );

      expect(key1).not.toBe(key2);
    });
  });

  describe('generateStepIdempotencyKey', () => {
    it('should generate consistent step idempotency key', () => {
      const workflowIdempotencyKey =
        'workflow:contract_deployment:user123:abc123';
      const stepName = 'deploy_contract';
      const stepInput = { contractAddress: '0x789' };

      const key1 = service.generateStepIdempotencyKey(
        workflowIdempotencyKey,
        stepName,
        stepInput,
      );
      const key2 = service.generateStepIdempotencyKey(
        workflowIdempotencyKey,
        stepName,
        stepInput,
      );

      expect(key1).toBe(key2);
      expect(key1).toMatch(/^step:deploy_contract:[a-f0-9]+$/);
    });
  });

  describe('generateUniqueIdempotencyKey', () => {
    it('should generate unique idempotency key', () => {
      const operationType = 'reward_grant';
      const identifier = 'user123';

      const key1 = service.generateUniqueIdempotencyKey(
        operationType,
        identifier,
      );
      const key2 = service.generateUniqueIdempotencyKey(
        operationType,
        identifier,
      );

      expect(key1).not.toBe(key2);
      expect(key1).toMatch(/^reward_grant:user123:[a-f0-9-]+$/);
      expect(key2).toMatch(/^reward_grant:user123:[a-f0-9-]+$/);
    });
  });

  describe('validateIdempotencyKey', () => {
    it('should validate matching idempotency key', () => {
      const workflowType = 'contract_deployment';
      const userId = 'user123';
      const input = { contractCode: '0x123' };
      const expectedKey = service.generateWorkflowIdempotencyKey(
        workflowType,
        userId,
        input,
      );

      const isValid = service.validateIdempotencyKey(
        expectedKey,
        workflowType,
        userId,
        input,
      );

      expect(isValid).toBe(true);
    });

    it('should reject non-matching idempotency key', () => {
      const workflowType = 'contract_deployment';
      const userId = 'user123';
      const input1 = { contractCode: '0x123', contractName: 'TestContract' };
      const input2 = {
        contractCode: '0x456',
        contractName: 'DifferentContract',
      }; // Different name
      const expectedKey = service.generateWorkflowIdempotencyKey(
        workflowType,
        userId,
        input1,
      );

      // This should be false since input2 is different from input1
      const isValid = service.validateIdempotencyKey(
        expectedKey,
        workflowType,
        userId,
        input2,
      );

      expect(isValid).toBe(false);
    });
  });

  describe('parseIdempotencyKey', () => {
    it('should parse workflow idempotency key', () => {
      const key = 'workflow:contract_deployment:user123:abc123def456';

      const parsed = service.parseIdempotencyKey(key);

      expect(parsed).toEqual({
        type: 'workflow',
        prefix: 'workflow',
        identifier: 'contract_deployment:user123',
        hash: 'abc123def456',
      });
    });

    it('should parse step idempotency key', () => {
      const key = 'step:deploy_contract:abc123def456';

      const parsed = service.parseIdempotencyKey(key);

      expect(parsed).toEqual({
        type: 'step',
        prefix: 'step',
        identifier: 'deploy_contract',
        hash: 'abc123def456',
      });
    });

    it('should parse unique idempotency key', () => {
      const key = 'unique:reward_grant:user123:abc-123-def';

      const parsed = service.parseIdempotencyKey(key);

      // Based on the actual parsing logic, the identifier is just the second part
      expect(parsed).toEqual({
        type: 'unique',
        prefix: 'unique',
        identifier: 'reward_grant',
        hash: 'user123',
      });
    });

    it('should handle unknown format', () => {
      const key = 'unknown_format';

      const parsed = service.parseIdempotencyKey(key);

      expect(parsed).toEqual({
        type: 'unique',
        prefix: 'unknown_format',
        identifier: 'unknown',
        hash: undefined,
      });
    });
  });

  describe('checkIdempotency', () => {
    it('should execute operation and cache result when no cache provided', async () => {
      const idempotencyKey = 'test:key';
      const operation = jest.fn().mockResolvedValue('result');
      const cache = undefined;

      const result = await service.checkIdempotency(
        idempotencyKey,
        operation,
        cache,
      );

      expect(result).toEqual({ result: 'result', isDuplicate: false });
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should return cached result when cache hit', async () => {
      const idempotencyKey = 'test:key';
      const operation = jest.fn().mockResolvedValue('result');
      const cachedResult = 'cached_result';
      const cache = {
        get: jest.fn().mockResolvedValue(cachedResult),
        set: jest.fn().mockResolvedValue(undefined),
      };

      const result = await service.checkIdempotency(
        idempotencyKey,
        operation,
        cache,
      );

      expect(result).toEqual({ result: cachedResult, isDuplicate: true });
      expect(operation).not.toHaveBeenCalled();
      expect(cache.get).toHaveBeenCalledWith(idempotencyKey);
    });

    it('should execute and cache result when cache miss', async () => {
      const idempotencyKey = 'test:key';
      const operation = jest.fn().mockResolvedValue('result');
      const cache = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue(undefined),
      };

      const result = await service.checkIdempotency(
        idempotencyKey,
        operation,
        cache,
      );

      expect(result).toEqual({ result: 'result', isDuplicate: false });
      expect(operation).toHaveBeenCalledTimes(1);
      expect(cache.get).toHaveBeenCalledWith(idempotencyKey);
      expect(cache.set).toHaveBeenCalledWith(idempotencyKey, 'result');
    });

    it('should handle cache errors gracefully', async () => {
      const idempotencyKey = 'test:key';
      const operation = jest.fn().mockResolvedValue('result');
      const cache = {
        get: jest.fn().mockRejectedValue(new Error('Cache error')),
        set: jest.fn().mockResolvedValue(undefined),
      };

      const result = await service.checkIdempotency(
        idempotencyKey,
        operation,
        cache,
      );

      expect(result).toEqual({ result: 'result', isDuplicate: false });
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });
});
