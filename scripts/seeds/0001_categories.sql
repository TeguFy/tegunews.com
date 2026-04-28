-- Seed: 4 default categories matching the header nav.
-- Idempotent — `INSERT OR IGNORE` skips on slug collision (slug is UNIQUE).
-- IDs are static so re-running is a true no-op (no row churn, no audit noise).

INSERT OR IGNORE INTO categories (id, slug, name, description, seo_title, seo_desc) VALUES
  ('cat-world-0000-0000-0000-000000000001', 'world',    'World',      'International news, geopolitics, global affairs.', 'World news — TeguNews',     'Coverage of international events, conflicts, diplomacy, and geopolitics.'),
  ('cat-tech-00000-0000-0000-000000000002', 'tech',     'Technology', 'Tech industry, startups, AI, internet, software.',  'Tech news — TeguNews',      'Reporting on the technology industry: AI, internet, hardware, software.'),
  ('cat-biz-000000-0000-0000-000000000003', 'business', 'Business',   'Markets, companies, economy, finance.',             'Business news — TeguNews',  'Markets, companies, economy, finance — what moves the bottom line.'),
  ('cat-op-0000000-0000-0000-000000000004', 'opinion',  'Opinion',    'Editorials, columns, perspectives.',                'Opinion — TeguNews',        'Editorials, columns, and perspectives from TeguNews staff and contributors.');
