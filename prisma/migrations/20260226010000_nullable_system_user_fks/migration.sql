-- AlterTable: Make userId nullable on core_audit_logs for system-initiated actions
ALTER TABLE "core_audit_logs" ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable: Make userId nullable on crm_comm_logs for automation-generated entries
ALTER TABLE "crm_comm_logs" ALTER COLUMN "userId" DROP NOT NULL;
