/**
 * Input state shared by keyboard, the on-screen joystick and the jump button.
 * Plain module state (not React): the frame loop polls it every frame.
 */

export const input = {
  keys: { forward: false, backward: false, left: false, right: false },
  /** Touch joystick vector, -1..1 (y up = forward). */
  stick: { x: 0, y: 0, active: false },
  jumpQueued: false,
  jumpHeld: false,
  interactQueued: false,
}

const KEY_MAP = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'backward',
  ArrowDown: 'backward',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
}

const typing = (e) => {
  const tag = e.target?.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable
}

export function pressJump() {
  input.jumpQueued = true
  input.jumpHeld = true
}

export function releaseJump() {
  input.jumpHeld = false
}

/** Returns true once per jump press. */
export function consumeJump() {
  const j = input.jumpQueued
  input.jumpQueued = false
  return j
}

/** Returns true once per interaction key press. */
export function consumeInteract() {
  const action = input.interactQueued
  input.interactQueued = false
  return action
}

let installed = false
export function installKeyboard(onFirstGesture) {
  if (installed) return
  installed = true
  const keydown = (e) => {
    onFirstGesture?.()
    if (typing(e)) return
    const action = KEY_MAP[e.code]
    if (action) {
      input.keys[action] = true
      e.preventDefault()
    }
    if (e.code === 'Space') {
      if (!e.repeat) pressJump()
      e.preventDefault()
    }
    if (e.code === 'KeyE' && !e.repeat) input.interactQueued = true
  }
  const keyup = (e) => {
    const action = KEY_MAP[e.code]
    if (action) input.keys[action] = false
    if (e.code === 'Space') releaseJump()
  }
  const blur = () => {
    for (const k of Object.keys(input.keys)) input.keys[k] = false
    input.stick.x = 0
    input.stick.y = 0
    input.stick.active = false
    input.jumpHeld = false
    input.interactQueued = false
  }
  window.addEventListener('keydown', keydown)
  window.addEventListener('keyup', keyup)
  window.addEventListener('blur', blur)
  window.addEventListener('pointerdown', () => onFirstGesture?.(), { passive: true })
}

/** Raw stick in camera space: x right, y forward, magnitude 0..1. */
export function readStick() {
  const k = input.keys
  let x = (k.right ? 1 : 0) - (k.left ? 1 : 0)
  let y = (k.forward ? 1 : 0) - (k.backward ? 1 : 0)
  if (input.stick.active) {
    x += input.stick.x
    y += input.stick.y
  }
  const mag = Math.hypot(x, y)
  if (mag > 1) {
    x /= mag
    y /= mag
  }
  return { x, y, mag: Math.min(1, mag) }
}

export const isTouchDevice = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window)
