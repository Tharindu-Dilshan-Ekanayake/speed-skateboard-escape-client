import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'

/**
 * Classic blocky rider. Shown while the Bloxity avatar downloads, and kept if
 * it can't be loaded, so a rider is never invisible.
 */
export function BlockyAvatar({ motionRef, shirt = '#1d1d24', pants = '#24323a', skin = '#f5cd8c' }) {
  const hips = useRef(null)
  const legL = useRef(null)
  const legR = useRef(null)
  const armL = useRef(null)
  const armR = useRef(null)
  const torso = useRef(null)

  useFrame(() => {
    const m = motionRef?.current
    if (!m || !hips.current) return
    const ratio = Math.min(1, (m.speed || 0) / Math.max(1, m.maxSpeed || 10))
    const u = m.pushU ?? -1
    // legL is the back (pushing) leg, legR the front leg; spread = along the board.
    const style = m.style ?? 0
    let drop = style === 0 ? 0.26 + ratio * 0.08 : style === 2 ? 0.06 : 0.12 + ratio * 0.08
    let back = style === 0 ? -0.55 : style === 2 ? -0.12 : -0.3
    let front = back
    let spread = style === 0 ? 0.38 : 0.28
    let arm = style === 0 ? 1.0 : style === 2 ? 0.2 : 0.7 + ratio * 0.3
    let armSwing = 0
    if (m.grinding) {
      drop = 0.28
      arm = 1.3
    } else if (!m.grounded) {
      drop = 0.25
      back = -0.9
      front = -0.9
      arm = 1.15
    } else if (m.braking) {
      drop = 0.32
      back = -0.85
      front = -0.6
      spread = 0.42
      arm = 1.25
    } else if (u >= 0) {
      spread = 0.08
      front = -0.55
      if (u < 0.15) back = 0.1 - 0.5 * (u / 0.15)
      else if (u < 0.62) back = -0.4 + 1.2 * ((u - 0.15) / 0.47)
      else back = 0.8 - 1.1 * ((u - 0.62) / 0.38)
      drop = u < 0.62 ? 0.3 : 0.18
      arm = 0.35
      armSwing = back * 0.4
    }
    hips.current.position.y = 0.95 - drop
    legL.current.rotation.x = back
    legR.current.rotation.x = front
    legL.current.rotation.z = -spread
    legR.current.rotation.z = spread
    // Arms hinge outward: the -x arm rotates negatively about Z, the +x arm positively.
    armL.current.rotation.z = -arm
    armR.current.rotation.z = arm
    armL.current.rotation.x = armSwing
    armR.current.rotation.x = -armSwing
    torso.current.rotation.x = 0.15 + ratio * 0.12
    torso.current.rotation.z = (m.lean || 0) * 0.3
  })

  return (
    <group ref={hips} position={[0, 0.95, 0]}>
      <group ref={legL} position={[-0.17, 0, 0]}>
        <mesh position={[0, -0.45, 0]} castShadow>
          <boxGeometry args={[0.3, 0.9, 0.3]} />
          <meshStandardMaterial color={pants} />
        </mesh>
      </group>
      <group ref={legR} position={[0.17, 0, 0]}>
        <mesh position={[0, -0.45, 0]} castShadow>
          <boxGeometry args={[0.3, 0.9, 0.3]} />
          <meshStandardMaterial color={pants} />
        </mesh>
      </group>
      <group ref={torso}>
        <mesh position={[0, 0.42, 0]} castShadow>
          <boxGeometry args={[0.66, 0.84, 0.33]} />
          <meshStandardMaterial color={shirt} />
        </mesh>
        <mesh position={[0, 1.05, 0]} castShadow>
          <boxGeometry args={[0.42, 0.42, 0.42]} />
          <meshStandardMaterial color={skin} />
        </mesh>
        <mesh position={[0, 1.3, -0.03]}>
          <boxGeometry args={[0.46, 0.14, 0.47]} />
          <meshStandardMaterial color="#c4521c" />
        </mesh>
        <group ref={armL} position={[-0.33, 0.78, 0]}>
          <mesh position={[-0.15, -0.38, 0]} castShadow>
            <boxGeometry args={[0.3, 0.84, 0.3]} />
            <meshStandardMaterial color={skin} />
          </mesh>
        </group>
        <group ref={armR} position={[0.33, 0.78, 0]}>
          <mesh position={[0.15, -0.38, 0]} castShadow>
            <boxGeometry args={[0.3, 0.84, 0.3]} />
            <meshStandardMaterial color={skin} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

export default BlockyAvatar
