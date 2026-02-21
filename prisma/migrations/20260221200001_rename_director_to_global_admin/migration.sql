-- Rename DIRECTOR enum value to GLOBAL_ADMIN in CoreRole
-- This is a data-preserving rename: all existing DIRECTOR users become GLOBAL_ADMIN

ALTER TYPE "CoreRole" RENAME VALUE 'DIRECTOR' TO 'GLOBAL_ADMIN';
