import { NestFactory } from '@nestjs/core';
import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './websocket/redis-io.adapter';
import { ThrottleGuard } from './throttle/throttle.guard';
import { ConfigValidationService } from './config/config-validation.service';
import { SecretsMaskingService } from './config/secrets-masking.service';
import { SecretsRotationService } from './config/secrets-rotation.service';

const REQUIRED_ENV_VARS = ['JWT_SECRET', 'DB_HOST', 'REDIS_URL'] as const;

function validateRequiredEnv(): void {
  const missing: string[] = [];
  for (const key of REQUIRED_ENV_VARS) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}.\n` +
        'Set them in your .env file or export them before starting the server.\n' +
        'Required: JWT_SECRET, DB_HOST, REDIS_URL (or REDIS_HOST + REDIS_PORT)',
    );
  }
}

let app: INestApplication;

async function bootstrap() {
  validateRequiredEnv();

  app = await NestFactory.create(AppModule);

  app.enableShutdownHooks();

  // ── Secrets masking ──────────────────────────────────────────────────────
  // Retrieve both services early so they are available before any other
  // service that might log sensitive information is touched.
  const maskingService = app.get(SecretsMaskingService);
  const rotationService = app.get(SecretsRotationService);

  Logger.log(
    `SecretsMaskingService ready — ${rotationService.registeredSecrets().length} rotation hooks registered`,
    'Bootstrap',
  );

  // ── Configuration validation ─────────────────────────────────────────────
  // Validation errors are already masked inside ConfigValidationService,
  // but we wrap the call here so that any unexpected throw is also masked.
  try {
    const configValidationService = app.get(ConfigValidationService);
    configValidationService.validate();
  } catch (err) {
    const safeMessage = maskingService.mask((err as Error).message);
    Logger.error(`Configuration validation failed: ${safeMessage}`, 'Bootstrap');
    process.exit(1);
  }

  // Enable validation globally
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Stellara API')
    .setDescription(
      'API for authentication, monitoring Stellar network events, and delivering webhooks',
    )
    .setVersion('1.0')
    .addTag('Authentication')
    .addTag('Stellar Monitor')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();

  app.useWebSocketAdapter(redisIoAdapter);
  app.useGlobalGuards(app.get(ThrottleGuard));

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  Logger.log(`Application is running on port ${port}`, 'Bootstrap');
}

bootstrap().catch((err) => {
  // Mask the error before it hits the process output
  Logger.error(
    `Failed to start application: ${(err as Error).message}`,
    (err as Error).stack,
    'Bootstrap',
  );
  process.exit(1);
});

const shutdownLogger = new Logger('Shutdown');

async function handleShutdown(signal: string): Promise<void> {
  shutdownLogger.log(`Received ${signal}. Starting graceful shutdown...`);
  try {
    if (app) {
      await app.close();
      shutdownLogger.log('Application closed successfully.');
    }
  } catch (err) {
    shutdownLogger.error(`Error during shutdown: ${(err as Error).message}`);
  } finally {
    process.exit(0);
  }
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
