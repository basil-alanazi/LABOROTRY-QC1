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

## 4) Default account (change the password immediately from Settings)
- **Owner** (full access + user management): `owner` / `owner123`

Every other person gets their own account — the owner creates it from **Settings → User Accounts**
(username, password, display name, role, and an optional home department). Roles:
- **Owner** — everything, including creating/editing/deleting user accounts
- **Infection Control** — full data access: all departments, Records, Dashboard, Settings (checklists/departments), but not user accounts
- **Ward Staff** — entry only (Daily Ward Round + Records), optionally defaulted to one department

Because each person logs in with their own account, every entry, resolved action, and deletion
is attributed to the real person who did it — visible in Records and in the exported reports.

## 5) How it works
1. Any account opens **"Daily Ward Round"**, picks a department then a checklist type (only checklists linked to that department show up)
2. Fills in patient details and marks each bundle item: MET / NOT MET / N/A
3. The system computes MET / Applicable / NOT MET / Compliance% automatically on save
4. **"Records"**: all past audits, filterable by department/checklist/date, with the ability to resolve any "Action Needed" item — export the filtered list to Excel or PDF
5. **"Dashboard"** (Infection Control team only): monthly summary — total audits, overall compliance, by checklist and by department (same logic as the Excel Dashboard sheet) — export to Excel or PDF
6. **"Settings"**: add/remove departments and edit each checklist's items and department links (Infection Control team); manage user accounts (owner only)

## Important note on checklist items
Some bundle-item texts in the original Excel file were cut off (the sheet truncates around
60 characters). The six checklists were seeded with the standard, widely recognized wording for
these bundles, but **review them from Settings → Checklists and confirm the exact official
wording** (especially any reference to an internal policy or protocol) before relying on them
for official documentation.
