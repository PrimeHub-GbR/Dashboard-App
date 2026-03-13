-- Migration: 005_orders
-- Creates orders and sync_log tables for PROJ-2 Google Drive Excel Order Import

-- ─────────────────────────────────────────────
-- orders: flat model, one row per order
-- ─────────────────────────────────────────────
CREATE TABLE orders (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT        NOT NULL,
  order_date   DATE,
  supplier     TEXT,
  status       TEXT,
  notes        TEXT,
  raw_data     JSONB       NOT NULL DEFAULT '{}',
  synced_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX idx_orders_order_date   ON orders (order_date DESC NULLS LAST);
CREATE INDEX idx_orders_supplier     ON orders (supplier);
CREATE INDEX idx_orders_status       ON orders (status);
CREATE INDEX idx_orders_order_number ON orders (order_number);

-- Enable RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all orders
CREATE POLICY "orders_select_authenticated"
  ON orders FOR SELECT
  TO authenticated
  USING (true);

-- NOTE: No UPDATE policy for orders — all writes go through service role API routes.
-- Direct client writes are blocked. Edits flow through PATCH /api/orders/[id].

-- ─────────────────────────────────────────────
-- sync_log: one entry per sync run
-- ─────────────────────────────────────────────
CREATE TABLE sync_log (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_key   TEXT        NOT NULL,
  status         TEXT        NOT NULL CHECK (status IN ('success', 'error', 'running')),
  synced_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rows_imported  INTEGER,
  error_message  TEXT
);

CREATE INDEX idx_sync_log_workflow_key ON sync_log (workflow_key);
CREATE INDEX idx_sync_log_synced_at    ON sync_log (synced_at DESC);

ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read sync logs
CREATE POLICY "sync_log_select_authenticated"
  ON sync_log FOR SELECT
  TO authenticated
  USING (true);

-- Trigger to auto-update updated_at on orders (search_path fixed to prevent injection)
CREATE OR REPLACE FUNCTION update_orders_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_orders_updated_at();
