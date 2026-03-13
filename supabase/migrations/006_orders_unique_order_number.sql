-- Migration: 006_orders_unique_order_number
-- BUG-6: Add UNIQUE constraint on order_number to prevent duplicate imports.
-- The n8n workflow uses upsert on order_number, so the DB must enforce uniqueness.

ALTER TABLE orders ADD CONSTRAINT uq_orders_order_number UNIQUE (order_number);
