-- Run this in your Supabase project's SQL Editor.
insert into knowledge_base (category, title, content_type, content, description) values

('SOP', 'Blood/Body Fluid Spill — Clean-Up Procedure', 'text',
'1. Put on gloves (and a gown/goggles if there is a risk of splashing).
2. If there is broken glass, pick it up with tongs or a dustpan/brush — never with your hands — and put it straight into a sharps container.
3. Use paper towels to soak up as much of the fluid as possible.
4. Wipe the area with water and detergent until visibly clean.
5. Disinfect: cover the area with a fresh sodium hypochlorite (bleach) solution, about 0.5% (1 part household bleach to 9 parts water), and leave it for several minutes.
6. Wipe the disinfectant off, dispose of all materials as biohazard waste, remove PPE, and wash your hands.
7. Record the incident — note if a specimen was lost or if anyone was exposed to the blood/fluid.

Keep a dedicated spill kit stocked and ready: gloves, disinfectant, absorbent paper towels, a scoop/tongs, and biohazard bags.',
'Adapted from WHO Guidelines on Drawing Blood (Best Practices in Phlebotomy), Annex H.'),

('SOP', 'Isolation Precautions — Contact / Droplet / Airborne', 'text',
'Standard precautions apply to every patient, every time: hand hygiene, gloves for contact with blood/body fluids, and a mask/eye protection if splashing is possible.

Contact precautions (e.g. MRSA, C. difficile, some GI infections):
- Gown and gloves for any contact with the patient or their surroundings.
- Dedicated or single-use equipment where possible.

Droplet precautions (e.g. influenza, pertussis, some meningitis):
- Surgical mask when within about 1-2 meters of the patient.
- Patient should wear a mask if being moved/transported.

Airborne precautions (e.g. TB, measles, chickenpox):
- N95 (or higher) fit-tested respirator before entering the room.
- Patient ideally in a negative-pressure room with the door kept closed.

Always remove PPE in the correct order before leaving the area, and clean your hands immediately after.',
'General reference — always follow your hospital''s specific isolation policy and signage.'),

('SOP', 'Sharps — Safe Handling and Disposal', 'text',
'- Never recap a used needle.
- Never pass a sharp hand-to-hand — use a neutral zone (a tray) if handing one to a colleague.
- Dispose of the whole device (needle + syringe) directly into a sharps container immediately after use — do not set it down first.
- Sharps containers must be puncture-resistant, labeled, and closed — never overfilled (stop and replace at the fill line, usually about 3/4 full).
- If a sharps container is full, seal it and request a replacement — do not force more items in.
- If you find a sharp lying somewhere it shouldn''t be, do not pick it up bare-handed — use tongs or a dustpan and dispose of it in a sharps container.',
'Based on OSHA Bloodborne Pathogens Standard and CDC guidance.'),

('SOP', 'WHO — Your 5 Moments for Hand Hygiene (poster)', 'link',
 'https://cdn.who.int/media/docs/default-source/integrated-health-services-(ihs)/infection-prevention-and-control/your-5-moments-for-hand-hygiene-poster.pdf',
 'The official WHO framework for exactly when to clean your hands around a patient: before touching a patient, before a clean/aseptic task, after exposure risk, after touching a patient, and after touching their surroundings.');
