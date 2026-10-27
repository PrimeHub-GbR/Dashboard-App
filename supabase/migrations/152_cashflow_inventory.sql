-- CashFlow — Lagerbestand pro Monat (features/cashflow/lagerbestand.md)
-- Eine Zeile pro Amazon-Konto und Monat, vier einzeln leer-bare Werte.
-- Rein additiv: cash_accounts / cash_balances und deren Policies bleiben unveraendert.
-- Zugriff nur fuer Admin/Manager (via public.is_admin_or_manager() aus 041), wie cash_balances.

CREATE TABLE IF NOT EXISTS cash_inventory (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id         UUID NOT NULL REFERENCES cash_accounts(id) ON DELETE CASCADE,
  month              DATE NOT NULL,                 -- Periodenschluessel = 1. des Monats
  units              INTEGER,                       -- Stueck im Lager
  purchase_value     NUMERIC(12,2),                 -- Gesamt-EK in EUR
  potential_revenue  NUMERIC(12,2),                 -- EUR
  potential_profit   NUMERIC(12,2),                 -- EUR, darf negativ sein
  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cash_inventory_account_month_key UNIQUE (account_id, month),
  CONSTRAINT cash_inventory_month_first_chk
    CHECK (month = date_trunc('month', month)::date),
  CONSTRAINT cash_inventory_units_chk
    CHECK (units IS NULL OR (units >= 0 AND units <= 99999999)),
  CONSTRAINT cash_inventory_purchase_value_chk
    CHECK (purchase_value IS NULL OR (purchase_value >= 0 AND purchase_value <= 999999999.99)),
  CONSTRAINT cash_inventory_potential_revenue_chk
    CHECK (potential_revenue IS NULL OR (potential_revenue >= 0 AND potential_revenue <= 999999999.99)),
  CONSTRAINT cash_inventory_potential_profit_chk
    CHECK (potential_profit IS NULL OR (potential_profit >= -999999999.99 AND potential_profit <= 999999999.99))
);

-- Indizes (wie cash_balances)
CREATE INDEX IF NOT EXISTS idx_cash_inventory_month ON cash_inventory (month);
CREATE INDEX IF NOT EXISTS idx_cash_inventory_account_month ON cash_inventory (account_id, month);

-- updated_at wird wie bei 049 von der API gesetzt. Zusaetzlich haelt dieser Trigger
-- created_by stabil: ein Upsert (ON CONFLICT DO UPDATE) ueberschreibt den
-- urspruenglichen Anleger sonst mit dem aktuellen Bearbeiter.
CREATE OR REPLACE FUNCTION public.cash_inventory_keep_created_by()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cash_inventory_keep_created_by ON cash_inventory;
CREATE TRIGGER trg_cash_inventory_keep_created_by
  BEFORE UPDATE ON cash_inventory
  FOR EACH ROW EXECUTE FUNCTION public.cash_inventory_keep_created_by();

-- RLS: nur Admin/Manager — getrennte Policies je Operation
ALTER TABLE cash_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cash_inventory_manager_select" ON cash_inventory
  FOR SELECT TO authenticated
  USING (public.is_admin_or_manager());

CREATE POLICY "cash_inventory_manager_insert" ON cash_inventory
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_manager());

CREATE POLICY "cash_inventory_manager_update" ON cash_inventory
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_manager())
  WITH CHECK (public.is_admin_or_manager());

CREATE POLICY "cash_inventory_manager_delete" ON cash_inventory
  FOR DELETE TO authenticated
  USING (public.is_admin_or_manager());
