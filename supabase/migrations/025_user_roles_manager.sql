-- Migration 025: manager-Rolle zu user_roles hinzufügen
-- Erweitert die Rollenhierarchie: admin | manager | staff

ALTER TABLE user_roles DROP CONSTRAINT user_roles_role_check;
ALTER TABLE user_roles ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('admin', 'manager', 'staff'));
