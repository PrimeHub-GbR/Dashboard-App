"use client"

import { WebGLShader } from "@/components/ui/web-gl-shader"
import { LiquidButton } from "@/components/ui/liquid-glass-button"
import { Bot, Zap, BarChart3, RefreshCw, ArrowRight, Workflow } from "lucide-react"

const stats = [
  { value: "10×", label: "schnellere Preisanpassungen" },
  { value: "24/7", label: "autonome Workflows" },
  { value: "98%", label: "weniger manuelle Arbeit" },
  { value: "< 2s", label: "Reaktionszeit pro Job" },
]

const features = [
  {
    icon: Workflow,
    title: "N8N Workflow-Engine",
    description: "Visuelle Automatisierungspipelines ohne Code. CSV-Verarbeitung, ISBN-Lookup, Preisberechnung — alles modular aufgebaut.",
  },
  {
    icon: Bot,
    title: "KI-gestützte Entscheidungen",
    description: "Intelligente Repricer-Logik erkennt Markttrends in Echtzeit und passt Preise automatisch an — basierend auf Live-Daten.",
  },
  {
    icon: Zap,
    title: "Echtzeit-Verarbeitung",
    description: "Jobs starten sofort nach Upload. Status-Updates live im Dashboard — kein Polling, kein Warten.",
  },
  {
    icon: BarChart3,
    title: "Vollständige Transparenz",
    description: "Jeder Workflow-Schritt ist nachverfolgbar. Fehler werden sofort sichtbar, Logs auf Knotenebene.",
  },
  {
    icon: RefreshCw,
    title: "Automatische Sync-Jobs",
    description: "Bestellungen aus Google Drive, Preisdaten aus externen APIs — alles synchronisiert sich automatisch nach Zeitplan.",
  },
  {
    icon: ArrowRight,
    title: "Nahtlose Integration",
    description: "Supabase als Datenschicht, Vercel für Zero-Downtime-Deployments, N8N für Prozesslogik — ein vollständiges Stack.",
  },
]

export default function LandingPage() {
  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-black text-white">
      {/* WebGL animated background */}
      <WebGLShader />

      {/* Dark overlay for readability */}
      <div className="pointer-events-none fixed inset-0 bg-black/60" />

      {/* Content */}
      <div className="relative z-10">

        {/* Nav */}
        <nav className="flex items-center justify-between px-6 py-5 md:px-12">
          <span className="text-lg font-bold tracking-tight">PrimeHub</span>
          <a href="/" className="text-sm text-white/60 hover:text-white transition-colors">
            Anmelden →
          </a>
        </nav>

        {/* Hero */}
        <section className="flex min-h-[85vh] flex-col items-center justify-center px-6 text-center">
          <div className="mb-6 flex items-center justify-center gap-2">
            <span className="relative flex h-3 w-3 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
            <p className="text-xs text-green-400 font-medium tracking-wide uppercase">
              KI-Automatisierung — live & aktiv
            </p>
          </div>

          <h1 className="mb-6 text-5xl font-extrabold tracking-tighter leading-tight md:text-7xl lg:text-[clamp(3rem,9vw,7rem)]">
            Automatisierung
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-300">
              trifft KI
            </span>
          </h1>

          <p className="mb-10 max-w-2xl text-base text-white/60 md:text-xl leading-relaxed">
            PrimeHub verbindet N8N-Workflows, KI-Logik und Echtzeit-Daten zu einem
            vollautonomen E-Commerce-Operations-System — von der Preisanpassung
            bis zur Bestellverwaltung.
          </p>

          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <LiquidButton
              className="text-white border border-white/20 rounded-full font-semibold"
              size="xl"
              onClick={() => window.location.href = "/"}
            >
              Dashboard öffnen
            </LiquidButton>
            <a
              href="#features"
              className="text-sm text-white/50 hover:text-white transition-colors underline-offset-4 hover:underline"
            >
              Mehr erfahren
            </a>
          </div>
        </section>

        {/* Stats */}
        <section className="px-6 py-16 md:px-12">
          <div className="mx-auto max-w-5xl grid grid-cols-2 gap-6 md:grid-cols-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center backdrop-blur-sm"
              >
                <div className="text-4xl font-extrabold text-green-400 tracking-tight">
                  {stat.value}
                </div>
                <div className="mt-1 text-xs text-white/50">{stat.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section id="features" className="px-6 py-16 md:px-12">
          <div className="mx-auto max-w-5xl">
            <h2 className="mb-3 text-center text-3xl font-bold tracking-tight md:text-4xl">
              Was das System kann
            </h2>
            <p className="mb-12 text-center text-sm text-white/50 max-w-xl mx-auto">
              Jede Funktion wurde entwickelt, um manuelle Arbeit zu eliminieren
              und Entscheidungen zu automatisieren.
            </p>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <div
                  key={feature.title}
                  className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm hover:bg-white/8 transition-colors"
                >
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/20">
                    <feature.icon className="h-5 w-5 text-green-400" />
                  </div>
                  <h3 className="mb-2 font-semibold text-white">{feature.title}</h3>
                  <p className="text-sm text-white/50 leading-relaxed">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Footer */}
        <section className="px-6 py-20 text-center md:px-12">
          <div className="mx-auto max-w-2xl">
            <h2 className="mb-4 text-3xl font-bold tracking-tight">
              Bereit für das Dashboard?
            </h2>
            <p className="mb-8 text-sm text-white/50">
              Melde dich an und steuere deine gesamten E-Commerce-Prozesse
              von einem zentralen Ort.
            </p>
            <LiquidButton
              className="text-white border border-white/20 rounded-full font-semibold"
              size="xl"
              onClick={() => window.location.href = "/"}
            >
              Jetzt anmelden
            </LiquidButton>
          </div>
        </section>

      </div>
    </div>
  )
}
