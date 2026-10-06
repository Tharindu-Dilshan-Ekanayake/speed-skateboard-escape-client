import { useCallback, useEffect, useState } from 'react'
import { preloadFont } from 'troika-three-text'

import { useBloxity } from './bloxity/BloxityContext'
import { audio } from './game/audio'
import { installKeyboard } from './game/controls'
import GameScene from './game/GameScene'
import { initRapier } from './game/physics'
import { FONT_URL } from './game/World'
import { net } from './net/session'
import { getWorlds } from './shared/layout'
import { useGame } from './state/store'
import Hud from './ui/Hud'
import LoadingScreen, { KickedScreen } from './ui/LoadingScreen'

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-.:!?/() ,\'x'

function preloadText() {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 6000)
    try {
      preloadFont({ font: FONT_URL, characters: GLYPHS }, () => {
        clearTimeout(timer)
        resolve()
      })
    } catch {
      clearTimeout(timer)
      resolve()
    }
  })
}

function App() {
  const phase = useGame((s) => s.phase)
  const { game } = useBloxity()
  const [sceneReady, setSceneReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    const store = useGame.getState()
    const { settings } = store
    audio.sfxOn = settings.sfx
    audio.musicOn = settings.music
    installKeyboard(() => audio.unlock())

    ;(async () => {
      store.setPhase('loading')
      store.setLoading(0.05, 'Waxing the boards…')
      game.loadingStep('Loading physics…')
      await initRapier()
      if (cancelled) return
      store.setLoading(0.35, 'Building the skatepark…')
      game.loadingStep('Building the skatepark…')
      getWorlds()
      await preloadText()
      if (cancelled) return
      store.setLoading(0.7, 'Painting the ramps…')
      setSceneReady(true)
      net.start()
    })()

    return () => {
      cancelled = true
    }
  }, [game])

  useEffect(() => {
    if (phase === 'playing') game.loadingEnd()
  }, [phase, game])

  const onFirstFrame = useCallback(() => {
    useGame.getState().setLoading(0.8, 'Finding a server…')
  }, [])

  return (
    <div className="app-root">
      {sceneReady ? <GameScene onFirstFrame={onFirstFrame} /> : null}
      {phase === 'playing' ? <Hud /> : null}
      {phase === 'kicked' ? <KickedScreen /> : <LoadingScreen />}
    </div>
  )
}

export default App
