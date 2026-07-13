-- Run this in your Supabase project's SQL Editor.
-- Only run this if you already ran ADD_KB_PARASITOLOGY_AND_SAFETY.sql —
-- this REPLACES the 3 link-only entries below with real inline photo
-- galleries (actual images, not just a link to click). Images are hosted
-- by CDC (a U.S. federal agency — this content is public domain).

delete from knowledge_base where title in (
  'Giardia duodenalis (Giardiasis)',
  'Entamoeba histolytica (Amebiasis)',
  'Ascaris lumbricoides (Ascariasis)'
);

insert into knowledge_base (category, title, content_type, content, description) values

('Parasitology', 'Giardia duodenalis (Giardiasis) — Photos', 'gallery',
'[
  {"url":"https://www.cdc.gov/dpdx/giardiasis/images/1/Giardia_cyst_wtmt.jpg","caption":"Cyst — wet mount, iodine stain"},
  {"url":"https://www.cdc.gov/dpdx/giardiasis/images/2/Giardia_cyst_dic.jpg","caption":"Cyst — DIC microscopy, 1000x"},
  {"url":"https://www.cdc.gov/dpdx/giardiasis/images/3/Giardia_cyst_tric.jpg","caption":"Cyst — trichrome stain"},
  {"url":"https://www.cdc.gov/dpdx/giardiasis/images/4/Giardia_troph_wtmt.jpg","caption":"Trophozoite — wet mount, iodine"},
  {"url":"https://www.cdc.gov/dpdx/giardiasis/images/5/Giardia_troph_tric.jpg","caption":"Trophozoite — trichrome stain"}
]',
'Cysts: oval, 8-19 µm, 4 nuclei when mature. Trophozoites: pear-shaped, 10-20 µm, 2 nuclei, sucking disk. Source: CDC DPDx.'),

('Parasitology', 'Entamoeba histolytica (Amebiasis) — Photos', 'gallery',
'[
  {"url":"https://www.cdc.gov/dpdx/amebiasis/images/1/E_histodispar_2x2_A.jpg","caption":"Cyst — unstained wet mount, chromatoid bodies visible"},
  {"url":"https://www.cdc.gov/dpdx/amebiasis/images/1/Ehistdisp_cyst_wtmt.jpg","caption":"Cyst — iodine stain"},
  {"url":"https://www.cdc.gov/dpdx/amebiasis/images/2/Ehistdisp_cyst_tric.jpg","caption":"Cyst — trichrome stain"},
  {"url":"https://www.cdc.gov/dpdx/amebiasis/images/4/Ehistdisp_troph_wtmt.jpg","caption":"Trophozoite — wet mount, iodine"},
  {"url":"https://www.cdc.gov/dpdx/amebiasis/images/6/Ehisto_troph_tric3.jpg","caption":"Trophozoite with ingested red blood cells (key E. histolytica sign)"}
]',
'Cysts: 12-15 µm, 4 nuclei, blunt-ended chromatoid bodies. Trophozoites: 15-20 µm, ingested RBCs point to E. histolytica specifically. Source: CDC DPDx.'),

('Parasitology', 'Ascaris lumbricoides (Ascariasis) — Photos', 'gallery',
'[
  {"url":"https://www.cdc.gov/dpdx/ascariasis/images/1/Ascaris_egg_unfert.jpg","caption":"Unfertilized egg — elongated, thinner shell"},
  {"url":"https://www.cdc.gov/dpdx/ascariasis/images/1/Ascaris_egg_unfert2_200x.jpg","caption":"Unfertilized egg, 200x"},
  {"url":"https://www.cdc.gov/dpdx/ascariasis/images/2/Ascaris_egg_fert_embryo.jpg","caption":"Fertilized egg — round, thick mammillated shell"},
  {"url":"https://www.cdc.gov/dpdx/ascariasis/images/2/Ascaris_egg_fert5_embryo_200x.jpg","caption":"Fertilized egg with visible larva, 200x"},
  {"url":"https://www.cdc.gov/dpdx/ascariasis/images/3/Ascaris_egg_fert_decort_200x.jpg","caption":"Decorticated (shell layer missing) fertile egg, 200x"}
]',
'Fertile eggs: 45-75 µm, round, thick mammillated (bumpy) shell, often bile-stained brown. Unfertile eggs: up to 90 µm, more elongated, thinner shell. Source: CDC DPDx.');
