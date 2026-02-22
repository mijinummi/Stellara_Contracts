import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1769140849386 implements MigrationInterface {
  name = 'InitialSchema1769140849386';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."workflows_type_enum" AS ENUM('contract_deployment', 'trade_execution', 'ai_job_chain', 'indexing_verification', 'portfolio_update', 'reward_grant')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."workflows_state_enum" AS ENUM('pending', 'running', 'completed', 'failed', 'cancelled', 'compensating', 'compensated')`,
    );
    await queryRunner.query(
      `CREATE TABLE "workflows" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "idempotencyKey" character varying NOT NULL, "type" "public"."workflows_type_enum" NOT NULL, "state" "public"."workflows_state_enum" NOT NULL DEFAULT 'pending', "userId" character varying, "walletAddress" character varying, "input" jsonb NOT NULL, "output" jsonb, "context" jsonb, "currentStepIndex" integer NOT NULL DEFAULT '0', "totalSteps" integer NOT NULL DEFAULT '0', "startedAt" TIMESTAMP, "completedAt" TIMESTAMP, "failedAt" TIMESTAMP, "failureReason" character varying, "retryCount" integer NOT NULL DEFAULT '0', "maxRetries" integer NOT NULL DEFAULT '3', "nextRetryAt" TIMESTAMP, "requiresCompensation" boolean NOT NULL DEFAULT false, "isCompensated" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_619a202a61b92e73f20de8d29ed" UNIQUE ("idempotencyKey"), CONSTRAINT "PK_5b5757cc1cd86268019fef52e0c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e6b7312458454123287286afa6" ON "workflows" ("userId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_15206576633d3e612da44c882d" ON "workflows" ("type") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_98afa5ee1ac04e690c908bbf85" ON "workflows" ("state") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_619a202a61b92e73f20de8d29e" ON "workflows" ("idempotencyKey") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."workflow_steps_state_enum" AS ENUM('pending', 'running', 'completed', 'failed', 'skipped', 'compensating', 'compensated')`,
    );
    await queryRunner.query(
      `CREATE TABLE "workflow_steps" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "workflowId" uuid NOT NULL, "stepName" character varying NOT NULL, "stepIndex" integer NOT NULL, "state" "public"."workflow_steps_state_enum" NOT NULL DEFAULT 'pending', "input" jsonb, "output" jsonb, "config" jsonb, "retryCount" integer NOT NULL DEFAULT '0', "maxRetries" integer NOT NULL DEFAULT '3', "startedAt" TIMESTAMP, "completedAt" TIMESTAMP, "failedAt" TIMESTAMP, "failureReason" character varying, "nextRetryAt" TIMESTAMP, "requiresCompensation" boolean NOT NULL DEFAULT false, "isCompensated" boolean NOT NULL DEFAULT false, "compensatedAt" TIMESTAMP, "compensationStepName" character varying, "compensationConfig" jsonb, "isIdempotent" boolean NOT NULL DEFAULT false, "idempotencyKey" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_b602e5ecb22943db11c96a7f31c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5a56ecdb592cc9ed1924cd56eb" ON "workflow_steps" ("state") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_eb0c057661503827a7cd6d8ea4" ON "workflow_steps" ("workflowId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "webhook_consumers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(100) NOT NULL, "url" character varying(500) NOT NULL, "secret" character varying(100), "status" character varying(20) NOT NULL DEFAULT 'active', "maxRetries" integer NOT NULL DEFAULT '5', "timeoutMs" integer NOT NULL DEFAULT '5000', "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "metadata" text, "lastDeliveryAttempt" TIMESTAMP, "lastDeliverySuccess" TIMESTAMP, "totalDeliveries" integer NOT NULL DEFAULT '0', "failedDeliveries" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_ae1dac9605019632e845cd4f3ab" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f9a012d6f30c9ad8e5f5d8c6d6" ON "webhook_consumers" ("url") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2b2d74b0fecc64757b033373ca" ON "webhook_consumers" ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_60519c0ef4651ab9ce331d47ed" ON "webhook_consumers" ("isActive") `,
    );
    await queryRunner.query(
      `CREATE TABLE "stellar_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "eventType" character varying(20) NOT NULL, "ledgerSequence" integer NOT NULL, "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL, "transactionHash" character varying(64) NOT NULL, "sourceAccount" character varying(56) NOT NULL, "payload" text NOT NULL, "deliveryStatus" character varying(20) NOT NULL DEFAULT 'pending', "deliveryAttempts" integer NOT NULL DEFAULT '0', "lastAttemptAt" TIMESTAMP WITH TIME ZONE, "deliveredAt" TIMESTAMP WITH TIME ZONE, "deliveredTo" text, "failedDeliveries" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "errorMessage" text, "isProcessed" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_efc7a4a026a14f41246b55d7873" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_56e937f62e6766e06118ae9b6c" ON "stellar_events" ("eventType") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b6f5c1c7a4a8adaed3728b05d3" ON "stellar_events" ("ledgerSequence") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f8d00fffa3b5110edf867481dd" ON "stellar_events" ("timestamp") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9f76c9efc1e76d48e01f8eebe9" ON "stellar_events" ("transactionHash") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3297c60e536613d9a6984b5466" ON "stellar_events" ("sourceAccount") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_842c30a1d102e48a388b3de116" ON "stellar_events" ("deliveryStatus") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f33cdaaaeb7d011cd9167d45de" ON "stellar_events" ("lastAttemptAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ff0223ec6b4d2088d80a275370" ON "stellar_events" ("isProcessed") `,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_steps" ADD CONSTRAINT "FK_eb0c057661503827a7cd6d8ea41" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "workflow_steps" DROP CONSTRAINT "FK_eb0c057661503827a7cd6d8ea41"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ff0223ec6b4d2088d80a275370"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f33cdaaaeb7d011cd9167d45de"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_842c30a1d102e48a388b3de116"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3297c60e536613d9a6984b5466"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9f76c9efc1e76d48e01f8eebe9"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f8d00fffa3b5110edf867481dd"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b6f5c1c7a4a8adaed3728b05d3"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_56e937f62e6766e06118ae9b6c"`,
    );
    await queryRunner.query(`DROP TABLE "stellar_events"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_60519c0ef4651ab9ce331d47ed"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_2b2d74b0fecc64757b033373ca"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f9a012d6f30c9ad8e5f5d8c6d6"`,
    );
    await queryRunner.query(`DROP TABLE "webhook_consumers"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_eb0c057661503827a7cd6d8ea4"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5a56ecdb592cc9ed1924cd56eb"`,
    );
    await queryRunner.query(`DROP TABLE "workflow_steps"`);
    await queryRunner.query(`DROP TYPE "public"."workflow_steps_state_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_619a202a61b92e73f20de8d29e"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_98afa5ee1ac04e690c908bbf85"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_15206576633d3e612da44c882d"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e6b7312458454123287286afa6"`,
    );
    await queryRunner.query(`DROP TABLE "workflows"`);
    await queryRunner.query(`DROP TYPE "public"."workflows_state_enum"`);
    await queryRunner.query(`DROP TYPE "public"."workflows_type_enum"`);
  }
}
