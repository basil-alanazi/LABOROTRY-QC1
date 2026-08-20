import { createClient } from "@supabase/supabase-js";
import { createMockClient } from "./mockDb";
import * as seed from "./mockSeed";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// No real Supabase project configured yet — fall back to an in-memory
// preview so the app is still fully clickable. Nothing here persists.
export const supabase =
  url && key
    ? createClient(url, key)
    : createMockClient({
        app_config: [seed.app_config],
        checklist_types: seed.checklist_types,
        ward_round_audits: seed.ward_round_audits,
        users: seed.users,
      });
