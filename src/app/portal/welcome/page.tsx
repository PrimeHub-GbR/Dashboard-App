'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'

// Passwort-Policy: 8 Zeichen, min. 1 Groß-, 1 Kleinbuchstabe, 1 Zahl.
const passwordSchema = z
  .string()
  .min(8, 'Mindestens 8 Zeichen')
  .regex(/[A-Z]/, 'Mindestens 1 Großbuchstabe')
  .regex(/[a-z]/, 'Mindestens 1 Kleinbuchstabe')
  .regex(/[0-9]/, 'Mindestens 1 Zahl')

const formSchema = z
  .object({
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: 'Die Passwörter stimmen nicht überein',
    path: ['confirm'],
  })

type FormData = z.infer<typeof formSchema>

type Phase = 'verifying' | 'ready' | 'done' | 'error'

export default function WelcomePage() {
  const [phase, setPhase] = useState<Phase>('verifying')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)

  // Token aus dem E-Mail-Link einlösen → Session NUR für diesen Token etablieren.
  useEffect(() => {
    const supabase = createClient()

    async function run() {
      const params = new URLSearchParams(window.location.search)
      const tokenHash = params.get('token_hash')
      const type = params.get('type') // 'invite' | 'recovery'

      // SICHERHEIT: Diese Seite darf AUSSCHLIESSLICH über einen frischen
      // E-Mail-Token funktionieren. Eine evtl. bestehende Session (z.B. eines
      // im selben Browser eingeloggten Admins) wird zuvor lokal beendet, damit
      // sie hier NICHT genutzt werden kann (kein Fremd-Passwort-Reset).
      await supabase.auth.signOut({ scope: 'local' })

      if (!tokenHash || !type) {
        setErrorMsg(
          'Diese Seite lässt sich nur über den Link aus deiner Einladungs- bzw. ' +
            'Reset-E-Mail öffnen. Bitte nutze den Button in der E-Mail.'
        )
        setPhase('error')
        return
      }

      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as 'invite' | 'recovery',
      })
      if (error || !data.session) {
        setErrorMsg(
          'Dieser Link ist ungültig oder abgelaufen. Bitte fordere bei deinem Admin einen neuen an.'
        )
        setPhase('error')
        return
      }
      // Token sofort aus der Adressleiste/History entfernen, damit er dort
      // nicht offen liegt (er ist ohnehin nur einmal verwendbar).
      window.history.replaceState(null, '', '/portal/welcome')
      setEmail(data.user?.email ?? null)
      setPhase('ready')
    }

    run()
  }, [])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(formSchema) })

  const onSubmit = async (data: FormData) => {
    setErrorMsg(null)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: data.password })
    if (error) {
      setErrorMsg('Passwort konnte nicht gesetzt werden. Bitte versuche es erneut.')
      return
    }
    // Session beenden — Login erfolgt frisch in der App.
    await supabase.auth.signOut()
    setPhase('done')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0d0e10] px-4">
      <Card className="w-full max-w-sm overflow-hidden border-none shadow-xl">
        <CardHeader className="bg-[#005e30] text-center py-8">
          <div className="text-2xl font-bold tracking-tight text-white">PrimeHub</div>
          <p className="text-sm text-white/80 mt-1">Mitarbeiter-App</p>
        </CardHeader>
        <CardContent className="pt-6">
          {phase === 'verifying' && (
            <p className="text-center text-sm text-muted-foreground py-8">
              Einladung wird geprüft…
            </p>
          )}

          {phase === 'error' && (
            <div className="py-6 text-center space-y-2">
              <p className="text-sm text-red-600" role="alert">
                {errorMsg}
              </p>
            </div>
          )}

          {phase === 'ready' && (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1">
                <h1 className="text-lg font-semibold">Passwort festlegen</h1>
                <p className="text-sm text-muted-foreground">
                  {email ? (
                    <>
                      Login-E-Mail: <span className="font-medium">{email}</span>
                    </>
                  ) : (
                    'Lege dein Passwort für die PrimeHub-App fest.'
                  )}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Neues Passwort</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={!!errors.password}
                  {...register('password')}
                />
                {errors.password && (
                  <p className="text-sm text-red-600" role="alert">
                    {errors.password.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm">Passwort wiederholen</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={!!errors.confirm}
                  {...register('confirm')}
                />
                {errors.confirm && (
                  <p className="text-sm text-red-600" role="alert">
                    {errors.confirm.message}
                  </p>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Mindestens 8 Zeichen, mit Groß- und Kleinbuchstaben sowie einer Zahl.
              </p>

              {errorMsg && (
                <p className="text-sm text-red-600" role="alert">
                  {errorMsg}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Wird gespeichert…' : 'Passwort speichern'}
              </Button>
            </form>
          )}

          {phase === 'done' && (
            <div className="py-6 text-center space-y-3">
              <div className="text-4xl">✅</div>
              <h1 className="text-lg font-semibold">Passwort gesetzt</h1>
              <p className="text-sm text-muted-foreground">
                Du kannst dich jetzt in der <span className="font-medium">PrimeHub-App</span>{' '}
                mit deiner E-Mail und deinem neuen Passwort anmelden.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
