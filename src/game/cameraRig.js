import { Vector3 } from 'three'

/**
 * Roblox-style third-person camera: drag to orbit (mouse or touch), wheel to zoom.
 * While skating it slowly swings in behind the board so you can see what's ahead.
 * A ray against the world keeps it from clipping through walls.
 */

const MIN_DIST = 4
const MAX_DIST = 26
const MIN_PITCH = -0.2
const MAX_PITCH = 1.3
const LOOK_HEIGHT = 1.6

const _desired = new Vector3()
const _target = new Vector3()
const _dir = new Vector3()

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a))

export class CameraRig {
  yaw = Math.PI
  pitch = 0.42
  distance = 11
  lastDrag = -10
  dragging = false
  snap = true
  look = new Vector3()
  cleanup = null

  attach(el) {
    this.detach()
    const pointers = new Map()
    let pinchDist = 0

    const down = (e) => {
      // Touch drags that start on HUD controls never reach the canvas.
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (e.pointerType === 'mouse' && e.button === 1) return
      this.dragging = true
      el.setPointerCapture?.(e.pointerId)
    }
    const move = (e) => {
      const prev = pointers.get(e.pointerId)
      if (!prev) return
      if (pointers.size === 2) {
        const pts = [...pointers.values()]
        const other = pts.find((p) => p !== prev)
        const d = Math.hypot(e.clientX - other.x, e.clientY - other.y)
        if (pinchDist) this.zoom((pinchDist - d) * 0.05)
        pinchDist = d
      } else if (this.dragging) {
        const dx = e.clientX - prev.x
        const dy = e.clientY - prev.y
        const sens = e.pointerType === 'touch' ? 0.007 : 0.005
        this.yaw -= dx * sens
        this.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, this.pitch + dy * sens))
        this.lastDrag = performance.now() / 1000
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }
    const up = (e) => {
      pointers.delete(e.pointerId)
      if (pointers.size < 2) pinchDist = 0
      if (pointers.size === 0) this.dragging = false
      el.releasePointerCapture?.(e.pointerId)
    }
    const wheel = (e) => {
      e.preventDefault()
      this.zoom(e.deltaY * 0.012)
    }
    const ctx = (e) => e.preventDefault()

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('wheel', wheel, { passive: false })
    el.addEventListener('contextmenu', ctx)
    this.cleanup = () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('wheel', wheel)
      el.removeEventListener('contextmenu', ctx)
    }
  }

  detach() {
    this.cleanup?.()
    this.cleanup = null
  }

  zoom(delta) {
    this.distance = Math.min(MAX_DIST, Math.max(MIN_DIST, this.distance + delta))
  }

  /** Points the camera behind `ry` immediately (after teleports). */
  reset(ry) {
    this.yaw = ry + Math.PI
    this.snap = true
  }

  update(camera, pos, ry, speed, dt, physics) {
    const now = performance.now() / 1000
    // Swing in behind the rider when moving and the player isn't steering the camera.
    if (!this.dragging && now - this.lastDrag > 1.2 && speed > 3) {
      const behind = ry + Math.PI
      const diff = wrapAngle(behind - this.yaw)
      const rate = Math.min(1, dt * (0.6 + speed * 0.06))
      this.yaw += diff * rate
    }

    _target.set(pos.x, pos.y + LOOK_HEIGHT, pos.z)
    const horiz = Math.cos(this.pitch)
    _dir.set(Math.sin(this.yaw) * horiz, Math.sin(this.pitch), Math.cos(this.yaw) * horiz)
    let dist = this.distance + Math.min(4, speed * 0.12)
    if (physics) {
      const hit = physics.rayDistance(_target, _dir, dist)
      dist = Math.max(1.2, hit - 0.35)
    }
    _desired.copy(_target).addScaledVector(_dir, dist)

    if (this.snap) {
      camera.position.copy(_desired)
      this.look.copy(_target)
      this.snap = false
    } else {
      const k = 1 - Math.pow(0.0001, dt)
      camera.position.lerp(_desired, k)
      this.look.lerp(_target, 1 - Math.pow(0.00001, dt))
    }
    camera.lookAt(this.look)
  }
}

export const cameraRig = new CameraRig()
