import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Vector3 } from 'three'

import { useBloxityStore } from '../bloxity/store'
import { net } from '../net/session'
import { WORLD_UNLOCK_REBIRTHS, moveSpeedFor } from '../shared/config'
import {
  BOARD_PAD,
  KILL_Y,
  carPos,
  grannyPos,
  inRect,
  stageAtZ,
  sweeperAngle,
  treadmillAt,
  winPadAt,
  worldOfX,
} from '../shared/layout'
import { live, serverSeconds, useGame } from '../state/store'
import { audio } from './audio'
import { cameraRig } from './cameraRig'
import { RiderController } from './controller'
import { consumeInteract, consumeJump, readStick } from './controls'
import Skater from './Skater'

const SEND_INTERVAL = 1 / 15
const _fwd = new Vector3()
const _local = new Vector3()

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a))

function sendMove(c, local) {
  net.send('m', [
    Math.round(c.pos.x * 100) / 100,
    Math.round(c.pos.y * 100) / 100,
    Math.round(c.pos.z * 100) / 100,
    Math.round(c.ry * 1000) / 1000,
    local.anim,
    c.flips,
    Math.round(local.speed * 10) / 10,
    local.seq,
  ])
}

function checkpointAt(layout, x, z) {
  for (const st of layout.stages) if (inRect(st.startRect, x, z)) return st.stage
  return null
}

function hitObstacle(layout, pos, t) {
  for (const o of layout.obstacles) {
    if (o.kind === 'granny') {
      const g = grannyPos(o, t)
      if (Math.abs(pos.x - g.x) < 2.4 && Math.abs(pos.z - g.z) < 2.0 && pos.y < 10) return true
    } else if (o.kind === 'car') {
      if (pos.y > 2.2 || Math.abs(pos.x - o.x) > 1.7) continue
      const car = carPos(o, t)
      if (car.grow > 0.6 && Math.abs(pos.z - car.z) < 2.6) return true
    } else if (o.kind === 'sweeper') {
      if (pos.y > o.p[1] + 0.3) continue
      if (Math.abs(pos.z - o.p[2]) > o.radius + 1 || Math.abs(pos.x - o.p[0]) > o.radius + 1) continue
      const a = sweeperAngle(o, t)
      const dx = Math.cos(a)
      const dz = -Math.sin(a)
      const rx = pos.x - o.p[0]
      const rz = pos.z - o.p[2]
      const along = Math.max(-o.radius, Math.min(o.radius, rx * dx + rz * dz))
      const dist = Math.hypot(rx - dx * along, rz - dz * along)
      if (dist < 0.6) return true
    }
  }
  return false
}

/**
 * The player's own rider: reads input, runs the skate controller, talks to the
 * server, fires zone triggers (pads, treadmills, shop, portal) and drives the
 * camera. Everything here happens inside the frame loop — no React state.
 */
export function LocalPlayer({ layout, physics, sunRef }) {
  const { camera, gl } = useThree()
  const group = useRef(null)
  const motion = useRef({
    time: 0,
    speed: 0,
    maxSpeed: 10,
    grounded: true,
    grinding: false,
    pushing: false,
    braking: false,
    treadmill: false,
    lean: 0,
    flips: 0,
    normal: new Vector3(0, 1, 0),
  })
  const zone = useRef({ pad: null, tm: null, board: null, shop: false, portal: false })
  const timers = useRef({ send: 0, invuln: 1, visualRy: Math.PI, lastRy: Math.PI, claimRetry: 0 })

  const equipped = useBloxityStore((s) => s.equipped)
  const proportions = useBloxityStore((s) => s.proportions)
  const identity = useBloxityStore((s) => s.user || s.guest)
  const board = useGame((s) => s.me?.board ?? 1)
  const trail = useGame((s) => s.me?.trail ?? 0)
  const glow = useGame((s) => s.me?.glow ?? 0)
  const level = useGame((s) => s.stats.level)

  const controller = useMemo(() => new RiderController(physics, layout.spawn, layout.spawnRy), [physics, layout])

  useEffect(() => {
    cameraRig.attach(gl.domElement)
    cameraRig.reset(layout.spawnRy)
    return () => cameraRig.detach()
  }, [gl, layout])

  useFrame((_state, rawDt) => {
    if (physics.freed) return
    // Substep on slow frames so low-FPS devices don't play in slow motion.
    const frameDt = Math.min(rawDt, 0.12)
    const steps = Math.max(1, Math.ceil(frameDt / (1 / 40)))
    const dt = frameDt / steps
    const c = controller
    const local = live.local
    const tm = timers.current
    const game = useGame.getState()
    const me = game.me

    // ---- server teleports ----
    // A teleport into another world is left for that world's scene to pick up.
    if (live.teleport && worldOfX(live.teleport.p[0]) === layout.world) {
      const { p, ry } = live.teleport
      live.teleport = null
      const far = c.pos.distanceTo(_local.set(p[0], p[1], p[2])) > 3
      c.teleport(p, ry)
      local.checkpoint = checkpointAt(layout, p[0], p[2]) ?? 0
      cameraRig.reset(ry)
      tm.visualRy = ry
      tm.invuln = 0.8
      if (far) audio.play('teleport')
    }

    physics.updateMovers(serverSeconds())

    // ---- input relative to the camera ----
    const stick = readStick()
    _fwd.set(-Math.sin(cameraRig.yaw), 0, -Math.cos(cameraRig.yaw))
    const wx = _fwd.x * stick.y + -_fwd.z * stick.x
    const wz = _fwd.z * stick.y + _fwd.x * stick.x
    const level = game.stats.level
    let maxSpeed = moveSpeedFor(level, board)
    const custom = game.settings.customSpeed
    if (custom > 0) maxSpeed = Math.min(maxSpeed, custom)

    const jump = consumeJump()
    for (let i = 0; i < steps; i += 1) {
      const events = c.update(dt, { x: wx, z: wz, mag: stick.mag, jump: jump && i === 0 }, maxSpeed, 1 / steps)
      for (const e of events) {
        if (e === 'jump') audio.play('jump')
        else if (e === 'land' || e === 'grind') audio.play('land')
        else if (e === 'brake') audio.play('brake')
      }
      // Riding over a crumbling plank starts it shaking.
      if (c.grounded && c.groundHandle >= 0 && physics.triggerCrumble(c.groundHandle)) audio.play('creak')
    }
    physics.updateCrumbles(frameDt, c.pos)

    // ---- hazards ----
    tm.invuln = Math.max(0, tm.invuln - frameDt)
    if (tm.invuln === 0) {
      const fell = c.pos.y < KILL_Y
      const hit = !fell && hitObstacle(layout, c.pos, serverSeconds())
      if (fell || hit) {
        audio.play(fell ? 'splash' : 'bonk')
        c.teleport(layout.spawn, Math.PI)
        local.checkpoint = 0
        cameraRig.reset(Math.PI)
        tm.visualRy = Math.PI
        tm.invuln = 1
        net.send('respawn', {})
      }
    }

    // ---- zones ----
    const z = zone.current
    const pos = c.pos
    const cp = checkpointAt(layout, pos.x, pos.z)
    if (cp) local.checkpoint = cp

    // Win pads require an explicit E press. Send our latest position first so
    // the authoritative server can validate the pad before awarding Wins.
    const pad = winPadAt(layout, pos.x, pos.y, pos.z)
    const padLocked = pad && pad.premium && !me?.pads?.includes(pad.id)
    if (pad && pad !== z.pad && padLocked) game.setPrompt({ kind: 'premium', id: pad.id })
    if (pad && pad !== z.pad && !padLocked) game.setPrompt({ kind: 'win', id: pad.id })
    if (!pad && z.pad && (game.prompt?.kind === 'premium' || game.prompt?.kind === 'win')) game.setPrompt(null)
    z.pad = pad

    const tread = treadmillAt(layout, pos.x, pos.y, pos.z)
    const ownsTread = tread && (!tread.cost || me?.treadmills?.includes(tread.id))
    if (tread && tread !== z.tm && !ownsTread) game.setPrompt({ kind: tread.premium ? 'premium' : 'treadmill', id: tread.id })
    if (!tread && z.tm && (game.prompt?.kind === 'treadmill' || game.prompt?.kind === 'premium')) game.setPrompt(null)
    z.tm = tread

    let boardPad = null
    for (const bp of layout.boardPads) {
      if (Math.abs(pos.x - bp.p[0]) < BOARD_PAD.x / 2 && Math.abs(pos.z - bp.p[2]) < BOARD_PAD.z / 2 && Math.abs(pos.y - bp.p[1]) < 1.5) {
        boardPad = bp
        break
      }
    }
    if (boardPad && boardPad !== z.board && me) {
      game.setPrompt({ kind: 'board', id: boardPad.board })
    }
    if (!boardPad && z.board && game.prompt?.kind === 'board') game.setPrompt(null)
    z.board = boardPad

    // Locked boards, lobby treadmills and VIP items are deliberately collected
    // with E when the rider is standing near them. The server still validates
    // ownership, cost and the item id.
    if (consumeInteract() && game.prompt) {
      const prompt = game.prompt
      if (prompt.kind === 'win') {
        sendMove(c, local)
        net.send('claim', {})
      } else if (prompt.kind === 'board') {
        const owned = me?.boards?.includes(Number(prompt.id))
        net.send(owned ? 'equipBoard' : 'buyBoard', { id: Number(prompt.id) })
      }
      else if (prompt.kind === 'treadmill') net.send('buyTreadmill', { id: prompt.id })
      else if (prompt.kind === 'premium') net.send('buyPremium', { id: prompt.id })
    }

    const inShop = layout.shopRect ? inRect(layout.shopRect, pos.x, pos.z) : false
    if (inShop && !z.shop) game.openPanel('shop')
    z.shop = inShop

    const portal = layout.portal
    const inPortal = portal && Math.hypot(pos.x - portal.p[0], pos.z - portal.p[2]) < portal.r * 0.7 && pos.y < 6
    if (inPortal && !z.portal) {
      const need = WORLD_UNLOCK_REBIRTHS[portal.to]
      if (game.stats.rebirths >= need) net.send('world', { w: portal.to })
      else game.toast(`World ${portal.to + 1} needs ${need} Rebirths!`, 'bad')
    }
    z.portal = inPortal

    // ---- visuals ----
    const g = group.current
    if (g) {
      g.position.copy(pos)
      const diff = wrapAngle(c.ry - tm.visualRy)
      tm.visualRy += diff * Math.min(1, frameDt * 14)
      g.rotation.y = tm.visualRy
    }
    const turnRate = wrapAngle(c.ry - tm.lastRy) / Math.max(frameDt, 1e-3)
    tm.lastRy = c.ry
    const m = motion.current
    m.time += frameDt
    m.speed = c.grind ? c.grind.speed : c.speed
    m.maxSpeed = maxSpeed
    m.grounded = c.grounded
    m.grinding = !!c.grind
    m.treadmill = !!ownsTread && c.grounded && c.speed < 1
    m.pushing = c.pushing
    m.braking = c.braking && c.speed > 0.6
    m.flips = c.flips
    m.style = 0
    m.lean += (Math.max(-1, Math.min(1, turnRate * 0.25)) - m.lean) * Math.min(1, frameDt * 8)
    // Ground normal in the rider's local frame, for board tilt.
    _local.copy(c.groundNormal).applyAxisAngle(_fwd.set(0, 1, 0), -tm.visualRy)
    m.normal.copy(_local)

    audio.setMotion(Math.min(1, m.speed / 22), c.grounded, !!c.grind, m.braking)

    // ---- shared state + network ----
    local.x = pos.x
    local.y = pos.y
    local.z = pos.z
    local.ry = c.ry
    local.speed = m.speed
    local.stage = stageAtZ(layout, pos.z)
    const anim = (c.grounded ? 1 : 0) | (c.grind ? 2 : 0) | (m.treadmill ? 4 : 0) | (c.pushing ? 8 : 0) | (m.braking ? 16 : 0)
    local.anim = anim
    local.flip = c.flips
    tm.send += frameDt
    if (tm.send >= SEND_INTERVAL) {
      tm.send = 0
      sendMove(c, local)
    }

    cameraRig.update(camera, pos, c.ry, m.speed, frameDt, physics)

    const sun = sunRef?.current
    if (sun) {
      sun.position.set(pos.x + 30, pos.y + 60, pos.z + 20)
      sun.target.position.set(pos.x, pos.y, pos.z)
      sun.target.updateMatrixWorld()
    }
  })

  const name = identity?.displayName || identity?.username || 'You'
  return (
    <group ref={group}>
      <Skater
        motionRef={motion}
        board={board}
        trail={trail}
        glow={glow}
        level={level}
        name={name}
        equipped={equipped}
        proportions={proportions}
        isLocal
      />
    </group>
  )
}

export default LocalPlayer
