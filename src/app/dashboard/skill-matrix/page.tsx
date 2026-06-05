import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { SkillMatrixClient } from '@/components/skill-matrix/SkillMatrixClient'

export const metadata = { title: 'Skill-Matrix — PrimeHub Dashboard' }
export const dynamic = 'force-dynamic'

export default async function SkillMatrixPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/')

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  const role = roleData?.role as 'admin' | 'manager' | 'staff' | undefined
  if (!role) redirect('/')

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Skill-Matrix</h1>
        <p className="text-muted-foreground mt-1">
          Wer welche Tätigkeit beherrscht, gerade lernt oder noch erlernen muss.
        </p>
      </div>
      <SkillMatrixClient userRole={role} />
    </div>
  )
}
