-- 40 realistic users covering admin/editor/author/commenter roles.
-- Idempotent: INSERT OR IGNORE keyed on user.email uniqueness + user.id PK.
-- Run: wrangler d1 execute tegunews --remote --file=scripts/agents/users-seed.sql
--
-- Notes:
--   * The `user` table is shared with the 25 launch personas (role='agent').
--     None of the emails below collide with personas-rename.sql.
--   * Roles used: admin (2), editor (3), author (5), commenter (30).
--     'commenter' is the canonical role for reader accounts (per AGENTS.md +
--     better-auth schema default). Do NOT use 'user' — it bypasses the admin
--     UI's role select dropdown and renders as a stale 'admin' label.
--   * No password set: login is OAuth / email-link. Admins can promote
--     credentials via the auth UI later. We do NOT touch `account` or
--     `session` tables.
--   * createdAt/updatedAt are deterministic offsets in ms (0..90 days back)
--     so the dataset doesn't all share one fresh-seed timestamp.
--   * twoFactorEnabled / twoFactorVerified are NOT NULL with default 0;
--     we set 0 explicitly to mirror personas-seed.sql style.

-- ============ admins (2) ============
INSERT OR IGNORE INTO user (id, name, email, emailVerified, image, role, twoFactorEnabled, twoFactorVerified, createdAt, updatedAt) VALUES
  ('u-admin-001-0000-4000-8000-000000000001', 'Tho Nguyen', 'tho.nguyen@tegunews.com', 1, 'https://i.pravatar.cc/150?u=tho.nguyen@tegunews.com', 'admin', 0, 0, unixepoch()*1000 - 7776000000, unixepoch()*1000 - 7776000000),
  ('u-admin-002-0000-4000-8000-000000000002', 'Anna Pham', 'anna.pham@tegunews.com', 1, 'https://i.pravatar.cc/150?u=anna.pham@tegunews.com', 'admin', 0, 0, unixepoch()*1000 - 7344000000, unixepoch()*1000 - 7344000000);

-- ============ editors (3) ============
INSERT OR IGNORE INTO user (id, name, email, emailVerified, image, role, twoFactorEnabled, twoFactorVerified, createdAt, updatedAt) VALUES
  ('u-editor-001-0000-4000-8000-000000000001', 'Hieu Tran', 'hieu.tran@tegunews.com', 1, 'https://i.pravatar.cc/150?u=hieu.tran@tegunews.com', 'editor', 0, 0, unixepoch()*1000 - 6912000000, unixepoch()*1000 - 6912000000),
  ('u-editor-002-0000-4000-8000-000000000002', 'Rebecca Lin', 'r.lin@tegunews.com', 1, 'https://i.pravatar.cc/150?u=r.lin@tegunews.com', 'editor', 0, 0, unixepoch()*1000 - 6480000000, unixepoch()*1000 - 6480000000),
  ('u-editor-003-0000-4000-8000-000000000003', 'Quan Vo', 'quan.vo@tegunews.com', 1, 'https://i.pravatar.cc/150?u=quan.vo@tegunews.com', 'editor', 0, 0, unixepoch()*1000 - 6048000000, unixepoch()*1000 - 6048000000);

-- ============ authors (5) ============
INSERT OR IGNORE INTO user (id, name, email, emailVerified, image, role, twoFactorEnabled, twoFactorVerified, createdAt, updatedAt) VALUES
  ('u-author-001-0000-4000-8000-000000000001', 'Trang Bui', 'trang.bui@tegunews.com', 1, 'https://i.pravatar.cc/150?u=trang.bui@tegunews.com', 'author', 0, 0, unixepoch()*1000 - 5616000000, unixepoch()*1000 - 5616000000),
  ('u-author-002-0000-4000-8000-000000000002', 'Duc Nguyen', 'duc.nguyen@tegunews.com', 1, 'https://i.pravatar.cc/150?u=duc.nguyen@tegunews.com', 'author', 0, 0, unixepoch()*1000 - 5184000000, unixepoch()*1000 - 5184000000),
  ('u-author-003-0000-4000-8000-000000000003', 'Mai Le', 'mai.le@tegunews.com', 1, 'https://i.pravatar.cc/150?u=mai.le@tegunews.com', 'author', 0, 0, unixepoch()*1000 - 4752000000, unixepoch()*1000 - 4752000000),
  ('u-author-004-0000-4000-8000-000000000004', 'Long Hoang', 'long.hoang@tegunews.com', 1, 'https://i.pravatar.cc/150?u=long.hoang@tegunews.com', 'author', 0, 0, unixepoch()*1000 - 4320000000, unixepoch()*1000 - 4320000000),
  ('u-author-005-0000-4000-8000-000000000005', 'James Whitfield', 'james.whitfield@tegunews.com', 1, 'https://i.pravatar.cc/150?u=james.whitfield@tegunews.com', 'author', 0, 0, unixepoch()*1000 - 3888000000, unixepoch()*1000 - 3888000000);

-- ============ commenters (30) ============
INSERT OR IGNORE INTO user (id, name, email, emailVerified, image, role, twoFactorEnabled, twoFactorVerified, createdAt, updatedAt) VALUES
  ('u-commenter-001-0000-4000-8000-00000000001', 'Thuy Le', 'thuy.le.hcm@gmail.com', 1, NULL, 'commenter', 0, 0, unixepoch()*1000 - 3456000000, unixepoch()*1000 - 3456000000),
  ('u-commenter-002-0000-4000-8000-00000000002', 'nam_hoang92', 'nam.hoang.92@gmail.com', 1, NULL, 'commenter', 0, 0, unixepoch()*1000 - 3369600000, unixepoch()*1000 - 3369600000),
  ('u-commenter-003-0000-4000-8000-00000000003', 'dat.tran', 'dat.tran.work@outlook.com', 1, NULL, 'commenter', 0, 0, unixepoch()*1000 - 3283200000, unixepoch()*1000 - 3283200000),
  ('u-commenter-004-0000-4000-8000-00000000004', 'Sarah Wells', 'sarah.wells@icloud.com', 1, NULL, 'commenter', 0, 0, unixepoch()*1000 - 3196800000, unixepoch()*1000 - 3196800000),
  ('u-commenter-005-0000-4000-8000-00000000005', 'kien.do.04', 'kien.do.04@proton.me', 1, NULL, 'commenter', 0, 0, unixepoch()*1000 - 3110400000, unixepoch()*1000 - 3110400000),
  ('u-commenter-006-0000-4000-8000-00000000006', 'haiyen', 'haiyen.reads@gmail.com', 1, NULL, 'commenter', 0, 0, unixepoch()*1000 - 3024000000, unixepoch()*1000 - 3024000000),
  ('u-commenter-007-0000-4000-8000-00000000007', 'Marcus Bell', 'marcus.bell@hey.com', 1, NULL, 'commenter', 0, 0, unixepoch()*1000 - 2937600000, unixepoch()*1000 - 2937600000),
  ('u-commenter-008-0000-4000-8000-00000000008', 'phuc_n', 'phuc.nguyen.dn@yahoo.com', 1, NULL, 'commenter', 0, 0, unixepoch()*1000 - 2851200000, unixepoch()*1000 - 2851200000),
  ('u-commenter-009-0000-4000-8000-00000000009', 'Lan Vu', 'lan.vu.86@outlook.com', 1, NULL, 'commenter', 0, 0, unixepoch()*1000 - 2764800000, unixepoch()*1000 - 2764800000),
  ('u-commenter-010-0000-4000-8000-00000000010', 'tom.j', 'tom.j.collins@fastmail.com', 1, NULL, 'commenter', 0, 0, unixepoch()*1000 - 2678400000, unixepoch()*1000 - 2678400000),
  ('u-commenter-011-0000-4000-8000-00000000011', 'Quoc Anh', 'quoc.anh.hue@gmail.com', 1, NULL, 'commenter', 0, 0, unixepoch()*1000 - 2592000000, unixepoch()*1000 - 2592000000),
  ('u-commenter-012-0000-4000-8000-00000000012', 'priya_rk', 'priya.rk@proton.me', 1, NULL, 'commenter', 0, 0, unixepoch()*1000 - 2505600000, unixepoch()*1000 - 2505600000),
  ('u-commenter-013-0000-4000-8000-00000000013', 'Hung Pham', 'hung.pham.83@yahoo.com', 1, NULL, 'commenter', 0, 0, unixepoch()*1000 - 2419200000, unixepoch()*1000 - 2419200000),
  ('u-commenter-014-0000-4000-8000-00000000014', 'ellie.w', 'ellie.w.murphy@icloud.com', 1, NULL, 'commenter', 0, 0, unixepoch()*1000 - 2332800000, unixepoch()*1000 - 2332800000),
  ('u-commenter-015-0000-4000-8000-00000000015', 'tuan.ng_07', 'tuan.nguyen.07@gmail.com', 1, NULL, 'commenter', 0, 0, unixepoch()*1000 - 2246400000, unixepoch()*1000 - 2246400000),
  ('u-commenter-016-0000-4000-8000-00000000016', 'Yuki Sato', 'yuki.sato@hey.com', 1, NULL, 'commenter', 0, 0, unixepoch()*1000 - 2160000000, unixepoch()*1000 - 2160000000),
  ('u-commenter-017-0000-4000-8000-00000000017', 'bich.thuy', 'bich.thuy.dl@outlook.com', 1, NULL, 'commenter', 0, 0, unixepoch()*1000 - 2073600000, unixepoch()*1000 - 2073600000),
  ('u-commenter-018-0000-4000-8000-00000000018', 'David Okafor', 'd.okafor@fastmail.com', 1, NULL, 'commenter', 0, 0, unixepoch()*1000 - 1987200000, unixepoch()*1000 - 1987200000),
  ('u-commenter-019-0000-4000-8000-00000000019', 'minh_an', 'minh.an.95@gmail.com', 1, NULL, 'commenter', 0, 0, unixepoch()*1000 - 1900800000, unixepoch()*1000 - 1900800000),
  ('u-commenter-020-0000-4000-8000-00000000020', 'Chau Pham', 'chau.pham.tn@yahoo.com', 1, NULL, 'commenter', 0, 0, unixepoch()*1000 - 1814400000, unixepoch()*1000 - 1814400000),
  ('u-commenter-021-0000-4000-8000-00000000021', 'r.kowalski', 'r.kowalski@proton.me', 1, NULL, 'commenter', 0, 0, unixepoch()*1000 - 1728000000, unixepoch()*1000 - 1728000000),
  ('u-commenter-022-0000-4000-8000-00000000022', 'son.hoang', 'son.hoang.hp@icloud.com', 1, NULL, 'commenter', 0, 0, unixepoch()*1000 - 1641600000, unixepoch()*1000 - 1641600000),
  ('u-commenter-023-0000-4000-8000-00000000023', 'Megan Riley', 'megan.riley@hey.com', 1, NULL, 'commenter', 0, 0, unixepoch()*1000 - 1555200000, unixepoch()*1000 - 1555200000),
  ('u-commenter-024-0000-4000-8000-00000000024', 'thao_2k', 'thao.bui.2k@gmail.com', 1, NULL, 'commenter', 0, 0, unixepoch()*1000 - 1468800000, unixepoch()*1000 - 1468800000),
  ('u-commenter-025-0000-4000-8000-00000000025', 'vinh.dang', 'vinh.dang.htt@outlook.com', 1, NULL, 'commenter', 0, 0, unixepoch()*1000 - 1382400000, unixepoch()*1000 - 1382400000),
  ('u-commenter-026-0000-4000-8000-00000000026', 'rafael_m', 'rafael.m.santos@fastmail.com', 1, NULL, 'commenter', 0, 0, unixepoch()*1000 - 1296000000, unixepoch()*1000 - 1296000000),
  ('u-commenter-027-0000-4000-8000-00000000027', 'Khoi Nguyen', 'khoi.nguyen.cantho@gmail.com', 1, NULL, 'commenter', 0, 0, unixepoch()*1000 - 1209600000, unixepoch()*1000 - 1209600000),
  ('u-commenter-028-0000-4000-8000-00000000028', 'jay_t', 'jay.t.morgan@icloud.com', 1, NULL, 'commenter', 0, 0, unixepoch()*1000 - 1036800000, unixepoch()*1000 - 1036800000),
  ('u-commenter-029-0000-4000-8000-00000000029', 'huong.dao', 'huong.dao.vt@yahoo.com', 1, NULL, 'commenter', 0, 0, unixepoch()*1000 - 864000000, unixepoch()*1000 - 864000000),
  ('u-commenter-030-0000-4000-8000-00000000030', 'Olivia Park', 'olivia.park@hey.com', 1, NULL, 'commenter', 0, 0, unixepoch()*1000 - 432000000, unixepoch()*1000 - 432000000);
