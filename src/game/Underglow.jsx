import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, CanvasTexture, Color, MeshBasicMaterial, SRGBColorSpace } from 'three'

import { boardById, boardGlowColor, glowById } from '../shared/config'

/**
 * Coloured light pool under a skateboard plus a bright neon strip along the
 * underside of the deck. Every board has its own colour; an equipped glow
 * (bought in the shop) replaces it and may pulse, flicker, sparkle or cycle the
 * rainbow. Brighter while rolling, dim when standing still.
 */

let poolTex = null
function getPoolTexture() {
  if (poolTex) return poolTex
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 128
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  poolTex = new CanvasTexture(c)
  poolTex.colorSpace = SRGBColorSpace
  return poolTex
}

const _c = new Color()

/**
 * Levels 0-8 only get a faint, small glow. It grows brighter and larger as you
 * level up, and a more expensive board shines a bit stronger than a cheap one.
 */
function strength(level, tier) {
  const lf = Math.min(1, Math.max(0, (level - 8) / 15))
  return (0.22 + 0.78 * lf) * (0.65 + 0.35 * (tier / 14))
}

export function Underglow({ board, glow, motionRef, liftRef, level: riderLevel = 0 }) {
  const pool = useRef(null)
  const strip = useRef(null)
  const level = useRef(0.4)
  const def = glowById(glow)
  const base = def ? def.color : boardGlowColor(boardById(board))
  const fx = def ? def.fx : 'steady'

  const mats = useMemo(
    () => ({
      pool: new MeshBasicMaterial({ map: getPoolTexture(), transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false }),
      strip: new MeshBasicMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false }),
    }),
    [],
  )

  useFrame((state, dt) => {
    const m = motionRef.current
    const t = state.clock.elapsedTime
    const moving = m && (m.speed > 1 || m.treadmill)
    const target = moving ? 1 : 0.35
    level.current += (target - level.current) * Math.min(1, dt * 4)
    const power = strength(riderLevel, boardById(board).tier)
    let k = level.current * power
    if (fx === 'pulse') k *= 0.65 + Math.sin(t * 4) * 0.35
    else if (fx === 'flicker') k *= 0.75 + Math.sin(t * 23) * 0.12 + Math.sin(t * 37) * 0.13
    else if (fx === 'sparkle') k *= 0.8 + (Math.sin(t * 15) > 0.85 ? 0.4 : 0)
    if (base === 'rainbow') _c.setHSL((t * 0.25) % 1, 1, 0.55)
    else _c.set(base)
    // In the air the pool fades as the board leaves the ground.
    const air = m && !m.grounded && !m.grinding ? 0.4 : 1
    mats.pool.color.copy(_c).multiplyScalar(k * 0.9 * air)
    mats.strip.color.copy(_c).multiplyScalar(0.25 + k * 0.9)
    if (pool.current) {
      const s = 1 + (moving ? Math.sin(t * 6) * 0.04 : 0)
      const size = 0.8 + 0.7 * power
      pool.current.scale.set(1.5 * size * s, 2.3 * size * s, 1)
    }
    if (strip.current && liftRef?.current) strip.current.position.y = liftRef.current.position.y + 0.085
  })

  return (
    <group>
      <mesh ref={pool} material={mats.pool} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} renderOrder={3}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <mesh ref={strip} material={mats.strip} position={[0, 0.085, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}>
        <planeGeometry args={[0.32, 1.05]} />
      </mesh>
    </group>
  )
}

export default Underglow
