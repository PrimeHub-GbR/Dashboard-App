'use client'

import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { toast } from 'sonner'
import { fileValidationSchema } from '@/lib/workflow-config'
import type { WorkflowConfig } from '@/lib/workflow-config'
import { FilePreview } from './FilePreview'

interface FileDropZoneProps {
  config: WorkflowConfig
  file: File | null
  onFileChange: (file: File | null) => void
}

export function FileDropZone({ config, file, onFileChange }: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function validateAndSet(candidate: File | undefined) {
    if (!candidate) return

    if (!config.acceptedMimeTypes.includes(candidate.type)) {
      toast.error(`Ungültiger Dateityp. Erlaubt: ${config.acceptedExtensions}`)
      return
    }

    const result = fileValidationSchema.safeParse({
      name: candidate.name,
      size: candidate.size,
      type: candidate.type,
    })

    if (!result.success) {
      toast.error(result.error.issues[0]?.message ?? 'Datei ungültig')
      return
    }

    onFileChange(candidate)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    validateAndSet(e.dataTransfer.files[0])
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    validateAndSet(e.target.files?.[0])
    // Reset input so the same file can be re-selected after removal
    e.target.value = ''
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      inputRef.current?.click()
    }
  }

  if (file) {
    return <FilePreview file={file} onRemove={() => onFileChange(null)} />
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Datei hochladen"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      onKeyDown={handleKeyDown}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed px-4 py-8 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        isDragging
          ? 'border-primary bg-primary/5'
          : 'border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/30'
      }`}
    >
      <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
      <p className="text-sm font-medium">Datei hier ablegen oder klicken</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Erlaubt: {config.acceptedExtensions} · Max. 50 MB
      </p>
      <input
        ref={inputRef}
        type="file"
        accept={config.acceptedExtensions}
        onChange={handleInputChange}
        className="sr-only"
        tabIndex={-1}
      />
    </div>
  )
}
