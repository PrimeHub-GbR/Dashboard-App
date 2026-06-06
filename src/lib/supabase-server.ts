import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * Creates a Supabase client that reads auth from cookies (for API routes).
 * Use this to authenticate the current user.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // setAll can fail in Server Components where cookies are read-only.
          // This is fine for API routes that only read auth state.
        }
      },
    },
  })
}

/**
 * Creates a Supabase client with the service role key.
 * Bypasses RLS - use for server-side DB writes (job updates, etc.).
 */
export function createSupabaseServiceClient() {
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export const WORKFLOW_RESULTS_BUCKET = 'workflow-results'

/**
 * Normalizes a stored result file path to a bucket-relative object key.
 *
 * N8N callbacks sometimes include the bucket name as a prefix
 * (e.g. "workflow-results/foo.csv") or a leading slash. Supabase's
 * createSignedUrl expects ONLY the object key relative to the bucket, so a
 * prefixed value would resolve to "workflow-results/workflow-results/foo.csv"
 * and fail. This strips any leading slashes and bucket-name prefix.
 */
export function normalizeResultKey(path: string): string {
  let key = path.trim().replace(/^\/+/, '')
  const prefix = `${WORKFLOW_RESULTS_BUCKET}/`
  while (key.startsWith(prefix)) key = key.slice(prefix.length)
  return key
}
