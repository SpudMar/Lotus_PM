-- CreateEnum
CREATE TYPE "AutoTriggerType" AS ENUM ('EVENT', 'SCHEDULE');

-- CreateEnum
CREATE TYPE "AutoExecutionResult" AS ENUM ('SUCCESS', 'SKIPPED', 'FAILED');

-- CreateTable
CREATE TABLE "auto_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "triggerType" "AutoTriggerType" NOT NULL,
    "triggerEvent" TEXT,
    "cronExpression" TEXT,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "lastTriggeredAt" TIMESTAMP(3),
    "executionCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "auto_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auto_execution_logs" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "context" JSONB NOT NULL,
    "result" "AutoExecutionResult" NOT NULL,
    "actionsRun" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "durationMs" INTEGER,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auto_execution_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auto_rules_triggerType_idx" ON "auto_rules"("triggerType");

-- CreateIndex
CREATE INDEX "auto_rules_isActive_idx" ON "auto_rules"("isActive");

-- CreateIndex
CREATE INDEX "auto_execution_logs_ruleId_idx" ON "auto_execution_logs"("ruleId");

-- CreateIndex
CREATE INDEX "auto_execution_logs_executedAt_idx" ON "auto_execution_logs"("executedAt");

-- AddForeignKey
ALTER TABLE "auto_execution_logs" ADD CONSTRAINT "auto_execution_logs_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "auto_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
