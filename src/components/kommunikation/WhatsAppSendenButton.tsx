'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { MessageCircle, Check, Loader2 } from 'lucide-react'
import { WhatsAppSendenDialog } from './WhatsAppSendenDialog'
import type { MessageContext } from '@/hooks/useKommunikation'

interface Props {
  recipientId?: string | null
  recipientName?: string | null
  phone?: string | null
  prefillText: string
  context: MessageContext
  contextRefId?: string | null
  className?: string
}

export function WhatsAppSendenButton({
  recipientId,
  recipientName,
  phone,
  prefillText,
  context,
  contextRefId,
  className,
}: Props) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [sent, setSent] = useState(false)

  const hasEmployee = !!recipientId && !!recipientName
  const hasPhone = !!phone

  // Gesendet-State — Session-persistent (kein Reset)
  if (sent) {
    return (
      <Button
        variant="ghost"
        className={`gap-2 text-green-600 dark:text-green-400 cursor-default animate-in fade-in-0 duration-200 ${className ?? ''}`}
        disabled
      >
        <Check className="h-4 w-4" />
        Gesendet ✓
      </Button>
    )
  }

  // Kein Mitarbeiter zugewiesen
  if (!hasEmployee) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                variant="outline"
                disabled
                className={`gap-2 opacity-50 cursor-not-allowed ${className ?? ''}`}
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp senden
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Kein Mitarbeiter zugewiesen</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  // Kein Telefon hinterlegt
  if (!hasPhone) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                variant="outline"
                disabled
                className={`gap-2 opacity-50 cursor-not-allowed ${className ?? ''}`}
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp senden
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Keine Telefonnummer hinterlegt</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setDialogOpen(true)}
        className={`gap-2 border-green-600 text-green-700 hover:bg-green-50 dark:border-green-500 dark:text-green-400 dark:hover:bg-green-900/20 ${className ?? ''}`}
      >
        <MessageCircle className="h-4 w-4" />
        WhatsApp senden
      </Button>

      <WhatsAppSendenDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        recipientId={recipientId}
        recipientName={recipientName}
        phone={phone}
        prefillText={prefillText}
        context={context}
        contextRefId={contextRefId}
        onSuccess={() => setSent(true)}
      />
    </>
  )
}
