import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createInitialState } from './data'
import { transition } from './domain'
import type { Action } from './domain'
import type { AppState } from './types'
import { StoreContext } from './context'
import { loadState, restoreState, STORAGE_KEY as KEY } from './storage'
export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(loadState),
    ref = useRef(state)
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null)
  const [storageWarning, setStorageWarning] = useState(false)
  function save(next: AppState) {
    ref.current = next
    setState(next)
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
      setStorageWarning(false)
    } catch {
      setStorageWarning(true)
    }
  }
  useEffect(() => {
    function sync(e: StorageEvent) {
      if (e.key === KEY && e.newValue) {
        const next = loadState()
        ref.current = next
        setState(next)
      }
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])
  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 6000)
    return () => window.clearTimeout(id)
  }, [toast])
  function act(action: Action, success = 'Zmeny boli uložené.') {
    try {
      let current = ref.current
      if (action.type === 'savePerson') {
        try {
          const text = localStorage.getItem(KEY)
          if (text) current = restoreState(JSON.parse(text)) ?? current
        } catch {
          /* In-memory validation remains available. */
        }
      }
      save(transition(current, action))
      setToast({ message: success, error: false })
      return true
    } catch (e) {
      setToast({
        message: e instanceof Error ? e.message : 'Zmenu sa nepodarilo uložiť.',
        error: true,
      })
      return false
    }
  }
  return (
    <StoreContext.Provider
      value={{
        state,
        act,
        toast,
        dismissToast: () => setToast(null),
        storageWarning,
        reset: () => {
          save(createInitialState())
          setToast({ message: 'Demonštračné údaje boli obnovené.', error: false })
        },
      }}
    >
      {children}
    </StoreContext.Provider>
  )
}
