-- Migration: Xero Integration
-- REQ-019/REQ-023: Xero OAuth2 connection + invoice sync tracking
-- Adds: xero_connections table, xero sync fields on inv_invoices

-- ─── XeroConnection table ────────────────────────────────────────────────────

CREATE TABLE "xero_connections" (
    "id"             TEXT NOT NULL,
    "tenantId"       TEXT NOT NULL,
    "tenantName"     TEXT,
    "accessToken"    TEXT NOT NULL,
    "refreshToken"   TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "scopes"         TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "isActive"       BOOLEAN NOT NULL DEFAULT true,
    "connectedById"  TEXT NOT NULL,
    "connectedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncAt"     TIMESTAMP(3),
    "syncErrorCount" INTEGER NOT NULL DEFAULT 0,
    "lastSyncError"  TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "xero_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "xero_connections_tenantId_key" ON "xero_connections"("tenantId");
CREATE INDEX "xero_connections_isActive_idx" ON "xero_connections"("isActive");

-- ─── Xero sync fields on inv_invoices ────────────────────────────────────────

ALTER TABLE "inv_invoices"
    ADD COLUMN IF NOT EXISTS "xeroInvoiceId" TEXT,
    ADD COLUMN IF NOT EXISTS "xeroSyncedAt"  TIMESTAMP(3);
