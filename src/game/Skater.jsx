import { Billboard, Text, Trail } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Component, Suspense, useRef } from 'react'
import { Color, Quaternion, Vector3 } from 'three'

import { trailById } from '../shared/config'
import { audio } from './audio'
import BlockyAvatar from './BlockyAvatar'
import PlayerAvatar from './PlayerAvatar'
import Skateboard from './Skateboard'
import Underglow from './Underglow'
import { FONT_URL } from './World'

/** Falls back to the blocky rider when the Bloxity avatar can't load. */
class AvatarBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {}
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

const UP = new Vector3(0, 1, 0)
const _n = new Vector3()
const _q = new Quaternion()
const _rainbow = new Color()

const TRICK_TIME = 0.5
const PUSH_TIME = 0.78
/** Body yaw on the board: sideways when cruising, nearly forward while pushing. */
const STANCE_RIDE = [-1.45, -1.35, -1.2]
const STANCE_PUSH = -0.45

/**
 * One skater: board (with tricks), avatar, name tag and trail. The parent moves
 * the outer group; this component animates everything inside it from
 * `motionRef`, a plain object updated every frame:
 *   { time, speed, maxSpeed, grounded, grinding, pushing, treadmill, lean,
 *     flips, normal: Vector3 }
 */
export function Skater({ motionRef, board, trail, glow = 0, name, rebirths = 0, equipped, proportions, isLocal = false }) {
  const boardRef = useRef(null)
  const bodyRef = useRef(null)
  const trailTarget = useRef(null)
  const trailMat = useRef(null)
  const trick = useRef({ last: -1, t: 1, kind: 0 })
  const tilt = useRef(new Quaternion())
  const push = useRef({ t: -1, last: 0 })

  const trailDef = trailById(trail)

  useFrame((_, dt) => {
    const m = motionRef.current
    if (!m || !boardRef.current) return
    const tr = trick.current
    if (tr.last === -1) tr.last = m.flips
    if (m.flips !== tr.last) {
      tr.last = m.flips
      tr.t = 0
      tr.kind = m.flips % 3
      if (isLocal) audio.play('flip')
    }

    const b = boardRef.current
    // Tilt the board to the ground under it.
    _n.copy(m.normal || UP)
    _q.setFromUnitVectors(UP, _n)
    tilt.current.slerp(_q, 1 - Math.pow(0.001, dt))
    b.quaternion.copy(tilt.current)

    let lift = 0
    if (tr.t < TRICK_TIME) {
      tr.t += dt
      const u = Math.min(1, tr.t / TRICK_TIME)
      const ease = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2
      const spin = ease * Math.PI * 2
      if (tr.kind === 0) b.rotateZ(spin)
      else if (tr.kind === 1) b.rotateY(spin)
      else b.rotateZ(-spin)
      lift = Math.sin(u * Math.PI) * 0.35
    }
    if (!m.grounded && !m.grinding) lift += 0.12
    b.position.y = lift

    // Kick-push cycles: while accelerating / on a treadmill, and every few
    // seconds while cruising so riders never just stand on the board.
    const p = push.current
    const rolling = m.grounded && !m.grinding
    if (p.t < 0) {
      const cruisePush = rolling && m.speed > 1.5 && m.time - p.last > 2.6
      if (rolling && (m.pushing || m.treadmill || cruisePush)) p.t = 0
    } else {
      const before = p.t / PUSH_TIME
      p.t += dt
      const after = p.t / PUSH_TIME
      if (isLocal && before < 0.15 && after >= 0.15) audio.play('push')
      if (p.t >= PUSH_TIME || !rolling) {
        p.t = -1
        p.last = m.time
      }
    }
    m.pushU = p.t >= 0 ? p.t / PUSH_TIME : -1

    if (bodyRef.current) {
      const body = bodyRef.current
      body.position.y = 0.26 + lift * 0.6 + (m.grinding ? 0.02 : 0)
      const target = m.pushU >= 0 ? STANCE_PUSH : STANCE_RIDE[m.style ?? 0] ?? STANCE_RIDE[0]
      body.rotation.y += (target - body.rotation.y) * Math.min(1, dt * 9)
      // Lean into turns: with a sideways stance that is a roll along the board.
      body.rotation.z = -(m.lean || 0) * 0.12
    }
    if (trailMat.current && trailDef?.color === 'rainbow') {
      trailMat.current.color = _rainbow.setHSL((m.time * 0.25) % 1, 1, 0.55)
    }
  })

  const tagWidth = (name || '').length * 0.16
  const fallback = <BlockyAvatar motionRef={motionRef} />

  return (
    <group>
      <group ref={boardRef}>
        <group scale={1.4}>
          <Skateboard board={board} />
        </group>
        <mesh ref={trailTarget} position={[0, 0.16, -0.75]} visible={false}>
          <boxGeometry args={[0.01, 0.01, 0.01]} />
        </mesh>
      </group>
      <Underglow board={board} glow={glow} motionRef={motionRef} liftRef={boardRef} />
      {trailDef ? (
        <Trail
          target={trailTarget}
          width={1.4}
          length={6}
          decay={1}
          attenuation={(w) => w}
          color={trailDef.color === 'rainbow' ? '#ff66cc' : trailDef.color}
          ref={(mesh) => {
            trailMat.current = mesh?.material || null
          }}
        />
      ) : null}
      <group ref={bodyRef} position={[0, 0.26, 0]} rotation={[0, STANCE_RIDE[0], 0]}>
        <AvatarBoundary fallback={fallback}>
          <Suspense fallback={fallback}>
            <PlayerAvatar equipped={equipped} proportions={proportions} motionRef={motionRef} />
          </Suspense>
        </AvatarBoundary>
      </group>
      {name ? (
        <Billboard position={[0, 2.55, 0]}>
          <mesh position={[-tagWidth / 2 - 0.12, 0, 0]}>
            <circleGeometry args={[0.17, 20]} />
            <meshBasicMaterial color="#ff5a1f" />
          </mesh>
          <Text
            font={FONT_URL}
            position={[-tagWidth / 2 - 0.12, 0, 0.01]}
            fontSize={0.2}
            color="#ffffff"
            anchorX="center"
            anchorY="middle"
          >
            {String(rebirths)}
          </Text>
          <Text
            font={FONT_URL}
            position={[-tagWidth / 2 + 0.12, 0, 0]}
            fontSize={0.3}
            color="#ffffff"
            outlineColor="#1b1530"
            outlineWidth={0.035}
            anchorX="left"
            anchorY="middle"
          >
            {name}
          </Text>
        </Billboard>
      ) : null}
    </group>
  )
}

export default Skater
