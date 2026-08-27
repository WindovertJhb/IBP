-- Optional starter data for a fresh Windovert IBP Supabase project.
--
-- Everything here is a placeholder based on the rebuild brief. Confirm real
-- team names, current staff, and product list with Brian, then edit this
-- file (or just enter it through the app's People / Products / Teams tabs
-- instead — this script is a shortcut, not a requirement).

-- Salespeople (per brief: current reps used in commission tooling)
insert into people (name, role) values
  ('Selina', 'sales'),
  ('Davie', 'sales'),
  ('Werner', 'sales');

-- Placeholder install teams — confirm real names with Brian before relying
-- on these; the old tool used "Install Team A/B/C" as an example only.
insert into teams (name) values
  ('Install Team A'),
  ('Install Team B'),
  ('Install Team C');
