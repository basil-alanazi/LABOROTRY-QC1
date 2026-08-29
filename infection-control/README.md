# Infection Control — Setup Guide

A completely separate site from QC Tracker and the games site — new accounts for everything.

Infection Control site for the hospital's IC team: daily Hand Hygiene observations, Daily IC
Rounds, Employee Health (vaccinations/screenings), Suspected/Confirmed Cases, renewal Trackers
(Baladiya license, policy, culture, agreements), Stock Requests, and internal Messages — each its
own module, described below.

## 1) Supabase (new project)
1. supabase.com/dashboard/new → new project with a distinct name (e.g. `infection-control`)
2. Wait until it's Healthy
3. SQL Editor → New query → open `supabase_schema.sql` → copy all and paste it → Run
   (this seeds the Hand Hygiene department list + `hh_observations` table with a public
   `hh-attachments` storage bucket, plus every other module's tables/config)
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
- **Infection Control** — full access: Hand Hygiene, Records, Dashboard, Daily IC Rounds, Employee Health, Trackers, Suspected/Confirmed Cases, Settings, but not user accounts
- **Ward Staff** — self-service Stock Requests for their own department (see item 7 below). Can instead be marked **"Employee Health access only"** (Settings → User Accounts) for an account that should only ever see the Employee Health page — e.g. a doctor's account — in place of the usual stock-only view

Because each person logs in with their own account, every entry, resolved action, and deletion
is attributed to the real person who did it — visible in Records and in the exported reports.

## 5) How it works
1. Hand Hygiene, Records, and Dashboard are for the Infection Control team (Infection Control + Owner roles) only. Ward Staff accounts only see their own Profile for now.
2. **Hand Hygiene entry** (the site's home page): pick a date/time range and department for the round, then fill in whichever roles you observed during that single visit — Doctor, Nurse, Housekeeping, Lab, Radiology — each with its own 6 hand-hygiene moments (WHO 5 moments + wearing glove) Done / Missed / N/A, plus optional Missed-opportunity/Hand-wash/Hand-rub flags. One "Save Round" saves every role you filled in together, plus one optional photo/file attachment for the round. Saving resets and jumps focus back to Department so the next round can start right away.
3. The system computes Total Opportunities / Compliant / Compliance% automatically on save
4. **"Records"**: past Hand Hygiene observations, filterable by department/date — export to Excel or PDF
5. **"Dashboard"**: Hand Hygiene's monthly compliance by department plus monthly summary by moment category (against an 80% target, matching the hospital's Monthly Dashboard / HH Category Summary sheets) — export to Excel or PDF
6. **"Settings"**: add/remove Hand Hygiene departments, manage the observer role list and which roles show per department, manage every other module's own department/item lists, and manage user accounts (owner only)
7. **"Profile"** (everyone): view your own account details and change your own password any time
8. **"Stock Requests"** (everyone): self-service — every department/unit keeps its own item catalog with its own Min/Max/Current stock levels, pick an item and quantity and it's taken from that department's own stock immediately, no approval step; Owner/IC see usage from every department (with multi-department Excel/PDF export and a "Void" action to undo a mistaken entry), while Ward Staff accounts only see their own assigned department's items and usage — no access to any other page. A Ward Staff account can additionally be marked **"Department stock in-charge"** (Settings → User Accounts) so, on top of using stock, they can add new items or remove items from their own department's catalog directly — without needing an Owner/IC account or access to Settings
9. **"Employee Health"** (Owner/IC only — a "Employee Health access only" doctor account gets the same views but read-only, no edits): mirrors the clinic's real Employee Clinic tracking sheet as one live, editable grid — same shape as the sheet, one row per employee. The **Employee Clinic** tab has a "Regular Staff" and a "Kitchen Staff" grid (switch with the sub-tabs); every cell saves automatically as you edit it. Columns: roster (employee #/file #/iqama #/DOB/phone/department), investigation status (doctor review due / sample not yet given / review done, covering the standard serology panel), PPD status with test date and auto-calculated next-due date, a Stool & Urine Test for Kitchen Staff (auto next-due +6 months), ICN remarks, then one grouped column-set per vaccine (Hep B, MMR, Varicella, Tetanus, Influenza, plus Meningococcal/Typhoid/Hepatitis A for Kitchen Staff) — tick "Req?" for whichever vaccine the doctor requested, then fill in each dose's date and batch number directly in its cell; the next dose's due date is calculated automatically from the 1st dose date (e.g. Hep B: 0 / +1 month / +6 months). An "Overdue & Missing" view rolls all of this up (PPD, stool/urine, and every partially-completed vaccine series) across every employee, and Excel/PDF export produces the same grid (a Regular Staff sheet and a Kitchen Staff sheet, plus a flat per-dose vaccination log)
10. **"Suspected/Confirmed Cases"** (Owner/IC only): log patients suspected or confirmed to have a communicable disease (disease picked from a configurable list, or "Other"), the date it was reported to the health authority, and up to two supporting attachments — a case is flagged "Attachment Missing" until both are on file, unless the second is marked not required for that case; export to Excel/PDF
11. **"Messages"** (everyone): a simple one-on-one chat between any two accounts — pick anyone from "New" to start a conversation, or reopen an existing one from the list. Messages arrive live (no refresh needed) and an unread-count badge shows on the "Messages" link in the sidebar
12. **"Daily IC Rounds"** (Owner/IC only): a quick daily MET / NOT MET check per department/unit (its own department list) — a single overall pass/fail per department per day rather than a detailed per-patient audit. A NOT MET round captures a Finding/Observation, any number of attachments (add more anytime, remove individually), a Corrective Action, and a Date of Discussion (all always editable later, e.g. to add a corrective action once it's decided), then tracks it as Open until marked Closed; filter the list by NOT MET/Open/Closed and export to Excel/PDF
13. **"Trackers"** (Owner/IC only): four independent renewal/expiry logs, each with its own tab — **Baladiya License** (per employee: issue/expiry date + attachment, with its own add/remove roster), **Policy** (issue/revision/expiry date + attachment; expiry auto-fills to 3 years after the issue date but stays freely editable), **Culture** (submission + next-due date per area, e.g. "Dental 1"), and **Agreement** (renewal + next-due date per vendor, e.g. "SEPCO") — Culture's areas and Agreement's vendor list are each editable from Settings. Every row shows an "Expired"/"Expiring Soon" badge and everything exports to Excel/PDF
