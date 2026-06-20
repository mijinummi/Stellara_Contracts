import { IsString, IsNotEmpty, IsOptional, IsInt, Min } from 'class-validator';

export class ConfigDto {
  @IsString()
  @IsNotEmpty()
  JWT_SECRET: string;

  @IsString()
  @IsOptional()
  JWT_ACCESS_EXPIRATION?: string;

  @IsString()
  @IsOptional()
  DB_HOST?: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  DB_PORT?: number;

  @IsString()
  @IsOptional()
  DB_USERNAME?: string;

  @IsString()
  @IsNotEmpty()
  DB_PASSWORD: string;

  @IsString()
  @IsOptional()
  DB_DATABASE?: string;

  @IsString()
  @IsOptional()
  NODE_ENV?: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  PORT?: number;
}
