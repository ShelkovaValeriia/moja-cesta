import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import '@fontsource-variable/manrope'
import './styles.css'
import './passenger.css'
import './driver.css'
import './location-time.css'
import './regular.css'
import './maps/application-map.css'
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
