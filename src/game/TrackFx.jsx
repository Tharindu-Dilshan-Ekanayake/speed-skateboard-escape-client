import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  Euler,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from 'three'

import { boardById, boardGlowColor, glowById, trailById } from '../shared/config'
import { levelFactor, styleForTier } from './fxStyle'

/**
 * Rider trail: a ribbon of light on the ground (and through the air when
 * jumping), drawn on every screen so other players see the path you took.
 *
 * What it looks like depends on two things:
 *
 *  LEVEL   Levels 0-8 only leave a thin, faint path. From level 9 the ribbon
 *          grows wider, brighter and longer-lasting, and the effects below start
 *          to appear. `levelF` (0..1) is how far along that is.
 *
 *  BOARD   The more expensive the skateboard, the fancier the effect:
 *            cheap boards   plain ribbon
 *            mid            glitter
 *            then           fire embers
 *            then           electric sparks
 *            then           butterflies
 *            top boards     rainbow ribbon + glitter
 *          A trail or glow bought in the shop overrides the colour.
 */

const COUNT = 150
const SEG = 0.45
const PARTS = 120
const _m = new Matrix4()
const _q = new Quaternion()
const _qy = new Quaternion()
const _qz = new Quaternion()
const _e = new Euler(0, 0, 0, 'YXZ')
const _p = new Vector3()
const _s = new Vector3()
const _c = new Color()
const _g = new Color()
const _k = new Color()
const _root = new Vector3()
const _hsl = { h: 0, s: 0, l: 0 }
const WHITE = new Color('#ffffff')
const AXIS_Z = new Vector3(0, 0, 1)
const AXIS_Y = new Vector3(0, 1, 0)

const FIRE = ['#ffe14d', '#ff9a1f', '#ff4a1f', '#ffd27a'].map((h) => new Color(h))
const BOLT = ['#aef0ff', '#ffffff', '#7fdcff'].map((h) => new Color(h))
const WING = ['#ff8ad8', '#ffd21f', '#7de8ff', '#b88aff', '#8cff9e'].map((h) => new Color(h))

/** Soft-edged strip: bright in the middle, transparent at the edges. */
function stripTexture(vertical) {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 64
  const g = c.getContext('2d')
  const grad = vertical ? g.createLinearGradient(0, 0, 0, 64) : g.createLinearGradient(0, 0, 64, 0)
  grad.addColorStop(0, 'rgba(255,255,255,0)')
  grad.addColorStop(0.3, 'rgba(255,255,255,0.55)')
  grad.addColorStop(0.5, 'rgba(255,255,255,1)')
  grad.addColorStop(0.7, 'rgba(255,255,255,0.55)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  return tex
}

let shared = null
function getShared() {
  if (shared) return shared
  const mat = (tex, opacity) =>
    new MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8, toneMapped: false, side: 2 })
  shared = {
    flat: new PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    upright: new PlaneGeometry(1, 1).rotateY(Math.PI / 2),
    box: new BoxGeometry(1, 1, 1),
    glow: mat(stripTexture(false), 0.8),
    core: mat(stripTexture(false), 1),
    curtain: mat(stripTexture(true), 0.55),
    part: new MeshBasicMaterial({ toneMapped: false, side: 2 }),
  }
  return shared
}

/**
 * Base colour of the ribbon. A bought trail or glow wins; otherwise the style
 * picks a theme colour (fire = orange, electric = blue...) and plain boards use
 * their own colour. `seed` varies it along the ribbon for rainbows.
 */
function baseColor(spec, style, seed, out) {
  const trail = trailById(spec.trail)
  if (trail) return trail.color === 'rainbow' ? out.setHSL((seed * 0.04) % 1, 1, 0.55) : out.set(trail.color)
  const glow = glowById(spec.glow)
  if (glow) return glow.color === 'rainbow' ? out.setHSL((seed * 0.04) % 1, 1, 0.55) : out.set(glow.color)
  if (style === 'rainbow') return out.setHSL((seed * 0.04) % 1, 1, 0.55)
  if (style === 'fire') return out.set('#ff6a1f')
  if (style === 'electric') return out.set('#43c8ff')
  if (style === 'butterflies') return out.set('#ff8ad8')
  return out.set(boardGlowColor(boardById(spec.board)))
}

function makeInstanced(geometry, material, count) {
  const mesh = new InstancedMesh(geometry, material, count)
  mesh.frustumCulled = false
  mesh.renderOrder = 2
  _m.makeScale(0, 0, 0)
  for (let i = 0; i < count; i += 1) {
    mesh.setMatrixAt(i, _m)
    mesh.setColorAt(i, WHITE)
  }
  return mesh
}

const rand = (a, b) => a + Math.random() * (b - a)
const pickOne = (list) => list[Math.floor(Math.random() * list.length)]

export function TrackFx({ rootRef, motionRef, board, trail, glow, level = 0 }) {
  const scene = useThree((s) => s.scene)
  const meshes = useRef(null)
  const spec = useRef({ board, trail, glow, level })
  const segs = useRef(
    Array.from({ length: COUNT }, () => ({ alive: false, born: 0, life: 1, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, len: 1, w: 0.2, h: 0.4, lf: 0, color: new Color() })),
  )
  const parts = useRef(
    Array.from({ length: PARTS }, () => ({ kind: 'dot', life: 0, max: 1, p: new Vector3(), v: new Vector3(), size: 0.1, len: 1, yaw: 0, phase: 0, rot: new Quaternion() })),
  )
  const nextPart = useRef(0)
  const next = useRef(0)
  const last = useRef(null)
  const clock = useRef(0)
  const count = useRef(0)

  useEffect(() => {
    spec.current = { board, trail, glow, level }
  }, [board, trail, glow, level])

  useEffect(() => {
    const sh = getShared()
    const set = {
      glow: makeInstanced(sh.flat, sh.glow, COUNT),
      core: makeInstanced(sh.flat, sh.core, COUNT),
      curtain: makeInstanced(sh.upright, sh.curtain, COUNT),
      part: makeInstanced(sh.box, sh.part, PARTS),
    }
    set.part.renderOrder = 3
    for (const m of Object.values(set)) scene.add(m)
    meshes.current = set
    return () => {
      for (const m of Object.values(set)) scene.remove(m)
      meshes.current = null
    }
  }, [scene])

  /** Adds one particle; wings use two. Returns its index in the pool. */
  const emit = (set, init) => {
    const i = nextPart.current
    nextPart.current = (i + 1) % PARTS
    const pt = parts.current[i]
    pt.life = pt.max = init.max
    pt.kind = init.kind
    pt.size = init.size
    pt.len = init.len || 1
    pt.yaw = init.yaw || 0
    pt.phase = init.phase || 0
    pt.side = init.side || 0
    pt.p.copy(init.p)
    pt.v.copy(init.v)
    if (init.rot) pt.rot.copy(init.rot)
    set.part.setColorAt(i, init.color)
    return i
  }

  useFrame((_, dt) => {
    const root = rootRef.current
    const set = meshes.current
    const m = motionRef.current
    if (!root || !set || !m) return
    clock.current += dt
    const now = clock.current
    const { level: lv, board: bd } = spec.current
    const tier = boardById(bd).tier
    const style = styleForTier(tier)
    const lf = levelFactor(lv)
    const list = segs.current

    root.getWorldPosition(_root)
    const moving = m.speed > 1.5 || (!m.grounded && m.speed > 0.5)
    if (!moving) {
      last.current = null
    } else if (!last.current) {
      last.current = { x: _root.x, y: _root.y, z: _root.z }
    } else {
      const dx = _root.x - last.current.x
      const dy = _root.y - last.current.y
      const dz = _root.z - last.current.z
      const flat = Math.hypot(dx, dz)
      const dist = Math.hypot(flat, dy)
      if (dist > 8) {
        last.current = { x: _root.x, y: _root.y, z: _root.z } // teleport: no line across the map
      } else if (dist >= SEG) {
        const idx = next.current
        const sg = list[idx]
        next.current = (idx + 1) % COUNT
        const air = !m.grounded && !m.grinding
        sg.alive = true
        sg.born = now
        sg.lf = lf
        // Low levels: a faint thin path that is gone almost at once. Higher
        // levels: wider, brighter and longer-lasting.
        sg.life = 0.7 + 0.9 * lf
        sg.x = (_root.x + last.current.x) / 2
        sg.z = (_root.z + last.current.z) / 2
        sg.y = (_root.y + last.current.y) / 2 + (air ? 0.32 : 0.06)
        sg.yaw = Math.atan2(dx, dz)
        sg.pitch = -Math.atan2(dy, Math.max(flat, 0.001))
        sg.len = dist + 0.1
        sg.w = (0.2 + 0.55 * lf) * (m.braking ? 1.7 : 1)
        // The upright curtain only exists once you have levelled up.
        sg.h = (air ? 0.2 + 0.95 * lf : 0.08 + 0.45 * lf) * (lf > 0 ? 1 : 0)
        count.current += 1
        baseColor(spec.current, style, count.current, sg.color)

        // ---- style particles (rarer at low level, none at levels 0-8) ----
        if (lf > 0) {
          const burst = (n, prob) => {
            for (let k = 0; k < n; k += 1) if (Math.random() < prob * (0.25 + 0.75 * lf)) return true
            return false
          }
          const at = () => _p.set(sg.x + rand(-0.5, 0.5) * sg.w, sg.y + 0.08, sg.z + rand(-0.3, 0.3))
          if (style === 'glitter' || style === 'rainbow') {
            for (let n = 0; n < 2; n += 1) {
              if (!burst(1, 0.9)) continue
              _c.copy(sg.color).lerp(WHITE, rand(0.4, 0.85))
              if (style === 'rainbow') _c.setHSL(Math.random(), 1, 0.65)
              emit(set, { kind: 'dot', p: at(), v: new Vector3(rand(-0.8, 0.8), rand(0.6, 1.8), rand(-0.8, 0.8)), max: rand(0.4, 0.8), size: rand(0.07, 0.15), color: _c })
            }
          }
          if (style === 'fire') {
            for (let n = 0; n < 3; n += 1) {
              if (!burst(1, 0.9)) continue
              emit(set, { kind: 'ember', p: at(), v: new Vector3(rand(-0.5, 0.5), rand(1.2, 2.8), rand(-0.5, 0.5)), max: rand(0.4, 0.8), size: rand(0.1, 0.22), color: pickOne(FIRE) })
            }
          }
          if (style === 'electric') {
            for (let n = 0; n < 2; n += 1) {
              if (!burst(1, 0.9)) continue
              _q.setFromEuler(_e.set(rand(-0.8, 0.8), rand(0, Math.PI * 2), rand(-0.6, 0.6)))
              emit(set, { kind: 'bolt', p: at().add(_s.set(0, rand(0.1, 0.5), 0)), v: new Vector3(), max: rand(0.1, 0.24), size: 0.05, len: rand(0.5, 1.4), rot: _q, color: pickOne(BOLT) })
            }
          }
          if (style === 'butterflies' && burst(1, 0.55)) {
            const color = pickOne(WING)
            const origin = at().clone()
            origin.y = sg.y + rand(0.3, 0.7)
            const vel = new Vector3(rand(-0.7, 0.7), rand(0.3, 0.9), rand(-0.7, 0.7))
            const yaw = rand(0, Math.PI * 2)
            const phase = rand(0, 6.28)
            const size = rand(0.22, 0.34)
            for (const side of [-1, 1]) emit(set, { kind: 'wing', p: origin, v: vel, max: rand(1.0, 1.5), size, yaw, phase, side, color })
          }
        }
        last.current = { x: _root.x, y: _root.y, z: _root.z }
      }
    }

    // ---- ribbon ----
    for (let i = 0; i < COUNT; i += 1) {
      const sg = list[i]
      if (!sg.alive) continue
      const age = (now - sg.born) / sg.life
      if (age >= 1) {
        sg.alive = false
        _m.makeScale(0, 0, 0)
        for (const mesh of [set.glow, set.core, set.curtain]) mesh.setMatrixAt(i, _m)
        continue
      }
      // Narrows toward the tail. Higher levels also drift the hue and keep a
      // white-hot core; low levels stay a dim, plain colour.
      const k = 1 - age * age
      const grow = 0.15 + 0.85 * k
      sg.color.getHSL(_hsl)
      _g.setHSL((_hsl.h + 0.12 * sg.lf * age + 1) % 1, _hsl.s, Math.min(0.78, _hsl.l + 0.05 * (1 - age)))
      if (sg.lf <= 0) _g.multiplyScalar(0.7)
      set.glow.setColorAt(i, _g)
      set.curtain.setColorAt(i, _g)
      set.core.setColorAt(i, _k.copy(_g).lerp(WHITE, (0.35 + 0.5 * sg.lf) * (1 - 0.6 * age)))
      _q.setFromEuler(_e.set(sg.pitch, sg.yaw, 0))
      _p.set(sg.x, sg.y, sg.z)
      set.glow.setMatrixAt(i, _m.compose(_p, _q, _s.set(sg.w * grow, 1, sg.len)))
      set.core.setMatrixAt(i, _m.compose(_p, _q, _s.set(sg.w * 0.34 * grow, 1, sg.len)))
      if (sg.h > 0.001) {
        _p.y += sg.h * 0.45 * grow
        set.curtain.setMatrixAt(i, _m.compose(_p, _q, _s.set(1, sg.h * grow, sg.len)))
      } else {
        set.curtain.setMatrixAt(i, _m.makeScale(0, 0, 0))
      }
    }

    // ---- particles ----
    for (let i = 0; i < PARTS; i += 1) {
      const pt = parts.current[i]
      if (pt.life <= 0) {
        set.part.setMatrixAt(i, _m.makeScale(0, 0, 0))
        continue
      }
      pt.life -= dt
      const r = Math.max(0, pt.life / pt.max)
      if (r <= 0) {
        set.part.setMatrixAt(i, _m.makeScale(0, 0, 0))
        continue
      }
      pt.p.addScaledVector(pt.v, dt)
      if (pt.kind === 'dot') {
        pt.v.y -= 1.2 * dt
        const sz = pt.size * r
        _m.compose(pt.p, _q.identity(), _s.set(sz, sz, sz))
      } else if (pt.kind === 'ember') {
        pt.v.x += Math.sin(now * 9 + pt.phase) * 1.5 * dt
        const sz = pt.size * r
        _m.compose(pt.p, _q.setFromEuler(_e.set(now * 3, now * 4, 0)), _s.set(sz, sz, sz))
      } else if (pt.kind === 'bolt') {
        // Crackles: the length jumps around every frame.
        const len = pt.len * (0.45 + Math.random() * 0.8)
        _m.compose(pt.p, pt.rot, _s.set(pt.size, pt.size, len))
      } else {
        // Butterfly wing: flaps about the body axis and drifts.
        const flap = Math.sin(now * 16 + pt.phase) * 0.8 + 0.5
        pt.p.y += Math.sin(now * 4 + pt.phase) * 0.25 * dt
        _qy.setFromAxisAngle(AXIS_Y, pt.yaw)
        _qz.setFromAxisAngle(AXIS_Z, pt.side * flap)
        _q.copy(_qy).multiply(_qz)
        _p.set(pt.side * pt.size * 0.55, 0, 0).applyQuaternion(_q).add(pt.p)
        const fade = Math.min(1, r * 4)
        _m.compose(_p, _q, _s.set(pt.size * fade, 0.02, pt.size * 0.85 * fade))
      }
      set.part.setMatrixAt(i, _m)
    }

    for (const mesh of [set.glow, set.core, set.curtain, set.part]) {
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  })

  return null
}

export default TrackFx
