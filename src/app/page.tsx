'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'

const loginSchema = z.object({
  email: z.string().email('Bitte gib eine gültige E-Mail-Adresse ein'),
  password: z.string().min(1, 'Passwort darf nicht leer sein'),
})

type LoginFormData = z.infer<typeof loginSchema>

export default function LoginPage() {
  const [serverError, setServerError] = useState<string | null>(null)

  // Prevent login flash on SPA navigation for already-logged-in users
  // + Rollencheck: nur Admin/Manager duerfen ins Dashboard.
  useEffect(() => {
    const supabase = createClient()

    // Hinweis, wenn Middleware einen Mitarbeiter abgewiesen hat
    const params = new URLSearchParams(window.location.search)
    if (params.get('error') === 'forbidden') {
      setServerError(
        'Dieser Zugang ist nur für Admins und Manager. Mitarbeitende melden sich bitte in der PrimeHub-App an.'
      )
      void supabase.auth.signOut()
      return
    }

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: roleRow } = await supabase
        .from('user_roles').select('role').eq('user_id', user.id).maybeSingle()
      const allowed = roleRow?.role === 'admin' || roleRow?.role === 'manager'
      if (allowed) {
        window.location.href = '/dashboard/aufgaben'
      } else {
        await supabase.auth.signOut()
        setServerError(
          'Dieser Zugang ist nur für Admins und Manager. Mitarbeitende melden sich bitte in der PrimeHub-App an.'
        )
      }
    })
  }, [])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginFormData) => {
    setServerError(null)

    try {
      const supabase = createClient()
      const { data: signInData, error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      })

      if (error || !signInData.user) {
        setServerError('Anmeldedaten ungültig. Bitte überprüfe E-Mail und Passwort.')
        return
      }

      // Rollencheck: nur Admin/Manager duerfen ins Dashboard.
      // Mitarbeitende haben zwar einen App-Login, aber keinen Dashboard-Zugang.
      const { data: roleRow } = await supabase
        .from('user_roles').select('role').eq('user_id', signInData.user.id).maybeSingle()
      const allowed = roleRow?.role === 'admin' || roleRow?.role === 'manager'
      if (!allowed) {
        await supabase.auth.signOut()
        setServerError(
          'Dieser Zugang ist nur für Admins und Manager. Mitarbeitende melden sich bitte in der PrimeHub-App an.'
        )
        return
      }

      window.location.href = '/dashboard/aufgaben'
    } catch {
      setServerError('Anmeldung fehlgeschlagen. Bitte versuche es erneut.')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-sm mx-4">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-2xl font-semibold">PrimeHub Dashboard</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">Anmelden</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-Mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="name@beispiel.de"
                aria-invalid={!!errors.email}
                {...register('email')}
              />
              {errors.email && (
                <p className="text-sm text-red-600" role="alert">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Passwort</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={!!errors.password}
                {...register('password')}
              />
              {errors.password && (
                <p className="text-sm text-red-600" role="alert">{errors.password.message}</p>
              )}
            </div>

            {serverError && (
              <p className="text-sm text-red-600" role="alert">{serverError}</p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
            >
              {isSubmitting ? 'Wird angemeldet…' : 'Anmelden'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
