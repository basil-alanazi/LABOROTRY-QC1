-- Run this in your Supabase project's SQL Editor.
-- Requires ADD_KB_PARASITOLOGY_AND_SAFETY.sql and ADD_KB_PARASITE_PHOTOS_V2.sql
-- to have been run first.

insert into knowledge_base (category, title, content_type, content, description) values

('Parasitology', 'Trichuris trichiura (Whipworm) — Photos', 'gallery',
'[
  {"url":"https://www.cdc.gov/dpdx/trichuriasis/images/1/Trichuris_trichiura_egg1.jpg","caption":"Egg — iodine-stained wet mount"},
  {"url":"https://www.cdc.gov/dpdx/trichuriasis/images/1/Trichuris_trichiura_egg2.jpg","caption":"Egg — unstained wet mount"},
  {"url":"https://www.cdc.gov/dpdx/trichuriasis/images/1/Trichuris_trichiura_egg3.jpg","caption":"Egg — unstained wet mount"},
  {"url":"https://www.cdc.gov/dpdx/trichuriasis/images/1/Trichuris_trichiura_egg4.jpg","caption":"Eggs showing size variability in the species"},
  {"url":"https://www.cdc.gov/dpdx/trichuriasis/images/2/Trichuris_trichiura_egg_atypical1.jpg","caption":"Atypical egg — for comparison"}
]',
'Barrel-shaped, thick-shelled egg, 50-55 x 20-25 µm, with a pair of polar plugs at each end. Unembryonated when passed. Source: CDC DPDx.'),

('Parasitology', 'Hookworm (Ancylostoma / Necator) — Photos', 'gallery',
'[
  {"url":"https://www.cdc.gov/dpdx/hookworm/images/1/Hookworm_egg_wtmt.jpg","caption":"Egg — unstained wet mount, 400x"},
  {"url":"https://www.cdc.gov/dpdx/hookworm/images/1/Hookworm_egg_BAM1.jpg","caption":"Egg — unstained wet mount, 400x"},
  {"url":"https://www.cdc.gov/dpdx/hookworm/images/1/Hookworm_egg_BAM_MCS.jpg","caption":"Egg — unstained wet mount"},
  {"url":"https://www.cdc.gov/dpdx/hookworm/images/2/Hookworm_rhabditiform.jpg","caption":"Rhabditiform (L1) larva"},
  {"url":"https://www.cdc.gov/dpdx/hookworm/images/3/Hookworm_filariform_A.jpg","caption":"Filariform (L3) larva — infective stage"}
]',
'Thin-shelled, colorless egg, 60-75 x 35-40 µm. Ancylostoma and Necator eggs cannot be told apart microscopically. Source: CDC DPDx.'),

('Parasitology', 'Cryptosporidium — Photos', 'gallery',
'[
  {"url":"https://www.cdc.gov/dpdx/cryptosporidiosis/images/1/Crypto_wtmt_annot.jpg","caption":"Oocysts in wet mount (pink arrows) — a budding yeast is also visible"},
  {"url":"https://www.cdc.gov/dpdx/cryptosporidiosis/images/3/Crypto_oocyst4.jpg","caption":"Modified acid-fast stain — oocysts appear bright red against blue-green background"},
  {"url":"https://www.cdc.gov/dpdx/cryptosporidiosis/images/3/Crypto_acidfast_web.jpg","caption":"Modified acid-fast stain"},
  {"url":"https://www.cdc.gov/dpdx/cryptosporidiosis/images/7/DPDxCrypto_oo_Aura.jpg","caption":"Auramine-rhodamine fluorescent stain"}
]',
'Rounded oocysts, only 4.2-5.4 µm — very small. Needs modified acid-fast or immunofluorescent staining; easy to miss on routine wet mount. Source: CDC DPDx.'),

('Parasitology', 'Enterobius vermicularis (Pinworm) — Photos', 'gallery',
'[
  {"url":"https://www.cdc.gov/dpdx/enterobiasis/images/1/Enterobius_cellulosetape.jpg","caption":"Eggs on cellulose (Scotch) tape prep — the standard collection method"},
  {"url":"https://www.cdc.gov/dpdx/enterobiasis/images/1/Evermicularis_egg_HBa.jpg","caption":"Eggs in wet mount"},
  {"url":"https://www.cdc.gov/dpdx/enterobiasis/images/1/Evermicularis_egg_wtmt.jpg","caption":"Egg — iodine-stained wet mount"},
  {"url":"https://www.cdc.gov/dpdx/enterobiasis/images/2/Ent_f.jpg","caption":"Adult female surrounded by eggs"}
]',
'Flattened-on-one-side egg, 50-60 x 20-30 µm. Not usually found in routine stool O&P — diagnosed by perianal tape test instead. Source: CDC DPDx.');


delete from knowledge_base where title in (
  'Hand Hygiene — When and How',
  'PPE — Correct Order to Put On and Take Off'
);

insert into knowledge_base (category, title, content_type, content, description) values

('SOP', 'Hand Hygiene — When and How', 'text',
'When to clean your hands:
- Before and after touching a patient or specimen
- Before an aseptic task (e.g. handling a sample, inserting a device)
- After contact with blood or body fluids
- After removing gloves
- Before eating, after using the restroom

How (5 steps): Wet -> Soap -> Scrub 20 seconds (all surfaces, between fingers, under nails) -> Rinse -> Dry with a clean towel, then use it to turn off the tap.

If hands are not visibly soiled, an alcohol-based hand rub is the default choice - apply and rub all surfaces until dry.

Official illustrated posters (CDC and WHO) are attached below as links - print and post them near sinks.',
'Steps summarized from CDC; official posters linked below.'),

('SOP', 'CDC — Wash Your Hands Poster (official PDF)', 'link',
'https://www.cdc.gov/handwashing/pdf/wash-your-hands-poster-english2020-p.pdf',
'Official illustrated CDC poster: Wet, Soap, Scrub 20 sec, Rinse, Dry. Good for printing and posting near sinks.'),

('SOP', 'WHO — How to Handrub (alcohol-based) Poster', 'link',
'https://www.who.int/docs/default-source/patient-safety/how-to-handrub-poster.pdf',
'Official WHO illustrated poster for alcohol-based hand rub technique, step by step.'),

('SOP', 'WHO — How to Handwash Poster', 'link',
'https://www.who.int/docs/default-source/patient-safety/how-to-handwash-poster.pdf',
'Official WHO illustrated poster for soap-and-water handwashing technique, step by step.'),

('SOP', 'PPE — Correct Order to Put On and Take Off', 'text',
'Putting on (donning), in this order:
1. Gown
2. Mask / respirator
3. Goggles or face shield
4. Gloves (pulled over the gown cuffs)

Taking off (doffing) - assume the outside of everything is contaminated, in this order:
1. Gloves (remove first - most contaminated item)
2. Goggles / face shield
3. Gown
4. Mask (removed last, since it protects your airway the longest)

Clean your hands immediately after removing gloves, and again after removing all PPE. Never touch your face while wearing PPE.',
'Quick reference - order matters for avoiding self-contamination.');
