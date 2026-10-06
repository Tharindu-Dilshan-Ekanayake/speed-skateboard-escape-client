import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App.jsx'
import BloxityProvider from './bloxity/BloxityProvider.jsx'
import { audio } from './game/audio'
import { cameraRig } from './game/cameraRig'
import { net } from './net/session'
import { live, useGame } from './state/store'
import './index.css'

// Dev-only handle for automated playtests; stripped from production builds.
if (import.meta.env.DEV) window.__sse = { net, live, useGame, cameraRig, audio }

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* Slug comes from VITE_GAME_SLUG (see .env.example). */}
    <BloxityProvider gameSlug={import.meta.env.VITE_GAME_SLUG}>
      <App />
    </BloxityProvider>
  </StrictMode>,
)
