import { useEffect, useRef } from 'react'

/** Shows the Histats counter widget here while mounted; returns it to its hidden holder on unmount. */
export function HistatsCounter() {
  const slot = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = document.getElementById('histats_counter')
    const holder = document.getElementById('histats_holder')
    if (!el || !slot.current) return
    slot.current.appendChild(el)
    return () => { holder?.appendChild(el) }
  }, [])
  return <div ref={slot} className="mt-3 min-h-[25px]" aria-label="site stats" />
}
