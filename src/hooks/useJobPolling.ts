import { useEffect, useRef } from 'react'

interface UseJobPollingOptions {
  enabled: boolean
  onPoll: () => Promise<void>
  intervalMs?: number
}

export function useJobPolling({ enabled, onPoll, intervalMs = 3000 }: UseJobPollingOptions) {
  const onPollRef = useRef(onPoll)
  onPollRef.current = onPoll

  useEffect(() => {
    if (!enabled) return

    const id = setInterval(() => {
      onPollRef.current()
    }, intervalMs)

    return () => clearInterval(id)
  }, [enabled, intervalMs])
}
