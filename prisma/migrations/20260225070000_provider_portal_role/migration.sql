-- Add PROVIDER to CoreRole enum
ALTER TYPE "CoreRole" ADD VALUE IF NOT EXISTS 'PROVIDER';

-- Provider portal magic link tokens (passwordless auth)
CREATE TABLE "core_provider_magic_links" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "token"     TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "core_provider_magic_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "core_provider_magic_links_token_key" ON "core_provider_magic_links"("token");
CREATE INDEX "core_provider_magic_links_userId_idx" ON "core_provider_magic_links"("userId");
CREATE INDEX "core_provider_magic_links_token_idx" ON "core_provider_magic_links"("token");

ALTER TABLE "core_provider_magic_links"
    ADD CONSTRAINT "core_provider_magic_links_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "core_users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
