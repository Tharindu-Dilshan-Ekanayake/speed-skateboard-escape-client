import { Vector3 } from 'three'

import { GRAVITY, JUMP_VELOCITY } from '../shared/config'
import { CAP_CENTER } from './physics'

/**
 * The local skater's movement model.
 *
 * Skateboard feel: speed builds up and bleeds off instead of snapping, the board
 * carves toward the stick direction, ramps launch you with the height you were
 * gaining, and landing on a rail locks you into a grind.
 */

const TURN_GROUND = 9
const TURN_AIR = 4
const ACCEL = 22
const BRAKE = 34
const COAST = 9
const COYOTE = 0.1
const JUMP_BUFFER = 0.14

const _dir = new Vector3()
const _tmp = new Vector3()

export class RiderController {
  constructor(physics, spawn, ry) {
    this.phys = physics
    this.pos = new Vector3(...spawn)
    this.heading = new Vector3(Math.sin(ry), 0, Math.cos(ry))
    this.speed = 0
    this.vy = 0
    this.ry = ry
    this.grounded = true
    this.groundVy = 0
    this.groundNormal = new Vector3(0, 1, 0)
    this.coyote = 0
    this.jumpBuffer = 0
    this.airTime = 0
    this.grind = null
    this.mover = null
    this.flips = 0
    this.pushing = false
    this.events = []
  }

  teleport(p, ry) {
    this.pos.set(p[0], p[1], p[2])
    this.ry = ry
    this.heading.set(Math.sin(ry), 0, Math.cos(ry))
    this.speed = 0
    this.vy = 0
    this.grind = null
    this.mover = null
    this.airTime = 0
    this.grounded = false
    this.syncCollider()
  }

  syncCollider() {
    this.phys.player.setTranslation({ x: this.pos.x, y: this.pos.y + CAP_CENTER, z: this.pos.z })
  }

  /**
   * @param {number} dt seconds
   * @param {{x:number,z:number,mag:number,jump:boolean}} input world-space stick
   * @param {number} maxSpeed top speed in m/s
   * @param {number} [carryScale] share of a moving platform's frame delta for this substep
   */
  update(dt, input, maxSpeed, carryScale = 1) {
    this.events.length = 0
    if (input.jump) this.jumpBuffer = JUMP_BUFFER
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt)

    if (this.grind) {
      this.updateGrind(dt, maxSpeed)
      return this.events
    }

    // ---- slopes: rolling downhill speeds you up, uphill slows you down ----
    const slope = this.grounded ? this.groundNormal.x * this.heading.x + this.groundNormal.z * this.heading.z : 0
    const downhill = slope > 0.05

    // ---- horizontal: carve the heading toward the stick, then accelerate ----
    const mag = Math.min(1, input.mag)
    if (mag > 0.05) {
      _dir.set(input.x, 0, input.z).normalize()
      const dot = Math.max(-1, Math.min(1, this.heading.dot(_dir)))
      const angle = Math.acos(dot)
      if (this.speed < 1.5 || angle < 0.001) {
        if (this.speed < 1.5) this.heading.copy(_dir)
      } else if (angle > 2.6 && this.grounded) {
        // Pulling back hard: brake, then flip around once slow.
        this.speed = Math.max(0, this.speed - BRAKE * dt)
      } else {
        const turn = Math.min(angle, (this.grounded ? TURN_GROUND : TURN_AIR) * dt)
        const cross = this.heading.x * _dir.z - this.heading.z * _dir.x
        const s = cross > 0 ? -turn : turn
        const c = Math.cos(s)
        const sn = Math.sin(s)
        const hx = this.heading.x * c + this.heading.z * sn
        const hz = -this.heading.x * sn + this.heading.z * c
        this.heading.set(hx, 0, hz).normalize()
      }
      const target = maxSpeed * mag
      if (this.speed < target) this.speed = Math.min(target, this.speed + (this.grounded ? ACCEL : ACCEL * 0.35) * dt)
      else this.speed = Math.max(target, this.speed - (downhill ? 0 : COAST) * dt)
      this.pushing = this.grounded && this.speed < target * 0.92
    } else {
      this.speed = Math.max(0, this.speed - (this.grounded ? COAST : 1.5) * dt)
      this.pushing = false
    }
    if (this.grounded && this.speed > 0.5) this.speed = Math.max(0, this.speed + GRAVITY * slope * 0.65 * dt)
    this.speed = Math.min(this.speed, maxSpeed * 1.45)

    // ---- vertical ----
    if (this.grounded) this.coyote = COYOTE
    else this.coyote = Math.max(0, this.coyote - dt)

    let jumped = false
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.vy = JUMP_VELOCITY + Math.max(0, this.groundVy) * 0.6
      this.grounded = false
      this.coyote = 0
      this.jumpBuffer = 0
      this.flips = (this.flips + 1) % 256
      this.mover = null
      jumped = true
      this.events.push('jump')
    }

    if (this.grounded) this.vy = -3
    else this.vy = Math.max(-45, this.vy - GRAVITY * dt)

    // Moving platform carry.
    let carryX = 0
    let carryZ = 0
    if (this.mover && this.grounded) {
      // The platform's per-frame delta, split across this frame's substeps.
      carryX = this.mover.delta[0] * carryScale
      carryZ = this.mover.delta[2] * carryScale
    }

    const desired = {
      x: this.heading.x * this.speed * dt + carryX,
      y: this.vy * dt,
      z: this.heading.z * this.speed * dt + carryZ,
    }

    const prevY = this.pos.y
    const wasGrounded = this.grounded
    const kcc = this.phys.kcc
    kcc.computeColliderMovement(this.phys.player, desired)
    const mv = kcc.computedMovement()
    let groundedNow = kcc.computedGrounded()

    // Walls: bleed speed when the controller could not take the full step.
    const want = Math.hypot(desired.x - carryX, desired.z - carryZ)
    const got = Math.hypot(mv.x - carryX, mv.z - carryZ)
    if (want > 0.0005 && got < want * 0.6) {
      this.speed *= Math.max(0.2, got / want)
      if (got > 0.0001) {
        _tmp.set(mv.x - carryX, 0, mv.z - carryZ).normalize()
        this.heading.lerp(_tmp, 0.5).normalize()
      }
    }

    this.pos.x += mv.x
    this.pos.y += mv.y
    this.pos.z += mv.z
    this.syncCollider()

    // Ground probe: normal (for board tilt), moving platforms and rails.
    const hit = this.phys.groundProbe(this.pos, 0.6)
    const probeDist = hit ? hit.timeOfImpact - CAP_CENTER : Infinity
    if (!groundedNow && this.vy <= 0 && probeDist < 0.08) groundedNow = true
    if (hit && probeDist < 0.35) {
      this.groundNormal.set(hit.normal.x, hit.normal.y, hit.normal.z)
      this.mover = this.phys.moverByHandle.get(hit.collider.handle) || null
      const rail = this.phys.railByHandle.get(hit.collider.handle)
      if (rail && !jumped && (this.vy <= 1 || wasGrounded)) {
        this.startGrind(rail)
        return this.events
      }
    } else {
      this.groundNormal.set(0, 1, 0)
      if (!groundedNow) this.mover = null
    }

    // While rising after a jump/launch, touching ground does not count.
    if (groundedNow && !jumped && (wasGrounded || this.vy <= 0)) {
      const vyNow = (this.pos.y - prevY) / Math.max(dt, 1e-4)
      this.groundVy = this.groundVy * 0.5 + vyNow * 0.5
      if (!wasGrounded) {
        if (this.airTime > 0.22) this.events.push('land')
        this.airTime = 0
      }
      this.grounded = true
      this.vy = 0
    } else {
      if (wasGrounded && !jumped) {
        // Rolled off an edge: keep the vertical speed the ramp was giving us.
        this.vy = this.groundVy > 0.5 ? this.groundVy : Math.min(0, this.groundVy)
      }
      if (mv.y < desired.y * 0.5 && this.vy > 0) this.vy = 0 // bonked a ceiling
      this.grounded = false
      this.airTime += dt
      this.groundVy = 0
      if (this.vy <= 2) this.tryCatchRail(dt)
    }

    if (this.speed > 0.3) this.ry = Math.atan2(this.heading.x, this.heading.z)
    return this.events
  }

  /* --------------------------------------------------------------- grinds */

  tryCatchRail() {
    for (const rail of this.phys.rails) {
      _tmp.copy(this.pos).sub(rail.a)
      const t = _tmp.dot(rail.dir)
      if (t < 0.2 || t > rail.len - 0.2) continue
      const px = rail.a.x + rail.dir.x * t
      const py = rail.a.y + rail.dir.y * t
      const pz = rail.a.z + rail.dir.z * t
      const dy = this.pos.y - py
      if (dy < -0.4 || dy > 0.45) continue
      if (Math.hypot(this.pos.x - px, this.pos.z - pz) > 0.55) continue
      this.startGrind(rail)
      return
    }
  }

  startGrind(rail) {
    _tmp.copy(this.pos).sub(rail.a)
    const t = Math.max(0, Math.min(rail.len, _tmp.dot(rail.dir)))
    const along = this.heading.x * rail.dir.x + this.heading.z * rail.dir.z
    const dir = along >= 0 ? 1 : -1
    this.grind = { rail, t, dir, speed: Math.max(6, this.speed * Math.max(0.6, Math.abs(along))) }
    this.grounded = false
    this.vy = 0
    this.airTime = 0
    this.events.push('grind')
    this.placeOnRail()
  }

  placeOnRail() {
    const g = this.grind
    const r = g.rail
    this.pos.set(r.a.x + r.dir.x * g.t, r.a.y + r.dir.y * g.t + 0.04, r.a.z + r.dir.z * g.t)
    this.heading.set(r.dir.x * g.dir, 0, r.dir.z * g.dir)
    if (this.heading.lengthSq() < 1e-6) this.heading.set(0, 0, -1)
    this.heading.normalize()
    this.ry = Math.atan2(this.heading.x, this.heading.z)
    this.syncCollider()
  }

  updateGrind(dt, maxSpeed) {
    const g = this.grind
    const r = g.rail
    // Downhill rails speed you up, uphill ones slow you down.
    g.speed += -GRAVITY * 0.45 * r.dir.y * g.dir * dt
    g.speed = Math.max(4, Math.min(maxSpeed * 1.35, g.speed))
    g.t += g.dir * g.speed * dt
    this.speed = g.speed

    const off = g.t < 0 || g.t > r.len
    if (this.jumpBuffer > 0 || off) {
      g.t = Math.max(0, Math.min(r.len, g.t))
      this.placeOnRail()
      const popped = this.jumpBuffer > 0
      this.vy = popped ? JUMP_VELOCITY * 0.85 : Math.max(1.5, r.dir.y * g.dir * g.speed + 1.5)
      this.jumpBuffer = 0
      this.grind = null
      this.grounded = false
      if (popped) {
        this.flips = (this.flips + 1) % 256
        this.events.push('jump')
      }
      this.events.push('grindEnd')
      return
    }
    this.placeOnRail()
  }
}
