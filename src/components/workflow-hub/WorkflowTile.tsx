'use client'

import { useState } from 'react'
import {
  Loader2, ArrowRight, CheckCircle2,
  BarChart3, BookOpen, FileDown, ShieldCheck,
  FileOutput, RefreshCw, ArrowLeftRight, Hash, Tags, type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AnimatedBorderCard } from '@/components/ui/dynamic-border-animations-card'
import type { WorkflowConfig } from '@/lib/workflow-config'
import { FileDropZone } from './FileDropZone'

const WORKFLOW_ICONS: Record<string, LucideIcon> = {
  sellerboard: BarChart3,
  kulturgut: BookOpen,
  'a43-export': FileDown,
  'avus-export': ShieldCheck,
  'blank-export': FileOutput,
  'repricer-updater': RefreshCw,
  ean2bbp: ArrowLeftRight,
  isbn2ean: Hash,
  ean2isbn: Tags,
}

const WORKFLOW_COLORS: Record<string, {
  bg: string; icon: string; border: string
  topColor: string; rightColor: string; bottomColor: string; leftColor: string
}> = {
  sellerboard:      { bg: 'bg-blue-500/20',   icon: 'text-blue-300',   border: 'border-blue-500/30',   topColor: 'via-blue-400/70',   rightColor: 'via-blue-500/50',   bottomColor: 'via-blue-400/70',   leftColor: 'via-blue-500/50' },
  kulturgut:        { bg: 'bg-amber-500/20',  icon: 'text-amber-300',  border: 'border-amber-500/30',  topColor: 'via-amber-400/70',  rightColor: 'via-amber-500/50',  bottomColor: 'via-amber-400/70',  leftColor: 'via-amber-500/50' },
  'a43-export':     { bg: 'bg-violet-500/20', icon: 'text-violet-300', border: 'border-violet-500/30', topColor: 'via-violet-400/70', rightColor: 'via-violet-500/50', bottomColor: 'via-violet-400/70', leftColor: 'via-violet-500/50' },
  'avus-export':    { bg: 'bg-rose-500/20',   icon: 'text-rose-300',   border: 'border-rose-500/30',   topColor: 'via-rose-400/70',   rightColor: 'via-rose-500/50',   bottomColor: 'via-rose-400/70',   leftColor: 'via-rose-500/50' },
  'blank-export':   { bg: 'bg-slate-500/20',  icon: 'text-slate-300',  border: 'border-slate-500/30',  topColor: 'via-slate-400/70',  rightColor: 'via-slate-500/50',  bottomColor: 'via-slate-400/70',  leftColor: 'via-slate-500/50' },
  'repricer-updater': { bg: 'bg-green-500/20', icon: 'text-green-300', border: 'border-green-500/30', topColor: 'via-green-400/70',  rightColor: 'via-green-500/50',  bottomColor: 'via-green-400/70',  leftColor: 'via-green-500/50' },
  ean2bbp:          { bg: 'bg-cyan-500/20',   icon: 'text-cyan-300',   border: 'border-cyan-500/30',   topColor: 'via-cyan-400/70',   rightColor: 'via-cyan-500/50',   bottomColor: 'via-cyan-400/70',   leftColor: 'via-cyan-500/50' },
  isbn2ean:         { bg: 'bg-orange-500/20', icon: 'text-orange-300', border: 'border-orange-500/30', topColor: 'via-orange-400/70', rightColor: 'via-orange-500/50', bottomColor: 'via-orange-400/70', leftColor: 'via-orange-500/50' },
  ean2isbn:         { bg: 'bg-teal-500/20',   icon: 'text-teal-300',   border: 'border-teal-500/30',   topColor: 'via-teal-400/70',   rightColor: 'via-teal-500/50',   bottomColor: 'via-teal-400/70',   leftColor: 'via-teal-500/50' },
}

interface WorkflowTileProps {
  config: WorkflowConfig
}

type Step = 1 | 2

export function WorkflowTile({ config }: WorkflowTileProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>(1)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [jobStarted, setJobStarted] = useState(false)

  const Icon = WORKFLOW_ICONS[config.key] ?? BarChart3
  const color = WORKFLOW_COLORS[config.key] ?? WORKFLOW_COLORS['repricer-updater']

  function handleOpen() {
    setOpen(true)
    setStep(1)
    setSelectedFile(null)
    setIsSubmitting(false)
    setUploadProgress(0)
    setJobStarted(false)
  }

  function handleClose() {
    if (isSubmitting) return
    setOpen(false)
  }

  async function handleSubmit() {
    if (!config.acceptsFile || selectedFile) {
      setStep(2)
      setIsSubmitting(true)
      setUploadProgress(0)

      try {
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          const formData = new FormData()
          formData.append('workflow_key', config.key)
          if (selectedFile) {
            formData.append('file', selectedFile)
          }

          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
              setUploadProgress(Math.round((e.loaded / e.total) * 100))
            }
          })

          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve()
            } else {
              try {
                const body = JSON.parse(xhr.responseText)
                reject(new Error(body.error ?? 'Fehler beim Starten des Jobs'))
              } catch {
                reject(new Error('Fehler beim Starten des Jobs'))
              }
            }
          })

          xhr.addEventListener('error', () => reject(new Error('Netzwerkfehler')))

          xhr.open('POST', '/api/jobs')
          xhr.send(formData)
        })

        setJobStarted(true)
        toast.success('Job gestartet — Status wird aktualisiert')
        setTimeout(() => setOpen(false), 1500)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Fehler beim Starten des Jobs')
        setStep(1)
      } finally {
        setIsSubmitting(false)
      }
    }
  }

  const canProceed = !config.acceptsFile || selectedFile !== null

  return (
    <>
      {/* Tile */}
      <AnimatedBorderCard
        topColor={color.topColor}
        rightColor={color.rightColor}
        bottomColor={color.bottomColor}
        leftColor={color.leftColor}
        className="group flex flex-col p-5 transition-all duration-200 hover:bg-[#0f2016] cursor-default"
      >
        {/* Glow blob */}
        <div className={`absolute -top-8 -right-8 h-24 w-24 rounded-full ${color.bg} blur-2xl opacity-60 pointer-events-none`} />

        {/* Verified dot */}
        {config.verified && (
          <div className="absolute top-3 right-3 flex items-center gap-1.5" title="Getestet & funktioniert">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
            </span>
          </div>
        )}

        {/* Icon */}
        <div className={`relative mb-4 flex h-11 w-11 items-center justify-center rounded-xl ${color.bg} border ${color.border}`}>
          <Icon className={`h-5 w-5 ${color.icon}`} />
        </div>

        {/* Label */}
        <h3 className="relative mb-1.5 text-sm font-semibold text-white">{config.label}</h3>

        {/* Description */}
        <p className="relative mb-5 flex-1 text-xs leading-relaxed text-white/60">{config.description}</p>

        {/* Admin badge */}
        {config.adminOnly && (
          <span className="relative mb-3 inline-flex w-fit items-center rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium text-rose-300 border border-rose-500/25">
            Admin only
          </span>
        )}

        {/* CTA */}
        <button
          onClick={handleOpen}
          className={`relative flex w-full items-center justify-center gap-1.5 rounded-xl border ${color.border} ${color.bg} px-3 py-2 text-xs font-semibold ${color.icon} transition-all hover:opacity-90 active:scale-95`}
        >
          Workflow starten
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </AnimatedBorderCard>

      {/* Dialog */}
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md border border-white/10 bg-[#0c1a10] text-white">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${color.bg} ${color.border} border`}>
                <Icon className={`h-4 w-4 ${color.icon}`} />
              </div>
              <DialogTitle className="text-white">{config.label}</DialogTitle>
            </div>
          </DialogHeader>

          {/* Step Indicator */}
          <div className="flex items-center gap-2 py-1">
            <div className="flex items-center gap-2">
              <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                step === 1 ? 'bg-green-500 text-white' : 'bg-green-500/30 text-green-400'
              }`}>
                {step > 1 ? <CheckCircle2 className="h-3.5 w-3.5" /> : '1'}
              </div>
              <span className={`text-xs font-medium ${step === 1 ? 'text-white' : 'text-white/40'}`}>
                {config.acceptsFile ? 'Datei hochladen' : 'Bestätigen'}
              </span>
            </div>
            <div className="h-px flex-1 bg-white/10" />
            <div className="flex items-center gap-2">
              <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                step === 2 ? 'bg-green-500 text-white' : 'bg-white/10 text-white/30'
              }`}>
                2
              </div>
              <span className={`text-xs font-medium ${step === 2 ? 'text-white' : 'text-white/30'}`}>
                Verarbeitung
              </span>
            </div>
          </div>

          {/* Step 1: Upload */}
          {step === 1 && (
            <div className="flex flex-col gap-4 pt-1">
              {config.acceptsFile ? (
                <>
                  <p className="text-xs text-white/55">
                    Erlaubte Formate: <span className="text-white/80 font-medium">{config.acceptedExtensions}</span> · Max. 50 MB
                  </p>
                  <FileDropZone
                    config={config}
                    file={selectedFile}
                    onFileChange={setSelectedFile}
                  />
                </>
              ) : (
                <p className="py-4 text-center text-sm text-white/60">
                  Dieser Workflow benötigt keine Eingabedatei.<br />
                  Klicke auf <span className="text-white font-medium">&quot;Starten&quot;</span>, um ihn zu starten.
                </p>
              )}
              <Button
                onClick={handleSubmit}
                disabled={!canProceed}
                className="w-full bg-green-600 hover:bg-green-500 text-white border-0 disabled:opacity-40"
              >
                {config.acceptsFile ? 'Weiter' : 'Starten'}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Step 2: Processing */}
          {step === 2 && (
            <div className="flex flex-col items-center gap-5 py-6 text-center">
              {jobStarted ? (
                <>
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20 ring-4 ring-green-500/10">
                    <CheckCircle2 className="h-8 w-8 text-green-400" />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-white">Job gestartet!</p>
                    <p className="mt-1 text-xs text-white/50">
                      Status erscheint in der Job-Historie unten.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 ring-4 ring-green-500/5">
                    <Loader2 className="h-8 w-8 text-green-400 animate-spin" />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-white">Wird verarbeitet…</p>
                    <p className="mt-1 text-xs text-white/50">
                      Datei wird hochgeladen und N8N-Job erstellt.
                    </p>
                  </div>
                  {uploadProgress > 0 && (
                    <div className="w-full space-y-1.5">
                      <Progress value={uploadProgress} className="h-1.5 bg-white/10" />
                      <p className="text-right text-xs text-white/40">{uploadProgress}%</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
