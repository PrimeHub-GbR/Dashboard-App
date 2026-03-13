'use client'

import React, { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

interface AnimatedBorderCardProps {
  children: React.ReactNode
  className?: string
  topColor?: string
  bottomColor?: string
  leftColor?: string
  rightColor?: string
  speed?: number
}

export function AnimatedBorderCard({
  children,
  className,
  topColor = 'via-green-500/60',
  bottomColor = 'via-green-500/60',
  leftColor = 'via-emerald-400/50',
  rightColor = 'via-emerald-400/50',
  speed = 0.5,
}: AnimatedBorderCardProps) {
  const topRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const leftRef = useRef<HTMLDivElement>(null)
  const animIdRef = useRef<number>(0)

  useEffect(() => {
    const animateBorder = () => {
      const now = Date.now() / 1000
      const topX = Math.sin(now * speed) * 100
      const rightY = Math.cos(now * speed) * 100
      const bottomX = Math.sin(now * speed + Math.PI) * 100
      const leftY = Math.cos(now * speed + Math.PI) * 100

      if (topRef.current) topRef.current.style.transform = `translateX(${topX}%)`
      if (rightRef.current) rightRef.current.style.transform = `translateY(${rightY}%)`
      if (bottomRef.current) bottomRef.current.style.transform = `translateX(${bottomX}%)`
      if (leftRef.current) leftRef.current.style.transform = `translateY(${leftY}%)`

      animIdRef.current = requestAnimationFrame(animateBorder)
    }

    animIdRef.current = requestAnimationFrame(animateBorder)
    return () => cancelAnimationFrame(animIdRef.current)
  }, [speed])

  return (
    <div className={cn(
      'relative overflow-hidden rounded-2xl bg-[#0c1a10] border border-white/[0.08]',
      className
    )}>
      {/* Top border */}
      <div className="absolute top-0 left-0 w-full h-px overflow-hidden">
        <div ref={topRef} className={cn('absolute top-0 left-0 w-full h-full bg-gradient-to-r from-transparent to-transparent', topColor)} />
      </div>
      {/* Right border */}
      <div className="absolute top-0 right-0 w-px h-full overflow-hidden">
        <div ref={rightRef} className={cn('absolute top-0 left-0 w-full h-full bg-gradient-to-b from-transparent to-transparent', rightColor)} />
      </div>
      {/* Bottom border */}
      <div className="absolute bottom-0 left-0 w-full h-px overflow-hidden">
        <div ref={bottomRef} className={cn('absolute top-0 left-0 w-full h-full bg-gradient-to-r from-transparent to-transparent', bottomColor)} />
      </div>
      {/* Left border */}
      <div className="absolute top-0 left-0 w-px h-full overflow-hidden">
        <div ref={leftRef} className={cn('absolute top-0 left-0 w-full h-full bg-gradient-to-b from-transparent to-transparent', leftColor)} />
      </div>

      {children}
    </div>
  )
}
