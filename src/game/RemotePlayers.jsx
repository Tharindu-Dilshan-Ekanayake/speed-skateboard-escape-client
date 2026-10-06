import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import { Vector3 } from 'three'

import { live } from '../state/store'
import Skater from './Skater'

/** Render ~110 ms in the past so there are always two snapshots to blend. */
const INTERP_DELAY = 110
const MAX_EXTRAPOLATE = 250

const _target = new Vector3()
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a))

function sample(buffer, t, out) {
  const n = buffer.length
  if (n === 0) return false
  if (t <= buffer[0].t || n === 1) {
    Object.assign(out, buffer[0])
    return true
  }
  const last = buffer[n - 1]
  if (t >= last.t) {
    // Briefly extrapolate along the last known velocity, then hold.
    const prev = buffer[n - 2]
    const span = Math.max(1, last.t - prev.t)
    const ahead = Math.min(MAX_EXTRAPOLATE, t - last.t) / span
    Object.assign(out, last)
    out.x = last.x + (last.x - prev.x) * ahead
    out.y = last.y + (last.y - prev.y) * Math.min(ahead, 0.5)
    out.z = last.z + (last.z - prev.z) * ahead
    return true
  }
  for (let i = n - 2; i >= 0; i -= 1) {
    const a = buffer[i]
    if (a.t <= t) {
      const b = buffer[i + 1]
      const u = (t - a.t) / Math.max(1, b.t - a.t)
      out.x = a.x + (b.x - a.x) * u
      out.y = a.y + (b.y - a.y) * u
      out.z = a.z + (b.z - a.z) * u
      out.ry = a.ry + wrapAngle(b.ry - a.ry) * u
      out.v = a.v + (b.v - a.v) * u
      out.a = b.a
      out.f = b.f
      return true
    }
  }
  return false
}

function RemoteRider({ id }) {
  const group = useRef(null)
  const snap = useRef({ x: 0, y: 0, z: 0, ry: 0, v: 0, a: 1, f: 0 })
  const placed = useRef(false)
  const motion = useRef({
    time: 0,
    speed: 0,
    maxSpeed: 20,
    grounded: true,
    grinding: false,
    pushing: false,
    treadmill: false,
    lean: 0,
    flips: 0,
    normal: new Vector3(0, 1, 0),
  })
  const [meta, setMeta] = useState(() => {
    const r = live.remotes.get(id)
    return r ? { name: r.name, board: r.board, trail: r.trail, glow: r.glow, rebirths: r.rebirths, look: r.look, lookParsed: r.lookParsed } : null
  })
  const metaRef = useRef(meta)

  useFrame((_, dt) => {
    const rec = live.remotes.get(id)
    const g = group.current
    if (!rec || !g) return

    const m0 = metaRef.current
    if (!m0 || m0.name !== rec.name || m0.board !== rec.board || m0.trail !== rec.trail || m0.glow !== rec.glow || m0.rebirths !== rec.rebirths || m0.look !== rec.look) {
      const next = { name: rec.name, board: rec.board, trail: rec.trail, glow: rec.glow, rebirths: rec.rebirths, look: rec.look, lookParsed: rec.lookParsed }
      metaRef.current = next
      setMeta(next)
    }

    const now = performance.now()
    const buf = rec.buffer
    while (buf.length > 2 && buf[1].t < now - INTERP_DELAY - 1000) buf.shift()
    const s = snap.current
    if (!sample(buf, now - INTERP_DELAY, s)) return

    _target.set(s.x, s.y, s.z)
    if (!placed.current || g.position.distanceTo(_target) > 8) {
      g.position.copy(_target)
      g.rotation.y = s.ry
      placed.current = true
    } else {
      g.position.lerp(_target, 1 - Math.pow(0.0004, dt))
      const prevRy = g.rotation.y
      g.rotation.y += wrapAngle(s.ry - g.rotation.y) * Math.min(1, dt * 12)
      const turn = wrapAngle(g.rotation.y - prevRy) / Math.max(dt, 1e-3)
      const m = motion.current
      m.lean += (Math.max(-1, Math.min(1, turn * 0.25)) - m.lean) * Math.min(1, dt * 6)
    }

    const m = motion.current
    m.time += dt
    m.speed = s.v
    m.grounded = (s.a & 1) === 1
    m.grinding = (s.a & 2) === 2
    m.treadmill = (s.a & 4) === 4
    m.pushing = (s.a & 8) === 8
    m.flips = s.f
    m.style = rec.style ?? 0
  })

  if (!meta) return null
  return (
    <group ref={group}>
      <Skater
        motionRef={motion}
        board={meta.board}
        trail={meta.trail}
        glow={meta.glow}
        name={meta.name}
        rebirths={meta.rebirths}
        equipped={meta.lookParsed?.equipped || null}
        proportions={meta.lookParsed?.proportions || null}
      />
    </group>
  )
}

/** Every other rider in this lobby who is in the same world as us. */
export function RemotePlayers({ world }) {
  const [ids, setIds] = useState([])

  useEffect(() => {
    const refresh = () => {
      const next = []
      for (const r of live.remotes.values()) if (r.world === world) next.push(r.id)
      next.sort()
      setIds((prev) => (prev.length === next.length && prev.every((v, i) => v === next[i]) ? prev : next))
    }
    refresh()
    const t = setInterval(refresh, 400)
    return () => clearInterval(t)
  }, [world])

  return ids.map((id) => <RemoteRider key={id} id={id} />)
}

export default RemotePlayers
