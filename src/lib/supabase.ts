// Supabase Browser Client Setup
// Uses @supabase/ssr createBrowserClient so that auth sessions stored
// in cookies (set by the middleware and server routes) are automatically
// included in every query. This is required for RLS to work client-side.

import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)
