import { Logger } from '@nestjs/common';

/**
 * Validation result interface
 */
export interface ValidationResult<T = any> {
  valid: boolean;
  value?: T;
  error?: string;
}

/**
 * Configuration validation rules
 */
interface ValidationRule {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: RegExp;
  enum?: any[];
  custom?: (value: any) => boolean;
  customMessage?: string;
}

/**
 * Centralized configuration validator
 */
export class ConfigurationValidator {
  private readonly logger = new Logger(ConfigurationValidator.name);
  private readonly validationRules: Map<string, ValidationRule> = new Map();

  constructor() {
    this.initializeValidationRules();
  }

  /**
   * Initialize validation rules for known configuration keys
   */
  private initializeValidationRules(): void {
    // App configuration rules
    this.validationRules.set('app', {
      type: 'object',
      required: true,
    });

    this.validationRules.set('app.port', {
      type: 'number',
      required: true,
      min: 1,
      max: 65535,
    });

    this.validationRules.set('app.host', {
      type: 'string',
      required: true,
      pattern: /^[\w\.-]+$/,
    });

    // Database configuration rules
    this.validationRules.set('database', {
      type: 'object',
      required: true,
    });

    this.validationRules.set('database.port', {
      type: 'number',
      required: true,
      min: 1,
      max: 65535,
    });

    this.validationRules.set('database.poolSize', {
      type: 'number',
      required: true,
      min: 1,
      max: 100,
    });

    this.validationRules.set('database.ssl', {
      type: 'boolean',
      required: false,
    });

    // Redis configuration rules
    this.validationRules.set('redis', {
      type: 'object',
      required: false,
    });

    this.validationRules.set('redis.port', {
      type: 'number',
      required: true,
      min: 1,
      max: 65535,
    });

    this.validationRules.set('redis.db', {
      type: 'number',
      required: true,
      min: 0,
      max: 15,
    });

    // AI configuration rules
    this.validationRules.set('ai', {
      type: 'object',
      required: false,
    });

    this.validationRules.set('ai.maxTokens', {
      type: 'number',
      required: true,
      min: 1,
      max: 8000,
    });

    this.validationRules.set('ai.temperature', {
      type: 'number',
      required: true,
      min: 0,
      max: 2,
    });

    this.validationRules.set('ai.timeout', {
      type: 'number',
      required: true,
      min: 1000,
      max: 300000,
    });

    // Security configuration rules
    this.validationRules.set('security', {
      type: 'object',
      required: true,
    });

    this.validationRules.set('security.bcryptRounds', {
      type: 'number',
      required: true,
      min: 4,
      max: 20,
    });

    this.validationRules.set('security.rateLimitWindow', {
      type: 'number',
      required: true,
      min: 1000,
      max: 3600000,
    });

    this.validationRules.set('security.rateLimitMax', {
      type: 'number',
      required: true,
      min: 1,
      max: 10000,
    });

    this.validationRules.set('security.jwtExpiresIn', {
      type: 'string',
      required: true,
      pattern: /^\d+[smhd]$/,
    });
  }

  /**
   * Validate a configuration value
   */
  validate<T>(key: string, value: T): ValidationResult<T> {
    // Get the base key (e.g., 'app.port' -> 'app')
    const baseKey = key.split('.')[0];
    const rule = this.validationRules.get(key) || this.validationRules.get(baseKey);

    if (!rule) {
      // No validation rule found, accept the value
      this.logger.debug(`No validation rule found for key: ${key}`);
      return { valid: true, value };
    }

    // Check required
    if (rule.required && (value === undefined || value === null)) {
      return {
        valid: false,
        error: `Configuration '${key}' is required`,
      };
    }

    // Skip further validation if value is not required and is undefined/null
    if (!rule.required && (value === undefined || value === null)) {
      return { valid: true, value };
    }

    // Validate type
    const typeValidation = this.validateType(key, value, rule.type);
    if (!typeValidation.valid) {
      return typeValidation;
    }

    // Validate number constraints
    if (rule.type === 'number' && typeof value === 'number') {
      if (rule.min !== undefined && value < rule.min) {
        return {
          valid: false,
          error: `Configuration '${key}' must be at least ${rule.min}`,
        };
      }
      if (rule.max !== undefined && value > rule.max) {
        return {
          valid: false,
          error: `Configuration '${key}' must be at most ${rule.max}`,
        };
      }
    }

    // Validate string pattern
    if (rule.type === 'string' && typeof value === 'string' && rule.pattern) {
      if (!rule.pattern.test(value)) {
        return {
          valid: false,
          error: `Configuration '${key}' has invalid format`,
        };
      }
    }

    // Validate enum
    if (rule.enum && !rule.enum.includes(value)) {
      return {
        valid: false,
        error: `Configuration '${key}' must be one of: ${rule.enum.join(', ')}`,
      };
    }

    // Validate custom rule
    if (rule.custom && !rule.custom(value)) {
      return {
        valid: false,
        error: rule.customMessage || `Configuration '${key}' failed custom validation`,
      };
    }

    return { valid: true, value };
  }

  /**
   * Validate value type
   */
  private validateType<T>(key: string, value: T, expectedType: string): ValidationResult<T> {
    const actualType = Array.isArray(value) ? 'array' : typeof value;

    if (actualType !== expectedType) {
      return {
        valid: false,
        error: `Configuration '${key}' must be of type ${expectedType}, got ${actualType}`,
      };
    }

    return { valid: true, value };
  }

  /**
   * Add a custom validation rule
   */
  addValidationRule(key: string, rule: ValidationRule): void {
    this.validationRules.set(key, rule);
    this.logger.debug(`Added validation rule for key: ${key}`);
  }

  /**
   * Remove a validation rule
   */
  removeValidationRule(key: string): void {
    this.validationRules.delete(key);
    this.logger.debug(`Removed validation rule for key: ${key}`);
  }

  /**
   * Get all validation rules
   */
  getValidationRules(): Record<string, ValidationRule> {
    const rules: Record<string, ValidationRule> = {};
    for (const [key, rule] of this.validationRules.entries()) {
      rules[key] = rule;
    }
    return rules;
  }
}
