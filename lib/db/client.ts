import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Database } from "./types.generated";

let client: SupabaseClient<Database> | null = null;

export function getDb(): SupabaseClient<Database> {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("SUPABASE_URL is not set");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

  client = createClient<Database>(url, key, {
    auth: { persistSession: false },
  });

  return client;
}
