-- Organisations-Baum: Hierarchische Struktur (GbR → Account → Store → Kategorie → Produkt)
CREATE TABLE org_nodes (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_id  UUID REFERENCES org_nodes(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'node'
               CHECK (type IN ('account', 'store', 'category', 'product', 'node')),
  sort_order INTEGER DEFAULT 0,
  color      TEXT DEFAULT '#6366f1',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- org_node_id auf Tasks hinzufügen
ALTER TABLE tasks ADD COLUMN org_node_id UUID REFERENCES org_nodes(id) ON DELETE SET NULL;

-- RLS
ALTER TABLE org_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated full access org_nodes"
  ON org_nodes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX org_nodes_parent_idx ON org_nodes(parent_id);
CREATE INDEX org_nodes_sort_idx ON org_nodes(sort_order);
CREATE INDEX tasks_org_node_idx ON tasks(org_node_id);

-- ============================================================
-- Seed-Daten aus dem Whiteboard
-- ============================================================

-- Level 1: Seller Central Accounts
INSERT INTO org_nodes (id, parent_id, name, type, sort_order, color) VALUES
  ('a1000000-0000-0000-0000-000000000001', NULL, 'PrimeHub', 'account', 1, '#3b82f6'),
  ('a1000000-0000-0000-0000-000000000002', NULL, 'PrimeLab', 'account', 2, '#8b5cf6'),
  ('a1000000-0000-0000-0000-000000000003', NULL, 'PrimeMax', 'account', 3, '#f59e0b');

-- Level 2: Stores
INSERT INTO org_nodes (id, parent_id, name, type, sort_order, color) VALUES
  ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Buch Depot 24',    'store', 1, '#3b82f6'),
  ('b1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'PrimeLab Germany', 'store', 1, '#8b5cf6'),
  ('b1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000003', 'Solid Store',      'store', 1, '#f59e0b');

-- Level 3: Kategorien
INSERT INTO org_nodes (id, parent_id, name, type, sort_order, color) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'Books',          'category', 1, '#3b82f6'),
  ('c1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002', 'Private Label',  'category', 1, '#8b5cf6'),
  ('c1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000003', 'Wholesale',      'category', 1, '#f59e0b');

-- Level 4: Produkte
INSERT INTO org_nodes (id, parent_id, name, type, sort_order, color) VALUES
  ('d1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', 'Katzenklappe', 'product', 1, '#8b5cf6'),
  ('d1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000002', 'Betonkerzen',  'product', 2, '#8b5cf6'),
  ('d1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000003', 'MLM',          'product', 1, '#f59e0b'),
  ('d1000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000003', 'Classic',      'product', 2, '#94a3b8');

-- Level 5: Sub-Produkte
INSERT INTO org_nodes (id, parent_id, name, type, sort_order, color) VALUES
  ('e1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000003', 'Forever Living', 'node', 1, '#f59e0b'),
  ('e1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000003', 'Amway',          'node', 2, '#f59e0b');
