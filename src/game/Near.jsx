import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'

export const DRAW_DISTANCE = 300

/**
 * Hides its children when the camera is farther than `radius` from `at`.
 * The course is ~2 km long; without this every treadmill, pad, sign and granny
 * on it would be drawn every frame. Checked every 8 frames, staggered.
 */
export function Near({ at, radius = DRAW_DISTANCE, children }) {
  const ref = useRef(null)
  const tick = useRef(-1)
  useFrame(({ camera }) => {
    if (tick.current < 0) tick.current = Math.floor(Math.random() * 8)
    tick.current = (tick.current + 1) % 8
    if (tick.current !== 0 || !ref.current) return
    const dx = camera.position.x - at[0]
    const dz = camera.position.z - at[2]
    ref.current.visible = dx * dx + dz * dz < radius * radius
  })
  return <group ref={ref}>{children}</group>
}

export default Near
