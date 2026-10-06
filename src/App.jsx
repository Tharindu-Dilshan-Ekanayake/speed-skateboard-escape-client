import { useCallback, useEffect, useState } from 'react'

import { useBloxity } from './bloxity/BloxityContext'
import { audio } from './game/audio'
import { installKeyboard } from './game/controls'
import { net } from './net/session'
import { getWorlds } from './shared/layout'
import { useGame } from './state/store'
import Hud from './ui/Hud'
import LoadingScreen, { KickedScreen } from './ui/LoadingScreen'

function App() {
  const phase = useGame((s) => s.phase)
  const { game } = useBloxity()
  // The 3D scene component, once the engine chunk has loaded.
  const [Scene, setScene] = useState(null)

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
      // Wake the server and sign in WHILE the scene below is being built, instead
      // of waiting for it first: the two used to run one after the other.
      net.prewarm()
      net.start()
      game.loadingStep('Loading physics…')
      const engine = await import('./game/engine')
      if (cancelled) return
      store.setLoading(0.15, 'Loading physics…')
      await engine.initRapier()
      if (cancelled) return
      store.setLoading(0.25, 'Building the skatepark…')
      game.loadingStep('Building the skatepark…')
      getWorlds()
      await engine.preloadText()
      if (cancelled) return
      store.setLoading(0.35, 'Painting the ramps…')
      setScene(() => engine.GameScene)
    })()

    return () => {
      cancelled = true
    }
  }, [game])

  useEffect(() => {
    if (phase === 'playing') game.loadingEnd()
  }, [phase, game])

  const onFirstFrame = useCallback(() => {
    useGame.getState().setLoading(0.6, 'Almost there…')
  }, [])

  // The scene counts as ready once its shaders are compiled (see Warmup).
  const onSceneReady = useCallback(() => useGame.getState().markReady('scene'), [])

  return (
    <div className="app-root">
      {Scene ? <Scene onFirstFrame={onFirstFrame} onReady={onSceneReady} /> : null}
      {phase === 'playing' ? <Hud /> : null}
      {phase === 'kicked' ? <KickedScreen /> : <LoadingScreen />}
    </div>
  )
}

export default App
