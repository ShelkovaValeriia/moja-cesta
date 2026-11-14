import { createContext, useContext } from 'react'
import type { AppState } from './types'
import type { Action } from './domain'
export interface Store {
  state: AppState
  act: (action: Action, success?: string) => boolean
  reset: () => void
  toast: { message: string; error: boolean } | null
  dismissToast: () => void
  storageWarning: boolean
}
export const StoreContext = createContext<Store | null>(null)
export const useStore = () => {
  const value = useContext(StoreContext)
  if (!value) throw new Error('Chýba poskytovateľ údajov.')
  return value
}
