import { createClient } from "@supabase/supabase-js";
import { createMockClient } from "./mockDb";
import * as seed from "./mockSeed";

// Defaults to the project's live Supabase instance; override with your own
// via VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY (see .env.example) if you're
// running this against a different Supabase project.
const url = import.meta.env.VITE_SUPABASE_URL || "https://wkevrfndgfuuyiwfllak.supabase.co";
const key =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndrZXZyZm5kZ2Z1dXlpd2ZsbGFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyMjE2NzksImV4cCI6MjEwMjc5NzY3OX0.aoKTxBZxf8ptXHh0r2S2NWeTVyh8p1jCl8chrjKFQQQ";

// If you intentionally want the offline preview instead, unset both env
// vars AND remove the defaults above. Nothing in preview mode persists.
export const supabase =
  url && key
    ? createClient(url, key)
    : createMockClient({
        app_config: [seed.app_config],
        checklist_types: seed.checklist_types,
        ward_round_audits: seed.ward_round_audits,
        hh_observations: seed.hh_observations,
        stock_items: seed.stock_items,
        stock_requests: seed.stock_requests,
        health_item_types: seed.health_item_types,
        employees: seed.employees,
        employee_health_records: seed.employee_health_records,
        employee_vaccine_requests: seed.employee_vaccine_requests,
        employee_clinic_status: seed.employee_clinic_status,
        disease_types: seed.disease_types,
        communicable_cases: seed.communicable_cases,
        users: seed.users,
        messages: seed.messages,
      });
