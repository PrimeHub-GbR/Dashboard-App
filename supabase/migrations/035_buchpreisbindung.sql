-- Migration: 035_buchpreisbindung
-- Feature: Buchpreisbindung-Prüfung Tab

-- Händler-Konfigurationen
CREATE TABLE buchpreischeck_sellers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amazon_seller_id TEXT NOT NULL,
  seller_name TEXT,
  is_active BOOLEAN DEFAULT false,
  interval_minutes INTEGER DEFAULT 60,
  active_weekdays TEXT[] DEFAULT ARRAY['mon','tue','wed','thu','fri','sat','sun'],
  next_run_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(amazon_seller_id)
);

-- Durchlauf-Protokoll
CREATE TABLE buchpreischeck_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES buchpreischeck_sellers(id) ON DELETE CASCADE,
  amazon_seller_id TEXT NOT NULL,
  status TEXT DEFAULT 'running' CHECK (status IN ('running','success','failed','timeout')),
  triggered_by TEXT DEFAULT 'scheduler' CHECK (triggered_by IN ('scheduler','manual')),
  total_items INTEGER,
  violations_count INTEGER,
  excel_file_path TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Einzelne Buchtitel pro Durchlauf
CREATE TABLE buchpreischeck_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES buchpreischeck_runs(id) ON DELETE CASCADE,
  isbn13 TEXT NOT NULL,
  asin TEXT,
  title TEXT,
  amazon_price NUMERIC(10,2),
  vlb_price NUMERIC(10,2),
  amazon_url TEXT,
  is_compliant BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_buchpreischeck_sellers_user ON buchpreischeck_sellers(user_id);
CREATE INDEX idx_buchpreischeck_sellers_active ON buchpreischeck_sellers(is_active, next_run_at);
CREATE INDEX idx_buchpreischeck_runs_seller ON buchpreischeck_runs(seller_id, created_at DESC);
CREATE INDEX idx_buchpreischeck_items_run ON buchpreischeck_items(run_id);

-- Updated-at Trigger
CREATE TRIGGER buchpreischeck_sellers_updated_at
  BEFORE UPDATE ON buchpreischeck_sellers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE buchpreischeck_sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE buchpreischeck_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE buchpreischeck_items ENABLE ROW LEVEL SECURITY;

-- Policies: alle authentifizierten User
CREATE POLICY "buchpreischeck_sellers_select" ON buchpreischeck_sellers
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "buchpreischeck_sellers_insert" ON buchpreischeck_sellers
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "buchpreischeck_sellers_update" ON buchpreischeck_sellers
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "buchpreischeck_sellers_delete" ON buchpreischeck_sellers
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "buchpreischeck_runs_select" ON buchpreischeck_runs
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "buchpreischeck_items_select" ON buchpreischeck_items
  FOR SELECT USING (auth.uid() IS NOT NULL);
