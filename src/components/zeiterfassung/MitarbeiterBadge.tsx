interface Props {
  name: string
  color: string
  size?: 'sm' | 'md'
}

export function MitarbeiterBadge({ name, color, size = 'md' }: Props) {
  const dotSize = size === 'sm' ? 'w-2 h-2' : 'w-3 h-3'
  return (
    <div className="flex items-center gap-2">
      <div
        className={`${dotSize} rounded-full shrink-0`}
        style={{ backgroundColor: color }}
      />
      <span className={`${size === 'sm' ? 'text-sm' : ''} leading-snug`}>{name}</span>
    </div>
  )
}
