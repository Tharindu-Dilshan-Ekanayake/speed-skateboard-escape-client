import { useRef } from 'react'

import { audio } from '../game/audio'
import { input, pressJump, releaseJump } from '../game/controls'

/** On-screen joystick + jump button for phones and tablets. */
export function TouchControls() {
  const base = useRef(null)
  const knob = useRef(null)
  const pointer = useRef(null)

  const update = (e) => {
    const rect = base.current.getBoundingClientRect()
    const r = rect.width / 2
    let dx = (e.clientX - (rect.left + r)) / r
    let dy = (e.clientY - (rect.top + r)) / r
    const len = Math.hypot(dx, dy)
    if (len > 1) {
      dx /= len
      dy /= len
    }
    input.stick.x = dx
    input.stick.y = -dy
    input.stick.active = true
    knob.current.style.transform = `translate(${dx * r * 0.6}px, ${dy * r * 0.6}px)`
  }

  const end = () => {
    pointer.current = null
    input.stick.x = 0
    input.stick.y = 0
    input.stick.active = false
    if (knob.current) knob.current.style.transform = ''
  }

  return (
    <>
      <div
        ref={base}
        className="joy"
        onPointerDown={(e) => {
          audio.unlock()
          pointer.current = e.pointerId
          e.currentTarget.setPointerCapture(e.pointerId)
          update(e)
        }}
        onPointerMove={(e) => {
          if (pointer.current === e.pointerId) update(e)
        }}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <div ref={knob} className="knob" />
      </div>
      <button
        type="button"
        className="jumpbtn stroke-thin"
        onPointerDown={(e) => {
          e.preventDefault()
          audio.unlock()
          pressJump()
        }}
        onPointerUp={releaseJump}
        onPointerCancel={releaseJump}
      >
        JUMP
      </button>
    </>
  )
}

export default TouchControls
