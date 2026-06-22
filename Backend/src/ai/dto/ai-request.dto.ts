import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class AiRequestDto {
  @IsString()
  @IsNotEmpty()
  prompt: string;

  @IsString()
  @IsOptional()
  userId?: string;
}
