-- Migration: Add metadata JSONB column to jobs + add repricer-updater to workflow_key enum
-- Feature: PROJ-9 (Repricer Dashboard)

-- 1. Add metadata column for storing workflow-specific results (e.g. processing summary)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS metadata JSONB;

-- 2. Add repricer-updater to the workflow_key enum
ALTER TYPE workflow_key ADD VALUE IF NOT EXISTS 'repricer-updater';
