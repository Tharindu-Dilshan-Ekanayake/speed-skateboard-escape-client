import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'

import { getWorlds } from '../shared/layout'
import { useGame } from '../state/store'
import Interactives from './Interactives'
import LocalPlayer from './LocalPlayer'
import Obstacles from './Obstacles'
import { Physics } from './physics'
import RemotePlayers from './RemotePlayers'
import Sky from './Sky'
import World from './World'

function FirstFrame({ onFirst }) {
  const done = useRef(false)
  useFrame(() => {
    if (done.current) return
    done.current = true
    onFirst?.()
  })
  return null
}

function Scene({ worldIndex, shadows, onFirstFrame }) {
  const layout = getWorlds()[worldIndex]
  const physics = useMemo(() => new Physics(layout, layout.spawn), [layout])
  const sun = useRef(null)
  const theme = layout.theme

  useEffect(() => {
    physics.retain()
    return () => physics.release()
  }, [physics])

  return (
    <>
      <color attach="background" args={[theme.sky[1]]} />
      <fog attach="fog" args={[theme.fog, 110, 330]} />
      <hemisphereLight args={[theme.sky[1], worldIndex === 0 ? '#8a7a9a' : '#2a1a4a', worldIndex === 0 ? 1.25 : 0.9]} />
      <ambientLight intensity={worldIndex === 0 ? 0.35 : 0.45} />
      <directionalLight
        ref={sun}
        castShadow={shadows}
        intensity={worldIndex === 0 ? 2.3 : 1.4}
        color={theme.sun}
        position={[30, 60, 20]}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-55}
        shadow-camera-right={55}
        shadow-camera-top={55}
        shadow-camera-bottom={-55}
        shadow-camera-near={1}
        shadow-camera-far={180}
        shadow-bias={-0.0005}
        shadow-normalBias={0.04}
      />
      <Sky theme={theme} ox={layout.ox} />
      <World layout={layout} shadows={shadows} />
      <Interactives layout={layout} />
      <Obstacles layout={layout} physics={physics} />
      <LocalPlayer key={worldIndex} layout={layout} physics={physics} sunRef={sun} />
      <RemotePlayers world={worldIndex} />
      <FirstFrame onFirst={onFirstFrame} />
    </>
  )
}

export function GameScene({ onFirstFrame }) {
  const world = useGame((s) => s.stats.world)
  const quality = useGame((s) => s.settings.quality)
  const high = quality === 'high'
  return (
    <Canvas
      key={high ? 'hq' : 'lq'}
      shadows={high ? 'percentage' : false}
      dpr={high ? [1, 1.75] : [0.75, 1]}
      gl={{ antialias: high, powerPreference: 'high-performance' }}
      camera={{ fov: 65, near: 0.1, far: 3000, position: [0, 6, 42] }}
      style={{ position: 'absolute', inset: 0, touchAction: 'none' }}
      onCreated={({ gl, scene }) => {
        if (import.meta.env.DEV && window.__sse) Object.assign(window.__sse, { gl, scene })
      }}
    >
      <Scene worldIndex={world} shadows={high} onFirstFrame={onFirstFrame} />
    </Canvas>
  )
}

export default GameScene
