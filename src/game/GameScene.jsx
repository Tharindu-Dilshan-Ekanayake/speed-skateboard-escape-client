import { Environment } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'

import { useBloxity } from '../bloxity/BloxityContext'
import FollowCamera from './FollowCamera'
import Ground from './Ground'
import Player from './Player'

/**
 * Fires `onFirstFrame` after the renderer has actually drawn once.
 * `loadingEnd()` should mean "the player can see the game", not "React mounted".
 */
function FirstFrameSignal({ onFirstFrame }) {
  const fired = useRef(false)
  useFrame(() => {
    if (fired.current) return
    fired.current = true
    onFirstFrame()
  })
  return null
}

export function GameScene() {
  const { game } = useBloxity()
  const playerBodyRef = useRef(null)

  const [avatarReady, setAvatarReady] = useState(false)
  const loadingEnded = useRef(false)

  const handleAvatarReady = useCallback(() => setAvatarReady(true), [])

  // Only end the loading screen once the avatar has finished assembling *and* a
  // frame has rendered with it in place.
  const handleFirstFrame = useCallback(() => {
    if (loadingEnded.current || !avatarReady) return
    loadingEnded.current = true
    game.loadingEnd()
  }, [avatarReady, game])

  // The first frame usually renders before the avatar finishes downloading, so the
  // frame callback alone isn't enough — close the loading screen here too.
  useEffect(() => {
    if (!avatarReady || loadingEnded.current) return
    loadingEnded.current = true
    game.loadingEnd()
  }, [avatarReady, game])

  useEffect(() => {
    game.loadingStep('Preparing scene…')
  }, [game])

  return (
    <Canvas
      shadows
      camera={{ position: [0, 5, 10], fov: 60 }}
      onCreated={({ gl }) => gl.setClearColor('#87ceeb')}
    >
      <hemisphereLight args={['#bfe3ff', '#3f5d3f', 0.8]} />
      <directionalLight
        castShadow
        position={[10, 20, 10]}
        intensity={1.8}
        shadow-mapSize={[2048, 2048]}
      />

      <Suspense fallback={null}>
        <Environment preset="city" />
        <Physics gravity={[0, -18, 0]}>
          <Ground />
          <Player
            bodyRef={playerBodyRef}
            position={[0, 3, 8]}
            onAvatarReady={handleAvatarReady}
          />
        </Physics>
      </Suspense>

      <FollowCamera bodyRef={playerBodyRef} />
      <FirstFrameSignal onFirstFrame={handleFirstFrame} />
    </Canvas>
  )
}

export default GameScene
