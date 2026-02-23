-- Migration: price_guide_pricing_region
-- WS-F1: NDIS Price Guide module
-- Adds PricingRegion enum, pricingRegion field on CrmParticipant,
-- and NdisPriceGuideVersion + NdisSupportItem tables.

-- CreateEnum
CREATE TYPE "PricingRegion" AS ENUM ('NON_REMOTE', 'REMOTE', 'VERY_REMOTE');

-- AlterTable CrmParticipant
ALTER TABLE "crm_participants" ADD COLUMN "pricingRegion" "PricingRegion" NOT NULL DEFAULT 'NON_REMOTE';

-- CreateTable ndis_price_guide_versions
CREATE TABLE "ndis_price_guide_versions" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedById" TEXT NOT NULL,

    CONSTRAINT "ndis_price_guide_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable ndis_support_items
CREATE TABLE "ndis_support_items" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "itemNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryCode" TEXT NOT NULL,
    "categoryCodePace" TEXT NOT NULL,
    "categoryName" TEXT NOT NULL,
    "categoryNamePace" TEXT NOT NULL,
    "registrationGroupNumber" TEXT NOT NULL,
    "registrationGroupName" TEXT NOT NULL,
    "unitType" TEXT NOT NULL,
    "itemType" TEXT,
    "quotable" BOOLEAN NOT NULL DEFAULT false,
    "priceStandardCents" INTEGER,
    "priceRemoteCents" INTEGER,
    "priceVeryRemoteCents" INTEGER,
    "allowNonFaceToFace" BOOLEAN NOT NULL DEFAULT false,
    "allowProviderTravel" BOOLEAN NOT NULL DEFAULT false,
    "allowShortNoticeCancel" BOOLEAN NOT NULL DEFAULT false,
    "allowNdiaReports" BOOLEAN NOT NULL DEFAULT false,
    "allowIrregularSil" BOOLEAN NOT NULL DEFAULT false,
    "gstCode" TEXT,

    CONSTRAINT "ndis_support_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ndis_price_guide_versions_effectiveFrom_idx" ON "ndis_price_guide_versions"("effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "ndis_support_items_versionId_itemNumber_key" ON "ndis_support_items"("versionId", "itemNumber");

-- CreateIndex
CREATE INDEX "ndis_support_items_itemNumber_idx" ON "ndis_support_items"("itemNumber");

-- CreateIndex
CREATE INDEX "ndis_support_items_categoryCode_idx" ON "ndis_support_items"("categoryCode");

-- CreateIndex
CREATE INDEX "ndis_support_items_categoryCodePace_idx" ON "ndis_support_items"("categoryCodePace");

-- AddForeignKey
ALTER TABLE "ndis_price_guide_versions" ADD CONSTRAINT "ndis_price_guide_versions_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "core_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ndis_support_items" ADD CONSTRAINT "ndis_support_items_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ndis_price_guide_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
