import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { SecretsMaskingService } from '../config/secrets-masking.service';
import { SecretsRotationService } from '../config/secrets-rotation.service';

@Global() // makes Redis available everywhere
@Module({
  providers: [SecretsMaskingService, SecretsRotationService, RedisService],
  exports: [SecretsMaskingService, SecretsRotationService, RedisService],
})
export class RedisModule {}
