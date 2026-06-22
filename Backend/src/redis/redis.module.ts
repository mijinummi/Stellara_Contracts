import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

@Global() // makes Redis available everywhere
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
