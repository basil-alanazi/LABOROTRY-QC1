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
   (this automatically seeds the four departments and the six checklists: SSI, CAUTI, VAE ICU/NICU, CLABSI ICU/NICU)
4. Project Settings → Data API → copy the API URL
5. Project Settings → API Keys → copy the Publishable key

## 2) GitHub (new repo, or inside the same repo)
Upload the contents of the `infection-control/` folder (including `public` if present).

## 3) Vercel (new project)
1. vercel.com → Add New → Project → import the repo (Root Directory = `infection-control`)
2. Environment Variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
3. Deploy

## 4) Default accounts (change these immediately from Settings)
- **Ward Staff** (entry only): `ward` / `ward123`
- **Infection Control — Primary**: `ic` / `ic123`
- **Infection Control — Secondary**: `ic2` / `ic2123`
- **Owner** (full access + accounts): `owner` / `owner123`

## 5) How it works
1. Any account opens **"Daily Ward Round"**, picks a department then a checklist type (only checklists linked to that department show up)
2. Fills in patient details and marks each bundle item: MET / NOT MET / N/A
3. The system computes MET / Applicable / NOT MET / Compliance% automatically on save
4. **"Records"**: all past audits, filterable by department/checklist/date, with the ability to resolve any "Action Needed" item
5. **"Dashboard"** (Infection Control team only): monthly summary — total audits, overall compliance, by checklist and by department (same logic as the Excel Dashboard sheet)
6. **"Settings"** (Infection Control team): add/remove departments, edit each checklist's items and department links, and manage accounts (owner only)

## Important note on checklist items
Some bundle-item texts in the original Excel file were cut off (the sheet truncates around
60 characters). The six checklists were seeded with the standard, widely recognized wording for
these bundles, but **review them from Settings → Checklists and confirm the exact official
wording** (especially any reference to an internal policy or protocol) before relying on them
for official documentation.
