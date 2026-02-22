import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean, IsEnum, ValidateNested, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export enum AiProviderType {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  GOOGLE = 'google',
  AZURE = 'azure',
}

export class AiModelConfigDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  maxTokens: number;

  @IsNumber()
  inputCostPerToken: number;

  @IsNumber()
  outputCostPerToken: number;

  @IsNumber()
  contextWindow: number;

  @IsBoolean()
  supportsStreaming: boolean;

  @IsBoolean()
  supportsFunctions: boolean;
}

export class AiProviderConfigDto {
  @IsEnum(AiProviderType)
  name: AiProviderType;

  @IsString()
  @IsNotEmpty()
  apiKey: string;

  @IsString()
  @IsOptional()
  baseUrl?: string;

  @IsString()
  @IsNotEmpty()
  defaultModel: string;

  @ValidateNested()
  @Type(() => AiModelConfigDto)
  models: Record<string, AiModelConfigDto>;

  @IsNumber()
  timeoutMs: number;

  @IsNumber()
  maxRetries: number;

  @IsNumber()
  retryDelayMs: number;
}

export class AiRequestOptionsDto {
  @IsString()
  @IsOptional()
  model?: string;

  @IsNumber()
  @IsOptional()
  temperature?: number;

  @IsNumber()
  @IsOptional()
  maxTokens?: number;

  @IsNumber()
  @IsOptional()
  topP?: number;

  @IsNumber()
  @IsOptional()
  frequencyPenalty?: number;

  @IsNumber()
  @IsOptional()
  presencePenalty?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  stopSequences?: string[];

  @IsString()
  @IsOptional()
  userId?: string;

  @IsString()
  @IsOptional()
  sessionId?: string;

  @IsString()
  @IsOptional()
  requestId?: string;

  @IsBoolean()
  @IsOptional()
  useCache?: boolean;

  @IsBoolean()
  @IsOptional()
  recordQuota?: boolean;

  @IsNumber()
  @IsOptional()
  cacheTtl?: number;

  @IsBoolean()
  @IsOptional()
  stream?: boolean;
}

export class AiRequestDto {
  @IsString()
  @IsNotEmpty()
  prompt: string;

  @ValidateNested()
  @Type(() => AiRequestOptionsDto)
  @IsOptional()
  options?: AiRequestOptionsDto;
}

export class AiResponseDto {
  @IsString()
  content: string;

  @IsString()
  model: string;

  @IsString()
  provider: string;

  tokensUsed: {
    prompt: number;
    completion: number;
    total: number;
  };

  cost: {
    input: number;
    output: number;
    total: number;
  };

  @IsBoolean()
  cached: boolean;

  @IsString()
  requestId: string;

  timestamp: Date;

  @IsOptional()
  metadata?: Record<string, any>;
}

export class AiProviderHealthDto {
  @IsString()
  provider: string;

  @IsEnum(['healthy', 'degraded', 'unhealthy'])
  status: 'healthy' | 'degraded' | 'unhealthy';

  @IsNumber()
  latencyMs: number;

  @IsNumber()
  errorRate: number;

  lastChecked: Date;

  @IsString()
  @IsOptional()
  failureReason?: string;
}