import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/manrope'
import { FullscreenDemo } from './FullscreenDemo'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FullscreenDemo />
  </StrictMode>,
)
