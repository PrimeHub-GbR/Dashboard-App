'use client'

import { useState } from 'react'
import { Loader2, Play, ArrowRight, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { WorkflowConfig } from '@/lib/workflow-config'
import { FileDropZone } from './FileDropZone'

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

  const canProceed =
    !config.acceptsFile || selectedFile !== null

  return (
    <>
      <div className="group flex flex-col rounded-2xl border border-white/10 bg-white/4 p-5 transition-all duration-200 hover:bg-white/7 hover:border-white/20">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/15">
          <Play className="h-4 w-4 text-green-400" />
        </div>
        <h3 className="mb-1 text-sm font-semibold text-white/90">{config.label}</h3>
        <p className="mb-4 flex-1 text-xs leading-relaxed text-white/45">{config.description}</p>
        <Button
          onClick={handleOpen}
          size="sm"
          className="w-full gap-1.5 bg-green-500/15 text-green-300 border border-green-500/25 hover:bg-green-500/25 hover:text-green-200 hover:border-green-500/40"
        >
          Workflow starten
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md bg-[#0d1a12] border border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">{config.label}</DialogTitle>
          </DialogHeader>

          {/* Step Indicator */}
          <div className="flex items-center gap-3 py-1">
            <div className="flex items-center gap-2">
              <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                step === 1
                  ? 'bg-green-500 text-white'
                  : 'bg-green-500/20 text-green-400'
              }`}>
                {step > 1 ? <CheckCircle2 className="h-4 w-4" /> : '1'}
              </div>
              <span className={`text-xs ${step === 1 ? 'text-white/80' : 'text-white/40'}`}>
                {config.acceptsFile ? 'Datei hochladen' : 'Bestätigen'}
              </span>
            </div>
            <div className="h-px flex-1 bg-white/10" />
            <div className="flex items-center gap-2">
              <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                step === 2
                  ? 'bg-green-500 text-white'
                  : 'bg-white/10 text-white/30'
              }`}>
                2
              </div>
              <span className={`text-xs ${step === 2 ? 'text-white/80' : 'text-white/30'}`}>
                Verarbeitung
              </span>
            </div>
          </div>

          {/* Step 1: Upload */}
          {step === 1 && (
            <div className="flex flex-col gap-4 pt-2">
              {config.acceptsFile ? (
                <>
                  <p className="text-xs text-white/50">
                    Lade eine Datei hoch ({config.acceptedExtensions}), um den Workflow zu starten.
                  </p>
                  <FileDropZone
                    config={config}
                    file={selectedFile}
                    onFileChange={setSelectedFile}
                  />
                </>
              ) : (
                <p className="text-sm text-white/60 py-4 text-center">
                  Dieser Workflow benötigt keine Eingabedatei. Klicke auf &quot;Weiter&quot;, um ihn zu starten.
                </p>
              )}
              <Button
                onClick={handleSubmit}
                disabled={!canProceed}
                className="w-full bg-green-600 hover:bg-green-500 text-white border-0"
              >
                Weiter
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Step 2: Processing */}
          {step === 2 && (
            <div className="flex flex-col items-center gap-5 py-4 text-center">
              {jobStarted ? (
                <>
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/20">
                    <CheckCircle2 className="h-7 w-7 text-green-400" />
                  </div>
                  <div>
                    <p className="font-medium text-white">Job gestartet!</p>
                    <p className="mt-1 text-xs text-white/50">
                      Der Status wird in der Job-Historie aktualisiert.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/10">
                    <Loader2 className="h-7 w-7 text-green-400 animate-spin" />
                  </div>
                  <div>
                    <p className="font-medium text-white">Workflow wird gestartet…</p>
                    <p className="mt-1 text-xs text-white/50">
                      Datei wird hochgeladen und N8N-Job erstellt.
                    </p>
                  </div>
                  {uploadProgress > 0 && (
                    <div className="w-full space-y-1">
                      <Progress value={uploadProgress} className="h-1.5 bg-white/10" />
                      <p className="text-right text-xs text-white/30">{uploadProgress}%</p>
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
