-- Infection Control — Daily Ward Round & Surveillance schema.
-- Run this once in a NEW Supabase project's SQL Editor.

create extension if not exists pgcrypto;

-- Shared settings (simple username/password login lives in the users table).
create table if not exists app_config (
  id int primary key default 1,
  departments jsonb not null default '["ICU","NICU","Surgery","OB/GYN"]'::jsonb,
  hh_departments jsonb not null default '["ICU","Medical Ward","Surgical Ward","Emergency","Pediatric","NICU","OPD","OT","Labor & Delivery","Dialysis","Other"]'::jsonb
);
insert into app_config (id) values (1) on conflict (id) do nothing;

-- Real per-person accounts, created by the owner from Settings. Every audit
-- action (created/resolved/deleted) is attributed to the account that did it.
-- Passwords are stored as a SHA-256 hash — nobody, not even the owner, can
-- read a password back; the owner can only reset it to the default (123456).
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  display_name text not null default '',
  role text not null default 'staff', -- 'owner' | 'ic' | 'staff'
  department text,                    -- optional home department for staff users
  active boolean not null default true,
  must_change_password boolean not null default true,
  created_by text,
  created_at timestamptz not null default now()
);
insert into users (username, password_hash, display_name, role, must_change_password)
values ('owner', encode(digest('owner123', 'sha256'), 'hex'), 'Owner', 'owner', true)
on conflict (username) do nothing;

-- One checklist type = one bundle (SSI / CAUTI / VAE / CLABSI), with its list of
-- bundle components and which departments audit against it.
create table if not exists checklist_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_ar text not null,
  name_en text not null,
  items jsonb not null default '[]'::jsonb,        -- ["component 1", "component 2", ...]
  departments jsonb not null default '[]'::jsonb,   -- ["ICU","NICU",...] which wards use it
  fields jsonb not null default '["patient_name","mrn","age","diagnosis"]'::jsonb, -- which patient fields the entry form shows
  baseline text not null default '',                -- free-text reference field, reserved for future use
  active boolean not null default true,
  sort_order int not null default 0
);

-- One row = one patient audited on one date against one checklist.
create table if not exists ward_round_audits (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  department text not null,
  checklist_type_id uuid references checklist_types(id),
  checklist_code text not null,
  checklist_name_ar text not null default '',
  patient_name text not null default '',
  mrn text not null default '',
  age text not null default '',
  diagnosis text not null default '',
  items jsonb not null default '[]'::jsonb,   -- [{"item":"...", "status":"MET|NOT MET|NA"}]
  met_count int not null default 0,
  applicable_count int not null default 0,
  not_met_count int not null default 0,
  compliance_pct numeric,
  comments text not null default '',
  action_status text not null default 'none',  -- none | open | resolved
  done_by text not null default '',
  resolved_by text,
  resolved_at timestamptz,
  deleted boolean not null default false,
  deleted_by text,
  deleted_at timestamptz,
  edited_by text,
  edited_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  entity text not null,
  description text not null,
  performed_by text not null,
  created_at timestamptz not null default now()
);

-- Hand Hygiene daily monitoring — a separate module from the Ward Round
-- audits above. One row = one observation of one observer's hand-hygiene
-- moments on one date/department (WHO 5-moments + glove use).
create table if not exists hh_observations (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  department text not null,
  observer text not null default '',
  before_touching_patient smallint,   -- 1 = compliant, 0 = missed, null = not applicable
  before_clean_procedure smallint,
  after_body_fluid_risk smallint,
  after_touching_patient smallint,
  after_touching_surroundings smallint,
  wearing_glove smallint,
  missed smallint,                    -- opportunity occurred but no category above applies
  hand_wash smallint,
  hand_rub smallint,
  total_opportunities int not null default 0,
  compliant int not null default 0,
  compliance_pct numeric,
  done_by text not null default '',
  deleted boolean not null default false,
  deleted_by text,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

alter table app_config enable row level security;
alter table users enable row level security;
alter table checklist_types enable row level security;
alter table ward_round_audits enable row level security;
alter table audit_log enable row level security;
alter table hh_observations enable row level security;

create policy "allow all app_config" on app_config for all using (true) with check (true);
create policy "allow all users" on users for all using (true) with check (true);
create policy "allow all checklist_types" on checklist_types for all using (true) with check (true);
create policy "allow all ward_round_audits" on ward_round_audits for all using (true) with check (true);
create policy "allow all audit_log" on audit_log for all using (true) with check (true);
create policy "allow all hh_observations" on hh_observations for all using (true) with check (true);

-- Seed the six checklist types from the hospital's paper/Excel Daily Ward Round
-- form. NOTE: a few bundle-component texts were cut off in the source file
-- (the sheet itself truncates around 60 characters) — finish the exact
-- official wording for those from Settings → checklist items before go-live.
insert into checklist_types (code, name_ar, name_en, items, departments, sort_order) values
('SSI', 'Surgical Site Infection (SSI)', 'Surgical Site Infection', '[
  "1. Antibiotic(s) was (were) given within one (1) hour before incision",
  "2. Prophylactic antibiotic(s) is (are) consistent with our guidelines",
  "3. Discontinuation of prophylactic antibiotic(s) within 24 hours",
  "4. Appropriate hair removal — Was hair at the incisional site removed appropriately",
  "5. Maintenance of pre/postoperative glucose control — Serum glucose target met",
  "6. Maintenance of pre/postoperative normothermia (for applicable procedures)",
  "7. Use appropriate antiseptic solution"
]'::jsonb, '["Surgery","OB/GYN"]'::jsonb, 1),

('CAUTI', 'Catheter-Associated UTI (CAUTI)', 'Catheter-Associated UTI', '[
  "1. Avoid unnecessary urinary catheters",
  "2. Insert using aseptic technique",
  "3. Hand hygiene before insertion of urinary catheter",
  "4. Use sterile equipment (gloves, drape, sponges, sterile solution)",
  "5. Use of smallest catheter size as possible",
  "6. Maintain catheters based on recommended guidelines",
  "7. Maintain a sterile, continuously closed drainage system",
  "8. Keep catheter properly secured to prevent movement",
  "9. Keep collection bag below the level of the bladder at all times",
  "10. Maintain unobstructed urine flow",
  "11. Empty collection bag regularly",
  "12. Routine hygiene (cleansing of the meatal surface)",
  "13. Collection of urine samples should follow aseptic technique",
  "14. Review urinary catheter necessity daily and remove promptly when no longer indicated"
]'::jsonb, '["ICU","Surgery","OB/GYN"]'::jsonb, 2),

('VAE_ICU', 'Ventilator-Associated Event — ICU (VAE)', 'Ventilator-Associated Event — ICU', '[
  "1. Elevation of the head of the bed to between 30 and 45 degrees",
  "2. Daily sedative interruption & daily assessment of readiness to extubate",
  "3. Peptic ulcer disease (PUD) prophylaxis",
  "4. Deep venous thrombosis (DVT) prophylaxis (unless contraindicated)",
  "5. Daily oral care with appropriate antiseptic solution"
]'::jsonb, '["ICU"]'::jsonb, 3),

('VAE_NICU', 'Ventilator-Associated Event — NICU (VAE)', 'Ventilator-Associated Event — NICU', '[
  "1. Hand hygiene",
  "2. Semi-recumbent position",
  "3. Mouth rinse with an appropriate solution",
  "4. Appropriate ventilator circuit care",
  "5. Daily assessment of readiness to extubate"
]'::jsonb, '["NICU"]'::jsonb, 4),

('CLABSI_ICU', 'Central Line-Associated Bloodstream Infection — ICU (CLABSI)', 'Central Line-Associated Bloodstream Infection — ICU', '[
  "1. Hand hygiene",
  "2. Maximal barrier precautions",
  "3. Cap",
  "4. Mask",
  "5. Sterile gloves",
  "6. Sterile gown",
  "7. Large sterile drape",
  "8. 2% chlorhexidine in alcohol for adults, pediatrics & neonates ≥2 months",
  "9. 2% aqueous chlorhexidine for neonates <2 weeks or <1500 g",
  "10. Subclavian vein for adults, femoral for pediatrics, and appropriate site for neonates",
  "11. Insertion compliance: compliant for the above (insertion bundle)",
  "12. Hand hygiene (maintenance)",
  "13. Daily assessment of catheter necessity with prompt removal",
  "14. Proper dressing choice (transparent semipermeable dressing)",
  "15. Proper frequency of dressing change",
  "16. Proper replacement of administration sets"
]'::jsonb, '["ICU"]'::jsonb, 5),

('CLABSI_NICU', 'Central Line-Associated Bloodstream Infection — NICU (CLABSI)', 'Central Line-Associated Bloodstream Infection — NICU', '[
  "1. Hand hygiene",
  "2. Maximal barrier precautions",
  "3. Cap",
  "4. Mask",
  "5. Sterile gloves",
  "6. Sterile gown",
  "7. Large sterile drape",
  "8. 2% chlorhexidine in alcohol for adults, pediatrics & neonates ≥2 months",
  "9. 2% aqueous chlorhexidine for neonates <2 weeks or <1500 g",
  "10. Subclavian vein for adults, femoral for pediatrics, and appropriate site for neonates",
  "11. Insertion compliance: compliant for the above (insertion bundle)",
  "12. Hand hygiene (maintenance)",
  "13. Daily assessment of catheter necessity with prompt removal",
  "14. Proper dressing choice (transparent semipermeable dressing)",
  "15. Proper frequency of dressing change",
  "16. Proper replacement of administration sets"
]'::jsonb, '["NICU"]'::jsonb, 6)
on conflict (code) do nothing;
