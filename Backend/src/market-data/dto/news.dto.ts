import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  IsInt,
  Min,
  Max,
} from 'class-validator';

export enum NewsCategory {
  MARKET = 'market',
  TECHNOLOGY = 'technology',
  REGULATION = 'regulation',
  STELLAR = 'stellar',
  DEFI = 'defi',
  NFT = 'nft',
}

export class NewsArticleDto {
  @ApiProperty({ description: 'Unique article ID' })
  @IsString()
  id: string;

  @ApiProperty({ description: 'Article title' })
  @IsString()
  title: string;

  @ApiProperty({ description: 'Article summary/description' })
  @IsString()
  summary: string;

  @ApiProperty({ description: 'Full article URL' })
  @IsString()
  url: string;

  @ApiProperty({ description: 'Publication timestamp' })
  publishedAt: Date;

  @ApiProperty({ description: 'News source name' })
  @IsString()
  source: string;

  @ApiPropertyOptional({ description: 'Article image URL' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'Article category', enum: NewsCategory })
  @IsOptional()
  @IsEnum(NewsCategory)
  category?: NewsCategory;

  @ApiPropertyOptional({ description: 'Article tags', type: [String] })
  @IsOptional()
  @IsArray()
  tags?: string[];
}

export class GetNewsQueryDto {
  @ApiPropertyOptional({
    description: 'News category filter',
    enum: NewsCategory,
  })
  @IsOptional()
  @IsEnum(NewsCategory)
  category?: NewsCategory;

  @ApiPropertyOptional({
    description: 'Number of articles to return',
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Force cache bypass', type: String })
  @IsOptional()
  bypassCache?: string | boolean;
}

export class NewsResponseDto {
  @ApiProperty({ description: 'List of news articles', type: [NewsArticleDto] })
  @IsArray()
  articles: NewsArticleDto[];

  @ApiProperty({ description: 'Total number of articles' })
  @IsInt()
  total: number;

  @ApiProperty({ description: 'Response timestamp' })
  timestamp: Date;

  @ApiPropertyOptional({ description: 'Whether data was served from cache' })
  @IsOptional()
  cached?: boolean;
}
