import { Canvas, useFrame, useThree } from '@react-three/fiber'
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

/**
 * Prepares every shader and texture on the GPU while the loading screen is up.
 * Without this, the first time a stage's cars, Granny, signs or VIP pads come
 * into view the browser compiles their shaders mid-ride and the game freezes
 * for a moment. Hidden (far-away) objects are briefly un-hidden so they are
 * included, then restored.
 */
function Warmup({ layoutKey, onDone }) {
  const { gl, scene, camera } = useThree()
  const frames = useRef(0)
  const done = useRef(null)
  useFrame(() => {
    if (done.current === layoutKey) return
    frames.current += 1
    if (frames.current < 3) return
    done.current = layoutKey
    frames.current = 0
    const hidden = []
    scene.traverse((o) => {
      if (!o.visible) {
        hidden.push(o)
        o.visible = true
      }
    })
    try {
      gl.compile(scene, camera)
      scene.traverse((o) => {
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
        for (const m of mats) for (const key of ['map', 'emissiveMap']) if (m[key]) gl.initTexture(m[key])
      })
    } catch (err) {
      console.warn('[warmup] precompile failed', err)
    }
    for (const o of hidden) o.visible = false
    // Report after the next frame has actually been drawn.
    requestAnimationFrame(() => onDone?.())
  })
  return null
}

function Scene({ worldIndex, shadows, onFirstFrame, onReady }) {
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
      <fog attach="fog" args={[theme.fog, 170, 500]} />
      {/* Roblox-like daylight. Lights add up on a surface, so they are kept to a
          total of about 1 on sunlit tops: colours stay rich instead of washing
          out to white, and shaded sides are visibly darker. */}
      <hemisphereLight args={[worldIndex === 0 ? '#d8ecff' : '#8a7ad8', worldIndex === 0 ? '#8a7458' : '#2a1a4a', worldIndex === 0 ? 0.72 : 0.6]} />
      <ambientLight intensity={worldIndex === 0 ? 0.16 : 0.2} />
      <directionalLight
        ref={sun}
        castShadow={shadows}
        intensity={worldIndex === 0 ? 1.55 : 0.9}
        color={theme.sun}
        position={[40, 55, 30]}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-48}
        shadow-camera-right={48}
        shadow-camera-top={48}
        shadow-camera-bottom={-48}
        shadow-camera-near={1}
        shadow-camera-far={160}
        shadow-bias={-0.0004}
        shadow-normalBias={0.05}
        shadow-radius={4}
        shadow-intensity={worldIndex === 0 ? 0.55 : 0.7}
      />
      <Sky theme={theme} ox={layout.ox} />
      <World layout={layout} shadows={shadows} physics={physics} />
      <Interactives layout={layout} />
      <Obstacles layout={layout} physics={physics} />
      <LocalPlayer key={worldIndex} layout={layout} physics={physics} sunRef={sun} />
      <RemotePlayers world={worldIndex} />
      <Warmup layoutKey={worldIndex} onDone={onReady} />
      <FirstFrame onFirst={onFirstFrame} />
    </>
  )
}

export function GameScene({ onFirstFrame, onReady }) {
  const world = useGame((s) => s.stats.world)
  const quality = useGame((s) => s.settings.quality)
  const high = quality === 'high'
  return (
    <Canvas
      key={high ? 'hq' : 'lq'}
      shadows={high ? 'percentage' : false}
      flat
      dpr={high ? [1, 1.5] : [0.75, 1]}
      gl={{ antialias: high, powerPreference: 'high-performance' }}
      camera={{ fov: 65, near: 0.4, far: 520, position: [0, 6, 42] }}
      style={{ position: 'absolute', inset: 0, touchAction: 'none' }}
      onCreated={({ gl, scene }) => {
        if (import.meta.env.DEV && window.__sse) Object.assign(window.__sse, { gl, scene })
      }}
    >
      <Scene worldIndex={world} shadows={high} onFirstFrame={onFirstFrame} onReady={onReady} />
    </Canvas>
  )
}

export default GameScene
