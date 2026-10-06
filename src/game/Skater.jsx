import { Billboard, Text, Trail } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Component, Suspense, useRef } from 'react'
import { Color, Quaternion, Vector3 } from 'three'

import { trailById } from '../shared/config'
import { audio } from './audio'
import BlockyAvatar from './BlockyAvatar'
import PlayerAvatar from './PlayerAvatar'
import Skateboard from './Skateboard'
import SlideFx from './SlideFx'
import TrackFx from './TrackFx'
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
/** One kick on the ground. Kicks come in pairs, then the rider rolls. */
const PUSH_TIME = 0.55
const KICKS_PER_SET = 2
/** Rolling time between kick pairs: shorter while speeding up or on a treadmill. */
const COAST_CRUISE = 1.7
const COAST_ACCEL = 0.45
/** Body yaw on the board: sideways when cruising, nearly forward while pushing. */
const STANCE_RIDE = [-0.3, -1.35, -1.2]
const STANCE_PUSH = -0.1
/** How far the arms spread out to the sides (radians from the body). */
const ARMS_RIDE = 0.32
const ARMS_KICK = 0.32 // same as riding: the arms only move forward/back
const ARMS_STAND = 0.12
/** In the air: straight out to both sides. */
const ARMS_AIR = 1.45

/**
 * One skater: board (with tricks), avatar, name tag and trail. The parent moves
 * the outer group; this component animates everything inside it from
 * `motionRef`, a plain object updated every frame:
 *   { time, speed, maxSpeed, grounded, grinding, pushing, treadmill, lean,
 *     flips, normal: Vector3 }
 */
export function Skater({ motionRef, board, trail, glow = 0, level = 0, name, equipped, proportions, isLocal = false }) {
  const rootRef = useRef(null)
  const boardRef = useRef(null)
  const bodyRef = useRef(null)
  const trailTarget = useRef(null)
  const trailMat = useRef(null)
  const trick = useRef({ last: -1, t: 1, kind: 0 })
  const tilt = useRef(new Quaternion())
  const push = useRef({ t: -1, last: -10, kicks: 0 })
  /** 0..1, eased: how far into a powerslide the board is. */
  const slide = useRef(0)

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
    if (window.__AIR) m.grounded = false // TEMP-DEBUG
    // Tilt the board to the ground under it.
    _n.copy(m.normal || UP)
    _q.setFromUnitVectors(UP, _n)
    tilt.current.slerp(_q, 1 - Math.pow(0.001, dt))
    b.quaternion.copy(tilt.current)
    // Powerslide: swing the board ~70° sideways while braking.
    const sl = slide.current + ((m.braking ? 1 : 0) - slide.current) * Math.min(1, dt * (m.braking ? 14 : 7))
    slide.current = sl
    if (sl > 0.001) b.rotateY(sl * 1.2)

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

    // Kick-push rhythm: two kicks on the ground, roll a while, two kicks again.
    const p = push.current
    const rolling = m.grounded && !m.grinding && !m.braking
    const wantsPush = rolling && (m.pushing || m.treadmill || m.speed > 1.5)
    if (p.t < 0) {
      const gap = m.pushing || m.treadmill ? COAST_ACCEL : COAST_CRUISE
      if (wantsPush && m.time - p.last > gap) {
        // Standing with a foot already on the ground: start mid-kick, pushing.
        p.t = (m.idle || 0) > 0.5 ? PUSH_TIME * 0.2 : 0
        p.kicks = KICKS_PER_SET
      }
    } else {
      const before = p.t / PUSH_TIME
      p.t += dt
      const after = p.t / PUSH_TIME
      if (isLocal && before < 0.22 && after >= 0.22) audio.play('push')
      if (!rolling) {
        p.t = -1
        p.last = m.time
      } else if (p.t >= PUSH_TIME) {
        p.kicks -= 1
        if (p.kicks > 0) {
          p.t = 0
        } else {
          p.t = -1
          p.last = m.time
        }
      }
    }
    m.pushU = p.t >= 0 ? p.t / PUSH_TIME : -1

    // Standing still (Street style): step one foot off onto the ground.
    const standing = (m.style ?? 0) === 0 && rolling && p.t < 0 && !m.pushing && !m.treadmill && m.speed < 0.5
    const idle = m.idle || 0
    m.idle = standing ? Math.min(1, idle + dt * 2.5) : Math.max(0, idle - dt * 8)

    // Arms: held low and a little out while rolling, closer in while kicking,
    // relaxed by the sides when standing. Eased so they never snap.
    const airborne = !m.grounded && !m.grinding
    const armTarget = airborne
      ? ARMS_AIR
      : m.pushU >= 0
        ? ARMS_KICK
        : m.idle > 0.5
          ? ARMS_STAND
          : m.speed > 0.5
            ? ARMS_RIDE
            : ARMS_STAND
    // Snappy on take-off and landing, gentle otherwise.
    const armRate = airborne ? 20 : m.arms > ARMS_RIDE + 0.05 ? 10 : 5
    m.arms = m.arms == null ? armTarget : m.arms + (armTarget - m.arms) * Math.min(1, dt * armRate)

    if (bodyRef.current) {
      const body = bodyRef.current
      body.position.y = 0.26 + lift * 0.6 + (m.grinding ? 0.02 : 0)
      const stance = m.pushU >= 0 || m.idle > 0.01 ? STANCE_PUSH : STANCE_RIDE[m.style ?? 0] ?? STANCE_RIDE[0]
      // The body turns with the board in a powerslide, crouches and leans back.
      const target = stance + slide.current * 1.2
      body.rotation.y += (target - body.rotation.y) * Math.min(1, dt * 12)
      body.position.y -= slide.current * 0.12
      body.rotation.x = -slide.current * 0.28
      // Lean into turns: with a sideways stance that is a roll along the board.
      body.rotation.z = -(m.lean || 0) * 0.12
    }
    if (trailMat.current && trailDef?.color === 'rainbow') {
      trailMat.current.color = _rainbow.setHSL((m.time * 0.25) % 1, 1, 0.55)
    }
  })

  const fallback = <BlockyAvatar motionRef={motionRef} />

  return (
    <group ref={rootRef}>
      <TrackFx rootRef={rootRef} motionRef={motionRef} board={board} trail={trail} glow={glow} level={level} />
      <group ref={boardRef}>
        <group scale={1.4}>
          <Skateboard board={board} />
        </group>
        <mesh ref={trailTarget} position={[0, 0.16, -0.75]} visible={false}>
          <boxGeometry args={[0.01, 0.01, 0.01]} />
        </mesh>
      </group>
      <Underglow board={board} glow={glow} motionRef={motionRef} liftRef={boardRef} level={level} />
      <SlideFx motionRef={motionRef} anchorRef={boardRef} />
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
        <Billboard position={[0, 2.45, 0]}>
          <Text
            font={FONT_URL}
            fontSize={0.22}
            color="#ffffff"
            outlineColor="#1b1530"
            outlineWidth={0.03}
            anchorX="center"
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
