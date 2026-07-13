-- Run this in your Supabase project's SQL Editor.
-- Populates Knowledge Base with a parasite identification guide and core
-- infection-control protocols. Links point to CDC's DPDx site — the
-- official U.S. reference used worldwide for stool parasite identification,
-- so the actual comparison photos/images come straight from the authoritative
-- source instead of us hosting copies.

insert into knowledge_base (category, title, content_type, content, description) values

-- The star item: CDC's own side-by-side morphology comparison chart.
('Troubleshooting', 'Stool Parasites — Morphologic Comparison Chart (CDC)', 'link',
 'https://www.cdc.gov/dpdx/diagnosticprocedures/stool/morphcomp.html',
 'Official CDC chart comparing the size, shape, and features of common intestinal parasites side by side — the main reference for identification under the microscope.'),

-- Most common individual parasites seen in stool exams, each linking to its CDC ID page (images + life cycle + key features).
('Troubleshooting', 'Giardia duodenalis (Giardiasis)', 'link', 'https://www.cdc.gov/dpdx/giardiasis/index.html', 'Trophozoite and cyst identification, size, and key features.'),
('Troubleshooting', 'Entamoeba histolytica (Amebiasis)', 'link', 'https://www.cdc.gov/dpdx/amebiasis/index.html', 'Distinguishing E. histolytica from non-pathogenic look-alikes.'),
('Troubleshooting', 'Ascaris lumbricoides (Ascariasis)', 'link', 'https://www.cdc.gov/dpdx/ascariasis/index.html', 'Egg identification — fertilized vs. unfertilized.'),
('Troubleshooting', 'Trichuris trichiura (Whipworm)', 'link', 'https://www.cdc.gov/dpdx/trichuriasis/index.html', 'Classic barrel-shaped egg with polar plugs.'),
('Troubleshooting', 'Hookworm (Ancylostoma / Necator)', 'link', 'https://www.cdc.gov/dpdx/hookworm/index.html', 'Egg identification and species differences.'),
('Troubleshooting', 'Cryptosporidium', 'link', 'https://www.cdc.gov/dpdx/cryptosporidiosis/index.html', 'Oocyst identification — usually needs a modified acid-fast stain.'),
('Troubleshooting', 'Hymenolepis nana (Dwarf Tapeworm)', 'link', 'https://www.cdc.gov/dpdx/hymenolepiasis/index.html', 'Egg features and how it differs from H. diminuta.'),
('Troubleshooting', 'Enterobius vermicularis (Pinworm)', 'link', 'https://www.cdc.gov/dpdx/enterobiasis/index.html', 'Usually diagnosed by tape test, not routine stool exam.'),
('Troubleshooting', 'Blastocystis hominis', 'link', 'https://www.cdc.gov/dpdx/blastocystis/index.html', 'Highly variable appearance — a common source of confusion.'),
('Troubleshooting', 'Taenia species (Tapeworm)', 'link', 'https://www.cdc.gov/dpdx/taeniasis/index.html', 'Egg identification; species differentiation needs proglottid exam.'),

-- Infection control basics, written as quick in-app reference (source: CDC hand hygiene & PPE guidance).
('SOP', 'Hand Hygiene — When and How', 'text',
'When to clean your hands:
- Before and after touching a patient or specimen
- Before an aseptic task (e.g. handling a sample, inserting a device)
- After contact with blood or body fluids
- After removing gloves
- Before eating, after using the restroom

How:
- Alcohol-based hand rub is the default choice unless hands are visibly soiled — rub all surfaces until dry.
- If hands are visibly dirty, wash with soap and water for at least 20 seconds, covering all surfaces, then dry with a disposable towel and use it to turn off the tap.
- Gloves reduce risk but do not replace hand hygiene — always clean hands after removing them.',
'Quick reference — full detail at cdc.gov/clean-hands.'),

('SOP', 'PPE — Correct Order to Put On and Take Off', 'text',
'Putting on (donning), in this order:
1. Gown
2. Mask / respirator
3. Goggles or face shield
4. Gloves (pulled over the gown cuffs)

Taking off (doffing) — assume the outside of everything is contaminated, in this order:
1. Gloves (remove first — most contaminated item)
2. Goggles / face shield
3. Gown
4. Mask (removed last, since it protects your airway the longest)

Clean your hands immediately after removing gloves, and again after removing all PPE. Never touch your face while wearing PPE.',
'Quick reference — full detail at cdc.gov.'),

('Troubleshooting', 'Needlestick / Sharps Injury — Immediate Steps', 'text',
'1. Do not panic, and do not suck or squeeze the wound aggressively.
2. Wash the site immediately with soap and water for at least 15 minutes (do not use bleach or harsh antiseptics).
3. If splashed in the eyes, nose, or mouth — flush with clean water or saline for 15 minutes.
4. Tell your supervisor immediately — do not wait until end of shift.
5. Report it and fill out an incident report right away (use the Incident Report page in this system).
6. Go to occupational health / the ER as soon as possible — post-exposure treatment works best within hours, so do not delay.
7. Note the source patient if known — this affects what treatment you may need.',
'Follow your hospital''s official exposure protocol — this is a quick-reference summary, not a replacement for it.');
