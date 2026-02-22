import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAnalyticsTables1700000000000 implements MigrationInterface {
    name = 'AddAnalyticsTables1700000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."analytics_metrics_type_enum" AS ENUM('counter', 'gauge', 'histogram', 'summary')`);
        await queryRunner.query(`CREATE TYPE "public"."analytics_metrics_category_enum" AS ENUM('system', 'business', 'user', 'performance', 'security')`);
        await queryRunner.query(`CREATE TABLE "analytics_metrics" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(100) NOT NULL, "type" "public"."analytics_metrics_type_enum" NOT NULL, "category" "public"."analytics_metrics_category_enum" NOT NULL, "value" numeric(15,4) NOT NULL, "labels" json, "tenantId" character varying(36), "userId" character varying(36), "timestamp" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_1234567890abcdef1234567890ab" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_analytics_metrics_category_name_timestamp" ON "analytics_metrics" ("category", "name", "timestamp")`);
        await queryRunner.query(`CREATE INDEX "IDX_analytics_metrics_tenant_timestamp" ON "analytics_metrics" ("tenantId", "timestamp")`);
        await queryRunner.query(`CREATE INDEX "IDX_analytics_metrics_tenant_id" ON "analytics_metrics" ("tenantId")`);
        await queryRunner.query(`CREATE INDEX "IDX_analytics_metrics_user_id" ON "analytics_metrics" ("userId")`);
        await queryRunner.query(`CREATE INDEX "IDX_analytics_metrics_timestamp" ON "analytics_metrics" ("timestamp")`);
        
        await queryRunner.query(`CREATE TYPE "public"."analytics_alerts_severity_enum" AS ENUM('low', 'medium', 'high', 'critical')`);
        await queryRunner.query(`CREATE TYPE "public"."analytics_alerts_status_enum" AS ENUM('triggered', 'acknowledged', 'resolved', 'silenced')`);
        await queryRunner.query(`CREATE TABLE "analytics_alerts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(100) NOT NULL, "description" text NOT NULL, "severity" "public"."analytics_alerts_severity_enum" NOT NULL, "status" "public"."analytics_alerts_status_enum" NOT NULL DEFAULT 'triggered', "metricName" character varying(100) NOT NULL, "condition" json NOT NULL, "currentValue" json, "tenantId" character varying(36), "userId" character varying(36), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "acknowledgedAt" TIMESTAMP, "resolvedAt" TIMESTAMP, "acknowledgedBy" character varying(36), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_0987654321fedcba0987654321fe" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_analytics_alerts_status_created" ON "analytics_alerts" ("status", "createdAt")`);
        await queryRunner.query(`CREATE INDEX "IDX_analytics_alerts_severity_created" ON "analytics_alerts" ("severity", "createdAt")`);
        await queryRunner.query(`CREATE INDEX "IDX_analytics_alerts_tenant_id" ON "analytics_alerts" ("tenantId")`);
        await queryRunner.query(`CREATE INDEX "IDX_analytics_alerts_user_id" ON "analytics_alerts" ("userId")`);
        await queryRunner.query(`CREATE INDEX "IDX_analytics_alerts_created_at" ON "analytics_alerts" ("createdAt")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_analytics_alerts_created_at"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_analytics_alerts_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_analytics_alerts_tenant_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_analytics_alerts_severity_created"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_analytics_alerts_status_created"`);
        await queryRunner.query(`DROP TABLE "analytics_alerts"`);
        await queryRunner.query(`DROP TYPE "public"."analytics_alerts_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."analytics_alerts_severity_enum"`);
        
        await queryRunner.query(`DROP INDEX "public"."IDX_analytics_metrics_timestamp"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_analytics_metrics_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_analytics_metrics_tenant_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_analytics_metrics_tenant_timestamp"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_analytics_metrics_category_name_timestamp"`);
        await queryRunner.query(`DROP TABLE "analytics_metrics"`);
        await queryRunner.query(`DROP TYPE "public"."analytics_metrics_category_enum"`);
        await queryRunner.query(`DROP TYPE "public"."analytics_metrics_type_enum"`);
    }
}