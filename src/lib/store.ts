import { useSyncExternalStore } from 'react'

/** Tiny observable store for cross-component runtime state (not persisted). */
export function createStore<T>(initial: T) {
  let state = initial
  const subs = new Set<() => void>()
  return {
    get: () => state,
    set(next: T | ((s: T) => T)) {
      state = typeof next === 'function' ? (next as (s: T) => T)(state) : next
      subs.forEach((f) => f())
    },
    subscribe(f: () => void) {
      subs.add(f)
      return () => subs.delete(f)
    },
    use(): T {
      return useSyncExternalStore(this.subscribe, this.get, this.get)
    },
  }
}
