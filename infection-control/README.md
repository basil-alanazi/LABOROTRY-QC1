# Infection Control — Setup Guide

A completely separate site from QC Tracker and the games site — new accounts for everything.

Daily Ward Round system for the Infection Control department: audits department compliance
(ICU, NICU, Surgery, OB/GYN) against standard prevention bundles — SSI, CAUTI, VAE, CLABSI —
following the same logic as the paper/Excel ward round form (one patient + one date + one
checklist = one row, with MET/NOT MET/compliance% computed automatically).

## 1) Supabase (new project)
1. supabase.com/dashboard/new → new project with a distinct name (e.g. `infection-control`)
2. Wait until it's Healthy
3. SQL Editor → New query → open `supabase_schema.sql` → copy all and paste it → Run
   (this automatically seeds the four Ward Round departments, the six checklists — SSI, CAUTI, VAE ICU/NICU, CLABSI ICU/NICU —
   the separate Hand Hygiene department list + `hh_observations` table, and a public `hh-attachments`
   storage bucket for photos/files attached to a Hand Hygiene observation)
4. Project Settings → Data API → copy the API URL
5. Project Settings → API Keys → copy the Publishable key

## 2) GitHub (new repo, or inside the same repo)
Upload the contents of the `infection-control/` folder (including `public` if present).

## 3) Vercel (new project)
1. vercel.com → Add New → Project → import the repo (Root Directory = `infection-control`)
2. Environment Variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (optional — `supabaseClient.js`
   already defaults to the project's live Supabase instance, so you can skip this and deploy as-is)
3. Deploy

Once the Vercel project is linked to this GitHub repo, every push to `main` redeploys it
automatically at the same stable URL — no manual redeploy step needed.

## 4) Default account (change the password immediately from Settings)
- **Owner**: `owner` / `owner123`

Every other person gets their own account — the owner creates it from **Settings → User Accounts**
(username, display name, role, optional home department). New accounts always start with the
password **123456** and are required to set their own password the moment they first log in.
Passwords are stored hashed — nobody, including the owner, can see anyone's password; the owner
can only **reset** an account back to 123456 (e.g. if someone forgets theirs), which forces a
change again on their next login. Roles:
- **Owner** — everything, including creating/editing/deleting user accounts
- **Infection Control** — full access: Daily Ward Round, Records, Dashboard, Settings (checklists/departments), but not user accounts
- **Ward Staff** — self-service Stock Requests for their own department (see item 8 below). Can instead be marked **"Employee Health access only"** (Settings → User Accounts) for an account that should only ever see the Employee Health page — e.g. a doctor's account — in place of the usual stock-only view

Because each person logs in with their own account, every entry, resolved action, and deletion
is attributed to the real person who did it — visible in Records and in the exported reports.

## 5) How it works
1. Daily Checklists and Records are for the Infection Control team (Infection Control + Owner roles) only. Ward Staff accounts only see their own Profile for now.
2. **"Daily Checklists"** has two tabs, same page/link:
   - **Ward Round**: pick a department then a checklist type (only checklists linked to that department show up), fill in patient details, mark each bundle item MET / NOT MET / N/A, and optionally attach a photo or file. Saving jumps focus straight back to Patient Name so the next patient can be entered right away.
   - **Hand Hygiene**: pick a date/time range and department for the round, then fill in whichever roles you observed during that single visit — Doctor, Nurse, Housekeeping, Lab, Radiology — each with its own 6 hand-hygiene moments (WHO 5 moments + wearing glove) Done / Missed / N/A, plus optional Missed-opportunity/Hand-wash/Hand-rub flags. One "Save Round" saves every role you filled in together, plus one optional photo/file attachment for the round. Saving resets and jumps focus back to Department so the next round can start right away. This is a separate module — its own department list and its own data — from Ward Round.
3. The system computes MET / Applicable / NOT MET / Compliance% (Ward Round) or Total Opportunities / Compliant / Compliance% (Hand Hygiene) automatically on save
4. **"Records"** has the same two tabs: past Ward Round audits (filterable by department/checklist/date, with the ability to resolve any "Action Needed" item) and past Hand Hygiene observations (filterable by department/date) — export either list to Excel or PDF
5. **"Dashboard"** has the same two tabs: Ward Round's compliance summary by checklist and by department (calendar month or custom date range), and Hand Hygiene's monthly compliance by department plus monthly summary by moment category (against an 80% target, matching the hospital's Monthly Dashboard / HH Category Summary sheets) — export either view to Excel or PDF
6. **"Settings"**: add/remove departments (separate lists for Ward Round and Hand Hygiene), manage the Hand Hygiene observer role list and which roles show per department, edit each checklist's items/department links/baseline note, create new checklists, and manage user accounts (owner only)
7. **"Profile"** (everyone): view your own account details and change your own password any time
8. **"Stock Requests"** (everyone): self-service — every department/unit keeps its own item catalog with its own Min/Max/Current stock levels, pick an item and quantity and it's taken from that department's own stock immediately, no approval step; Owner/IC see usage from every department (with multi-department Excel/PDF export and a "Void" action to undo a mistaken entry), while Ward Staff accounts only see their own assigned department's items and usage — no access to any other page. A Ward Staff account can additionally be marked **"Department stock in-charge"** (Settings → User Accounts) so, on top of using stock, they can add new items or remove items from their own department's catalog directly — without needing an Owner/IC account or access to Settings
9. **"Employee Health"** (Owner/IC only — a "Employee Health access only" doctor account gets the same views but read-only, no edits): mirrors the clinic's real Employee Clinic tracking sheet as one live, editable grid — same shape as the sheet, one row per employee. The **Employee Clinic** tab has a "Regular Staff" and a "Kitchen Staff" grid (switch with the sub-tabs); every cell saves automatically as you edit it. Columns: roster (employee #/file #/iqama #/DOB/phone/department), investigation status (doctor review due / sample not yet given / review done, covering the standard serology panel), PPD status with test date and auto-calculated next-due date, a Stool & Urine Test for Kitchen Staff (auto next-due +6 months), ICN remarks, then one grouped column-set per vaccine (Hep B, MMR, Varicella, Tetanus, Influenza, plus Meningococcal/Typhoid/Hepatitis A for Kitchen Staff) — tick "Req?" for whichever vaccine the doctor requested, then fill in each dose's date and batch number directly in its cell; the next dose's due date is calculated automatically from the 1st dose date (e.g. Hep B: 0 / +1 month / +6 months). An "Overdue & Missing" view rolls all of this up (PPD, stool/urine, and every partially-completed vaccine series) across every employee, and Excel/PDF export produces the same grid (a Regular Staff sheet and a Kitchen Staff sheet, plus a flat per-dose vaccination log)
10. **"Suspected/Confirmed Cases"** (Owner/IC only): log patients suspected or confirmed to have a communicable disease (disease picked from a configurable list, or "Other"), the date it was reported to the health authority, and up to two supporting attachments — a case is flagged "Attachment Missing" until both are on file, unless the second is marked not required for that case; export to Excel/PDF
11. **"Messages"** (everyone): a simple one-on-one chat between any two accounts — pick anyone from "New" to start a conversation, or reopen an existing one from the list. Messages arrive live (no refresh needed) and an unread-count badge shows on the "Messages" link in the sidebar
12. **"Daily IC Rounds"** (Owner/IC only): a quick daily MET / NOT MET check per department/unit (its own department list, separate from Ward Round's) — much simpler than the detailed per-patient Ward Round bundles. A NOT MET round captures a Finding/Observation, an optional attachment, a Corrective Action, and a Date of Discussion, then tracks it as Open until marked Closed; filter the list by NOT MET/Open/Closed and export to Excel/PDF

## Important note on checklist items
Some bundle-item texts in the original Excel file were cut off (the sheet truncates around
60 characters). The six checklists were seeded with the standard, widely recognized wording for
these bundles, but **review them from Settings → Checklists and confirm the exact official
wording** (especially any reference to an internal policy or protocol) before relying on them
for official documentation.
