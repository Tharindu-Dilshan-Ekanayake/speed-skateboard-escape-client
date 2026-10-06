import RAPIER from '@dimforge/rapier3d-compat'
import { Quaternion, Vector3 } from 'three'

import { moverPos } from '../shared/layout'
import { pipeWorldTriangles, wedgeHullPoints } from './geometry'

/**
 * Rapier world built from the shared layout. Only static colliders plus the
 * rider's capsule live here: the rider is moved by Rapier's kinematic character
 * controller, so there are no dynamic bodies to simulate.
 */

export const CAP_RADIUS = 0.35
export const CAP_HALF = 0.55
export const CAP_CENTER = CAP_RADIUS + CAP_HALF

let initPromise = null
export function initRapier() {
  if (!initPromise) initPromise = RAPIER.init()
  return initPromise
}

const _q = new Quaternion()
const _v = new Vector3()
const _z = new Vector3(0, 0, 1)

const yQuat = (ry) => ({ x: 0, y: Math.sin(ry / 2), z: 0, w: Math.cos(ry / 2) })

export class Physics {
  constructor(layout, spawn) {
    this.layout = layout
    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 })
    this.railByHandle = new Map()
    this.moverByHandle = new Map()
    this.movers = []
    this.rails = []
    this.build()

    this.player = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(CAP_HALF, CAP_RADIUS).setTranslation(spawn[0], spawn[1] + CAP_CENTER, spawn[2]),
    )
    const kcc = this.world.createCharacterController(0.04)
    kcc.setUp({ x: 0, y: 1, z: 0 })
    kcc.setMaxSlopeClimbAngle((58 * Math.PI) / 180)
    kcc.setMinSlopeSlideAngle((62 * Math.PI) / 180)
    kcc.enableAutostep(0.36, 0.15, false)
    kcc.enableSnapToGround(0.4)
    kcc.setSlideEnabled(true)
    kcc.setApplyImpulsesToDynamicBodies(false)
    this.kcc = kcc

    this.world.step()
  }

  build() {
    const { world, layout } = this
    const add = (desc) => world.createCollider(desc)

    for (const b of layout.boxes) {
      if (!b.collide) continue
      add(
        RAPIER.ColliderDesc.cuboid(b.s[0] / 2, b.s[1] / 2, b.s[2] / 2)
          .setTranslation(b.p[0], b.p[1], b.p[2])
          .setRotation(yQuat(b.ry)),
      )
    }

    for (const w of layout.wedges) {
      if (!w.collide) continue
      const desc = RAPIER.ColliderDesc.convexHull(wedgeHullPoints(w))
      if (desc) add(desc)
    }

    for (const c of layout.cylinders) {
      if (!c.collide) continue
      add(RAPIER.ColliderDesc.cylinder(c.height / 2, c.radius).setTranslation(c.p[0], c.p[1] + c.height / 2, c.p[2]))
    }

    for (const p of layout.pipes) {
      const verts = pipeWorldTriangles(p)
      const idx = new Uint32Array(verts.length / 3)
      for (let i = 0; i < idx.length; i += 1) idx[i] = i
      add(RAPIER.ColliderDesc.trimesh(verts, idx))
    }

    // Treadmill decks (low enough to auto-step onto) and console posts.
    for (const tm of layout.treadmills) {
      add(RAPIER.ColliderDesc.cuboid(1.9, 0.15, 3.4).setTranslation(tm.p[0], tm.p[1] + 0.15, tm.p[2]))
      for (const sx of [-1, 1]) {
        add(RAPIER.ColliderDesc.cuboid(0.12, 0.9, 0.12).setTranslation(tm.p[0] + sx * 1.75, tm.p[1] + 1.1, tm.p[2] - 3.3))
      }
    }

    // Reachable trees get trunk colliders; rim trees are out of reach.
    for (const t of layout.trees) {
      if (!t.collide) continue
      add(RAPIER.ColliderDesc.cuboid(0.8 * t.s, 4 * t.s, 0.8 * t.s).setTranslation(t.p[0], 4 * t.s, t.p[2]))
    }

    for (const r of layout.rails) {
      const a = new Vector3(...r.a)
      const b = new Vector3(...r.b)
      const dir = b.clone().sub(a)
      const len = dir.length()
      dir.normalize()
      const rail = { a, b, dir, len, def: r }
      this.rails.push(rail)
      if (!r.collider) continue
      _q.setFromUnitVectors(_z, dir)
      _v.copy(a).add(b).multiplyScalar(0.5)
      const col = add(
        RAPIER.ColliderDesc.cuboid(0.07, 0.07, len / 2)
          .setTranslation(_v.x, _v.y - 0.07, _v.z)
          .setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w }),
      )
      this.railByHandle.set(col.handle, rail)
    }

    for (const p of layout.props) {
      if (!p.collide) continue
      add(
        RAPIER.ColliderDesc.cuboid(p.s[0] / 2, p.s[1] / 2, p.s[2] / 2)
          .setTranslation(p.p[0], p.p[1] + p.s[1] / 2, p.p[2])
          .setRotation(yQuat(p.ry)),
      )
    }

    for (const m of layout.movers) {
      const col = add(RAPIER.ColliderDesc.cuboid(m.s[0] / 2, m.s[1] / 2, m.s[2] / 2).setTranslation(m.p[0], m.p[1], m.p[2]))
      const mover = { def: m, col, pos: [...m.p], delta: [0, 0, 0] }
      this.movers.push(mover)
      this.moverByHandle.set(col.handle, mover)
    }
  }

  /** Moves the platforms to their (server-clock) positions and refreshes queries. */
  updateMovers(t) {
    for (const m of this.movers) {
      const next = moverPos(m.def, t)
      m.delta = [next[0] - m.pos[0], next[1] - m.pos[1], next[2] - m.pos[2]]
      m.pos = next
      m.col.setTranslation({ x: next[0], y: next[1], z: next[2] })
    }
    this.world.step()
  }

  /** Casts a ray from the rider centre straight down. */
  groundProbe(feet, maxDist = 1.4) {
    const ray = new RAPIER.Ray({ x: feet.x, y: feet.y + CAP_CENTER, z: feet.z }, { x: 0, y: -1, z: 0 })
    return this.world.castRayAndGetNormal(ray, CAP_CENTER + maxDist, true, undefined, undefined, this.player)
  }

  /** Distance from `origin` along `dir` to the first solid, or `max`. Used by the camera. */
  rayDistance(origin, dir, max) {
    const ray = new RAPIER.Ray({ x: origin.x, y: origin.y, z: origin.z }, { x: dir.x, y: dir.y, z: dir.z })
    const hit = this.world.castRay(ray, max, true, undefined, undefined, this.player)
    return hit ? hit.timeOfImpact : max
  }

  /**
   * Reference-counted disposal. React StrictMode mounts, unmounts and re-mounts
   * effects in development, so freeing the WASM world immediately on cleanup would
   * pull it out from under the re-mounted scene. Release defers the free a tick
   * and a re-retain cancels it.
   */
  retain() {
    this.refs = (this.refs || 0) + 1
    clearTimeout(this.disposeTimer)
  }

  release() {
    this.refs = Math.max(0, (this.refs || 0) - 1)
    if (this.refs > 0) return
    clearTimeout(this.disposeTimer)
    this.disposeTimer = setTimeout(() => {
      if (this.refs > 0 || this.freed) return
      this.freed = true
      try {
        this.world.free()
      } catch {
        /* already freed */
      }
    }, 100)
  }
}
