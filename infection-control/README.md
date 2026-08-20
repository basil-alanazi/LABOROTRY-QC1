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
- **Ward Staff** — reserved for a future module (department-specific Hand Hygiene audits); for now these accounts only see their Profile page

Because each person logs in with their own account, every entry, resolved action, and deletion
is attributed to the real person who did it — visible in Records and in the exported reports.

## 5) How it works
1. Daily Ward Round and Records are for the Infection Control team (Infection Control + Owner roles) only. Ward Staff accounts only see their own Profile for now.
2. **"Daily Ward Round"**: pick a department then a checklist type (only checklists linked to that department show up), fill in patient details and mark each bundle item MET / NOT MET / N/A. Saving jumps focus straight back to Patient Name so the next patient can be entered right away.
3. The system computes MET / Applicable / NOT MET / Compliance% automatically on save
4. **"Records"**: all past audits, filterable by department/checklist/date, with the ability to resolve any "Action Needed" item — export the filtered list to Excel or PDF
5. **"Dashboard"**: compliance summary by checklist and by department, either for a calendar month or any custom date range you pick — export either view to Excel or PDF
6. **"Settings"**: add/remove departments, edit each checklist's items/department links/baseline note, and manage user accounts (owner only)
7. **"Profile"** (everyone): view your own account details and change your own password any time

## Important note on checklist items
Some bundle-item texts in the original Excel file were cut off (the sheet truncates around
60 characters). The six checklists were seeded with the standard, widely recognized wording for
these bundles, but **review them from Settings → Checklists and confirm the exact official
wording** (especially any reference to an internal policy or protocol) before relying on them
for official documentation.
