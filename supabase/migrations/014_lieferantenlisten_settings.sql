CREATE TABLE lieferantenlisten_settings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lieferant   TEXT NOT NULL CHECK (lieferant IN ('blank', 'a43-kulturgut', 'avus')),
  rabatt_prozent NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (rabatt_prozent >= 0 AND rabatt_prozent <= 100),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, lieferant)
);

ALTER TABLE lieferantenlisten_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own settings"
  ON lieferantenlisten_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert own settings"
  ON lieferantenlisten_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
  ON lieferantenlisten_settings FOR UPDATE
  USING (auth.uid() = user_id);
