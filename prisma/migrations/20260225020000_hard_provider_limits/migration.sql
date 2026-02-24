-- Hard Provider Limits
CREATE TYPE "QuarantineLimitType" AS ENUM ('SOFT', 'HARD');
ALTER TABLE "fq_quarantines" ADD COLUMN "limitType" "QuarantineLimitType" NOT NULL DEFAULT 'SOFT';
