import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface UseUserRoleReturn {
  role: 'admin' | 'staff' | null
  isAdmin: boolean
  isLoading: boolean
  error: string | null
}

export function useUserRole(): UseUserRoleReturn {
  const [role, setRole] = useState<'admin' | 'staff' | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchRole() {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
          setRole(null)
          return
        }

        const { data, error: roleError } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .single()

        if (roleError) {
          setError('Rolle konnte nicht geladen werden')
          return
        }

        setRole(data.role as 'admin' | 'staff')
      } catch {
        setError('Unbekannter Fehler beim Laden der Rolle')
      } finally {
        setIsLoading(false)
      }
    }

    fetchRole()
  }, [])

  return { role, isAdmin: role === 'admin', isLoading, error }
}
