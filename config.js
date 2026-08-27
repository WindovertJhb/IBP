// config.js
//
// Fill these in once the Windovert-owned Supabase project exists
// (Dashboard → Project Settings → API). The anon/publishable key is safe to
// commit and ship in this static site — it's meant to be public. Row Level
// Security (see supabase/schema.sql) is what actually protects the data;
// double-check it's enabled on every table before going live.

export const SUPABASE_URL = 'REPLACE_WITH_YOUR_SUPABASE_PROJECT_URL'
export const SUPABASE_ANON_KEY = 'REPLACE_WITH_YOUR_SUPABASE_ANON_KEY'
