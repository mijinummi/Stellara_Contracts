import {
  IsEnum,
  IsInt,
  IsDateString,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EventType } from '../types/stellar.types';

export class StellarEventDto {
  @IsString()
  id: string;

  @IsEnum(EventType)
  eventType: EventType;

  @IsInt()
  ledgerSequence: number;

  @IsDateString()
  timestamp: string;

  @IsString()
  transactionHash: string;

  @IsString()
  sourceAccount: string;

  @ValidateNested()
  @Type(() => Object)
  payload: Record<string, any>;
}
