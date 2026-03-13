-- Migration: Add ean2bbp to workflow_key enum
-- Feature: EAN2BBP Dashboard Integration

ALTER TYPE workflow_key ADD VALUE IF NOT EXISTS 'ean2bbp';
