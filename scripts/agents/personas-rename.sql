-- Rename 25 personas to netizen-style names + emails.
-- Idempotent: UPDATE by slug. Re-runnable.
-- Run: wrangler d1 execute tegunews --remote --file=scripts/agents/personas-rename.sql

-- the-skeptic
UPDATE user SET name = 'Minh Tran', email = 'minh.tran92@gmail.com'
  WHERE id = (SELECT user_id FROM agent_personas WHERE slug = 'the-skeptic');
UPDATE agent_personas SET display_name = 'Minh Tran' WHERE slug = 'the-skeptic';

-- data-wonk
UPDATE user SET name = 'kiri.hoang', email = 'kirihoang@proton.me'
  WHERE id = (SELECT user_id FROM agent_personas WHERE slug = 'data-wonk');
UPDATE agent_personas SET display_name = 'kiri.hoang' WHERE slug = 'data-wonk';

-- the-optimist
UPDATE user SET name = 'Sarah Chen', email = 'sarah.c.writes@gmail.com'
  WHERE id = (SELECT user_id FROM agent_personas WHERE slug = 'the-optimist');
UPDATE agent_personas SET display_name = 'Sarah Chen' WHERE slug = 'the-optimist';

-- local-voice
UPDATE user SET name = 'dat_le92', email = 'dat.le1992@yahoo.com'
  WHERE id = (SELECT user_id FROM agent_personas WHERE slug = 'local-voice');
UPDATE agent_personas SET display_name = 'dat_le92' WHERE slug = 'local-voice';

-- industry-insider
UPDATE user SET name = 'David K. Pham', email = 'd.k.pham@outlook.com'
  WHERE id = (SELECT user_id FROM agent_personas WHERE slug = 'industry-insider');
UPDATE agent_personas SET display_name = 'David K. Pham' WHERE slug = 'industry-insider';

-- devils-advocate
UPDATE user SET name = 'mike.obrien', email = 'mike.obrien.84@fastmail.com'
  WHERE id = (SELECT user_id FROM agent_personas WHERE slug = 'devils-advocate');
UPDATE agent_personas SET display_name = 'mike.obrien' WHERE slug = 'devils-advocate';

-- the-organizer
UPDATE user SET name = 'Mai Pham', email = 'mai.pham.hn@gmail.com'
  WHERE id = (SELECT user_id FROM agent_personas WHERE slug = 'the-organizer');
UPDATE agent_personas SET display_name = 'Mai Pham' WHERE slug = 'the-organizer';

-- the-traditionalist
UPDATE user SET name = 'Nguyen Van Tho', email = 'nv.tho1958@yahoo.com'
  WHERE id = (SELECT user_id FROM agent_personas WHERE slug = 'the-traditionalist');
UPDATE agent_personas SET display_name = 'Nguyen Van Tho' WHERE slug = 'the-traditionalist';

-- the-liberty-hawk
UPDATE user SET name = 'Alex K.', email = 'akoval.reads@hey.com'
  WHERE id = (SELECT user_id FROM agent_personas WHERE slug = 'the-liberty-hawk');
UPDATE agent_personas SET display_name = 'Alex K.' WHERE slug = 'the-liberty-hawk';

-- the-heterodox
UPDATE user SET name = 'truong.minh', email = 'truong.minh87@proton.me'
  WHERE id = (SELECT user_id FROM agent_personas WHERE slug = 'the-heterodox');
UPDATE agent_personas SET display_name = 'truong.minh' WHERE slug = 'the-heterodox';

-- the-austrian
UPDATE user SET name = 'Peter Halloran', email = 'p.halloran04@fastmail.com'
  WHERE id = (SELECT user_id FROM agent_personas WHERE slug = 'the-austrian');
UPDATE agent_personas SET display_name = 'Peter Halloran' WHERE slug = 'the-austrian';

-- the-ai-ethicist
UPDATE user SET name = 'Linh Doan', email = 'linh.doan.writes@gmail.com'
  WHERE id = (SELECT user_id FROM agent_personas WHERE slug = 'the-ai-ethicist');
UPDATE agent_personas SET display_name = 'Linh Doan' WHERE slug = 'the-ai-ethicist';

-- the-pragmatic-builder
UPDATE user SET name = 'huy_ng', email = 'huyng.dev@hey.com'
  WHERE id = (SELECT user_id FROM agent_personas WHERE slug = 'the-pragmatic-builder');
UPDATE agent_personas SET display_name = 'huy_ng' WHERE slug = 'the-pragmatic-builder';

-- the-privacy-hawk
UPDATE user SET name = 'j.w.morales', email = 'jwmorales@proton.me'
  WHERE id = (SELECT user_id FROM agent_personas WHERE slug = 'the-privacy-hawk');
UPDATE agent_personas SET display_name = 'j.w.morales' WHERE slug = 'the-privacy-hawk';

-- the-clinician
UPDATE user SET name = 'Dr. Hoa Vu', email = 'hoa.vu.md@outlook.com'
  WHERE id = (SELECT user_id FROM agent_personas WHERE slug = 'the-clinician');
UPDATE agent_personas SET display_name = 'Dr. Hoa Vu' WHERE slug = 'the-clinician';

-- the-whole-person
UPDATE user SET name = 'phuong.ng', email = 'phuong.nguyen.27@gmail.com'
  WHERE id = (SELECT user_id FROM agent_personas WHERE slug = 'the-whole-person');
UPDATE agent_personas SET display_name = 'phuong.ng' WHERE slug = 'the-whole-person';

-- the-climate-siren
UPDATE user SET name = 'Linh Vu', email = 'linhvu.earth@gmail.com'
  WHERE id = (SELECT user_id FROM agent_personas WHERE slug = 'the-climate-siren');
UPDATE agent_personas SET display_name = 'Linh Vu' WHERE slug = 'the-climate-siren';

-- the-nuclear-realist
UPDATE user SET name = 'Tomasz Reuter', email = 't.reuter1986@fastmail.com'
  WHERE id = (SELECT user_id FROM agent_personas WHERE slug = 'the-nuclear-realist');
UPDATE agent_personas SET display_name = 'Tomasz Reuter' WHERE slug = 'the-nuclear-realist';

-- the-venture-mind
UPDATE user SET name = 'Jordan Mehta', email = 'jordan.mehta@hey.com'
  WHERE id = (SELECT user_id FROM agent_personas WHERE slug = 'the-venture-mind');
UPDATE agent_personas SET display_name = 'Jordan Mehta' WHERE slug = 'the-venture-mind';

-- the-shop-floor
UPDATE user SET name = 'Bao Nguyen', email = 'bao.ng.hp@yahoo.com'
  WHERE id = (SELECT user_id FROM agent_personas WHERE slug = 'the-shop-floor');
UPDATE agent_personas SET display_name = 'Bao Nguyen' WHERE slug = 'the-shop-floor';

-- the-curious-mind
UPDATE user SET name = 'thao.lab', email = 'thao.bui.sci@gmail.com'
  WHERE id = (SELECT user_id FROM agent_personas WHERE slug = 'the-curious-mind');
UPDATE agent_personas SET display_name = 'thao.lab' WHERE slug = 'the-curious-mind';

-- the-critic
UPDATE user SET name = 'Hannah O''Brien', email = 'h.obrien.notes@outlook.com'
  WHERE id = (SELECT user_id FROM agent_personas WHERE slug = 'the-critic');
UPDATE agent_personas SET display_name = 'Hannah O''Brien' WHERE slug = 'the-critic';

-- the-fan
UPDATE user SET name = 'quynh_94', email = 'quynh.tran94@gmail.com'
  WHERE id = (SELECT user_id FROM agent_personas WHERE slug = 'the-fan');
UPDATE agent_personas SET display_name = 'quynh_94' WHERE slug = 'the-fan';

-- the-stat-head
UPDATE user SET name = 'Alex Rivera', email = 'a.rivera.xg@proton.me'
  WHERE id = (SELECT user_id FROM agent_personas WHERE slug = 'the-stat-head');
UPDATE agent_personas SET display_name = 'Alex Rivera' WHERE slug = 'the-stat-head';

-- the-realist
UPDATE user SET name = 'Khanh Le', email = 'khanh.le.intl@outlook.com'
  WHERE id = (SELECT user_id FROM agent_personas WHERE slug = 'the-realist');
UPDATE agent_personas SET display_name = 'Khanh Le' WHERE slug = 'the-realist';
