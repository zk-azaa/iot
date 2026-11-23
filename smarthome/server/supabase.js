import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

console.log("URL:", SUPABASE_URL);
console.log("KEY ADA:", !!SUPABASE_ANON_KEY);

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Supabase ENV tidak ditemukan");
}

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);