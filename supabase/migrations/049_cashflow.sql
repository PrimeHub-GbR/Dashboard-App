-- CashFlow: Barmittel-Tracking pro Monatsende, je Konto/Firma
-- Zugriff nur fuer Admin/Manager (via public.is_admin_or_manager() aus 041)

-- Verwaltbare Konten (Provider x Firma)
CREATE TABLE cash_accounts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider    TEXT NOT NULL,                       -- 'Finom' | 'Amazon' (frei erweiterbar)
  name        TEXT NOT NULL,                        -- Firma/Entity, z.B. 'PrimeHub'
  color       TEXT NOT NULL DEFAULT '#22c55e',      -- fuer Charts
  sort_order  INT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, name)
);

-- Monats-Staende je Konto (Periodenschluessel = 1. des Monats)
CREATE TABLE cash_balances (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES cash_accounts(id) ON DELETE CASCADE,
  month       DATE NOT NULL,                        -- z.B. 2026-03-01 = "Maerz 2026"
  amount      NUMERIC(14,2) NOT NULL,
  note        TEXT,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, month)
);

-- Indizes
CREATE INDEX idx_cash_accounts_active ON cash_accounts (is_active);
CREATE INDEX idx_cash_balances_month ON cash_balances (month);
CREATE INDEX idx_cash_balances_account_month ON cash_balances (account_id, month);

-- RLS: nur Admin/Manager
ALTER TABLE cash_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cash_accounts_manager_all" ON cash_accounts
  FOR ALL TO authenticated
  USING (public.is_admin_or_manager())
  WITH CHECK (public.is_admin_or_manager());

CREATE POLICY "cash_balances_manager_all" ON cash_balances
  FOR ALL TO authenticated
  USING (public.is_admin_or_manager())
  WITH CHECK (public.is_admin_or_manager());

-- Seed: initiale Konten
INSERT INTO cash_accounts (provider, name, color, sort_order) VALUES
  ('Finom',  'PrimeHub',     '#22c55e', 10),
  ('Finom',  'PrimeMax',     '#16a34a', 20),
  ('Finom',  'SolidStore24', '#0ea5e9', 30),
  ('Finom',  'ebay',         '#3b82f6', 40),
  ('Amazon', 'BuchDepot24',  '#f59e0b', 50),
  ('Amazon', 'PrimeMax',     '#f97316', 60),
  ('Amazon', 'SolidStore24', '#ef4444', 70)
ON CONFLICT (provider, name) DO NOTHING;
