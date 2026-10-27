import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'

interface DeltaIconProps {
  delta: number
  className?: string
}

/** Pfeil-Icon zur Veränderung (Farbe nie allein). */
export function DeltaIcon({ delta, className = 'h-4 w-4' }: DeltaIconProps) {
  if (delta > 0) return <ArrowUpRight className={className} aria-hidden="true" />
  if (delta < 0) return <ArrowDownRight className={className} aria-hidden="true" />
  return <Minus className={className} aria-hidden="true" />
}

/** Gedämpfter Geviertstrich für „kein Wert“. */
export function NoValue({ className = '' }: { className?: string }) {
  return (
    <span className={`text-muted-foreground ${className}`.trim()}>
      <span aria-hidden="true">—</span>
      <span className="sr-only">kein Wert</span>
    </span>
  )
}
