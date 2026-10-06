import { Billboard, Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, BoxGeometry, CanvasTexture, Color, MeshBasicMaterial, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { BOARDS, WORLD_UNLOCK_REBIRTHS, boardById, formatNum, rebirthWinsMult } from '../shared/config'
import { BOARD_PAD } from '../shared/layout'
import { useGame } from '../state/store'
import { tintedMaterial } from './materials'
import Near from './Near'
import Skateboard from './Skateboard'
import { FONT_URL } from './World'

/* ---------------------------------------------------------------- textures */

let beltTex = null
function getBeltTexture() {
  if (beltTex) return beltTex
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 64
  const g = c.getContext('2d')
  g.fillStyle = '#26262e'
  g.fillRect(0, 0, 64, 64)
  g.fillStyle = '#3a3a46'
  for (let i = 0; i < 4; i += 1) g.fillRect(0, i * 16, 64, 5)
  beltTex = new CanvasTexture(c)
  beltTex.wrapS = RepeatWrapping
  beltTex.wrapT = RepeatWrapping
  beltTex.repeat.set(1, 6)
  beltTex.colorSpace = SRGBColorSpace
  return beltTex
}

let swirlTex = null
function getSwirlTexture() {
  if (swirlTex) return swirlTex
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 128
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.4, 'rgba(160,120,255,0.9)')
  grad.addColorStop(1, 'rgba(40,0,120,0.0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  g.strokeStyle = 'rgba(255,255,255,0.6)'
  g.lineWidth = 4
  for (let i = 0; i < 5; i += 1) {
    g.beginPath()
    for (let a = 0; a < Math.PI * 3; a += 0.1) {
      const r = a * 6
      const x = 64 + Math.cos(a + (i * Math.PI * 2) / 5) * r
      const y = 64 + Math.sin(a + (i * Math.PI * 2) / 5) * r
      if (a === 0) g.moveTo(x, y)
      else g.lineTo(x, y)
    }
    g.stroke()
  }
  swirlTex = new CanvasTexture(c)
  swirlTex.colorSpace = SRGBColorSpace
  return swirlTex
}

function Label({ position, text, sub, color = '#ffffff', subColor = '#ffe14d', size = 0.7 }) {
  return (
    <group position={position}>
      <Text font={FONT_URL} fontSize={size} color={color} outlineColor="#1b1530" outlineWidth={size * 0.1} anchorX="center" anchorY="middle">
        {text}
      </Text>
      {sub ? (
        <Text
          font={FONT_URL}
          position={[0, -size * 0.95, 0]}
          fontSize={size * 0.75}
          color={subColor}
          outlineColor="#1b1530"
          outlineWidth={size * 0.08}
          anchorX="center"
          anchorY="middle"
        >
          {sub}
        </Text>
      ) : null}
    </group>
  )
}

/* -------------------------------------------------------------- treadmills */

/**
 * Floating outlined text over a station, like a Roblox simulator: a big title,
 * then one or two short status lines. Always faces the camera.
 */
function FloatText({ position, lines }) {
  const ys = []
  lines.reduce((y, l) => {
    ys.push(y)
    return y - (l.size || 0.32) * 1.05 - 0.04
  }, 0)
  return (
    <Billboard position={position}>
      {lines.map((l, i) => {
        const size = l.size || 0.32
        return (
          <Text
            key={i}
            font={FONT_URL}
            position={[0, ys[i], 0]}
            fontSize={size}
            color={l.color || '#ffffff'}
            outlineColor="#1b1530"
            outlineWidth={size * 0.12}
            anchorX="center"
            anchorY="middle"
          >
            {l.text}
          </Text>
        )
      })}
    </Billboard>
  )
}

let frameGeo = null
let trimGeo = null
/** Wooden stall: two posts, a top beam and the hand rails, merged. */
function stallGeometries() {
  if (frameGeo) return { frameGeo, trimGeo }
  const wood = []
  const trim = []
  const add = (list, w, h, d, x, y, z) => {
    const g = new BoxGeometry(w, h, d)
    g.translate(x, y, z)
    list.push(g)
  }
  for (const s of [-1, 1]) {
    add(wood, 0.3, 4.4, 0.3, s * 2.05, 2.2, -3.55)
    add(wood, 0.16, 0.16, 2.8, s * 1.75, 1.15, -1.9)
    add(trim, 0.22, 0.32, 6.8, s * 1.9, 0.32, 0)
  }
  add(wood, 4.7, 0.45, 0.45, 0, 4.45, -3.55)
  add(trim, 4.7, 0.18, 0.5, 0, 4.1, -3.55)
  add(trim, 3.7, 0.45, 0.45, 0, 2.05, -3.3)
  frameGeo = mergeGeometries(wood)
  trimGeo = mergeGeometries(trim)
  return { frameGeo, trimGeo }
}

const deckGeo = new BoxGeometry(3.8, 0.3, 6.8)
const deckMat = new MeshStandardMaterial({ color: '#d8d4e4', roughness: 0.6 })
const plainMats = new Map()
function plainMat(color) {
  if (!plainMats.has(color)) plainMats.set(color, new MeshStandardMaterial({ color, roughness: 0.45 }))
  return plainMats.get(color)
}

const GREEN = '#5cff7a'
const YELLOW = '#ffe14d'
const RED = '#ff6b6b'
const GRAY = '#c9c4dc'

function Treadmill({ tm, owned, rebirths }) {
  const tex = getBeltTexture()
  const { frameGeo: fg, trimGeo: tg } = stallGeometries()
  const locked = tm.lobby && rebirths < WORLD_UNLOCK_REBIRTHS[tm.world]
  const usable = !tm.cost || owned
  let sub
  if (usable) sub = { text: owned && tm.cost ? 'OWNED · STEP ON TO TRAIN' : 'STEP ON TO TRAIN', color: GREEN }
  else if (locked) sub = { text: `REQUIRES ${WORLD_UNLOCK_REBIRTHS[tm.world]} REBIRTHS`, color: RED }
  else sub = { text: `${formatNum(tm.cost)} WINS REQUIRED · PRESS E`, color: YELLOW }
  const title = `${tm.premium ? 'VIP ' : ''}x${formatNum(tm.mult)} SPEED`
  return (
    <group position={tm.p}>
      <mesh geometry={deckGeo} material={deckMat} position={[0, 0.15, 0]} receiveShadow castShadow />
      <mesh position={[0, 0.305, 0.1]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[3.1, 6.2]} />
        <meshStandardMaterial map={tex} roughness={0.9} />
      </mesh>
      <mesh geometry={fg} material={tintedMaterial('wood', '#b8783f')} castShadow />
      <mesh geometry={tg} material={plainMat(tm.premium ? '#ffc21f' : tm.color)} castShadow />
      {!usable ? (
        <mesh position={[0, 0.34, 0]}>
          <boxGeometry args={[3.9, 0.06, 6.9]} />
          <meshBasicMaterial color={locked ? '#6b6890' : '#ff3b3b'} transparent opacity={0.4} depthWrite={false} />
        </mesh>
      ) : null}
      <FloatText position={[0, 5.4, -3.55]} lines={[{ text: title, size: 0.62, color: usable ? GREEN : '#ffffff' }, sub]} />
    </group>
  )
}

/* ------------------------------------------------------------- board pads */

function BoardPad({ bp, owned, equipped, next, rebirths }) {
  const spin = useRef(null)
  const def = boardById(bp.board)
  useFrame((state) => {
    if (!spin.current) return
    spin.current.rotation.y = state.clock.elapsedTime * 0.9 + bp.board
    spin.current.position.y = 1.35 + Math.sin(state.clock.elapsedTime * 2 + bp.board) * 0.1
  })
  const worldLocked = def.world > 0 && rebirths < WORLD_UNLOCK_REBIRTHS[def.world]
  let plate = '#8a86a0'
  let status = { text: 'LOCKED', color: GRAY }
  if (equipped) {
    plate = '#38c95a'
    status = { text: 'EQUIPPED', color: GREEN }
  } else if (owned) {
    plate = '#2f8cff'
    status = { text: 'OWNED · PRESS E TO EQUIP', color: '#7fd8ff' }
  } else if (worldLocked) {
    status = { text: `REQUIRES ${WORLD_UNLOCK_REBIRTHS[def.world]} REBIRTHS`, color: RED }
  } else if (next) {
    plate = '#ffb31f'
    status = { text: 'NEXT UPGRADE · PRESS E', color: YELLOW }
  }
  const need = def.cost > 0 ? `${formatNum(def.cost)} ${def.cost === 1 ? 'WIN' : 'WINS'} REQUIRED` : 'FREE'
  return (
    <group position={bp.p}>
      <mesh position={[0, 0.15, 0]} receiveShadow>
        <boxGeometry args={[BOARD_PAD.x, 0.3, BOARD_PAD.z]} />
        <meshStandardMaterial color={plate} emissive={new Color(plate)} emissiveIntensity={equipped || next ? 0.35 : 0.1} roughness={0.5} />
      </mesh>
      <group ref={spin} position={[0, 1.35, 0]} scale={1.7} rotation={[0.35, 0, 0]}>
        <group rotation={[0, 0, 0.2]}>
          <Skateboard board={bp.board} castShadow={false} />
        </group>
      </group>
      <FloatText
        position={[0, 3.45, 0]}
        lines={[
          { text: `+${formatNum(def.bonus)} SPEED`, size: 0.5, color: owned ? GREEN : '#ffffff' },
          { text: owned ? def.name.toUpperCase() : need, size: 0.27, color: owned ? '#ffffff' : YELLOW },
          { text: status.text, size: 0.25, color: status.color },
        ]}
      />
    </group>
  )
}

/* --------------------------------------------------------------- win pads */

function WinPad({ pad, rebirths, owned }) {
  const beam = useRef(null)
  const locked = pad.premium && !owned
  const color = pad.premium ? '#ffc21f' : '#38f05a'
  const wins = Math.round(pad.wins * rebirthWinsMult(rebirths))
  useFrame((state) => {
    if (beam.current) beam.current.material.opacity = (locked ? 0.08 : 0.18) + Math.sin(state.clock.elapsedTime * 3 + pad.stage) * 0.06
  })
  const sub = locked ? `VIP · ${formatNum(pad.cost)} Wins to unlock` : pad.kind === 'return' ? 'Return to lobby' : 'Continue'
  return (
    <group position={pad.p}>
      <mesh position={[0, 0.12, 0]} receiveShadow>
        <boxGeometry args={[pad.s[0], 0.24, pad.s[1]]} />
        <meshStandardMaterial color={locked ? '#6b6890' : color} emissive={new Color(color)} emissiveIntensity={locked ? 0.15 : 0.7} roughness={0.4} />
      </mesh>
      {pad.premium ? (
        <mesh position={[0, 0.25, 0]}>
          <boxGeometry args={[pad.s[0] + 0.4, 0.06, pad.s[1] + 0.4]} />
          <meshBasicMaterial color="#ffe14d" transparent opacity={0.6} />
        </mesh>
      ) : null}
      <mesh ref={beam} position={[0, 3, 0]}>
        <boxGeometry args={[pad.s[0] - 0.4, 6, pad.s[1] - 0.4]} />
        <meshBasicMaterial color={color} transparent opacity={0.2} depthWrite={false} blending={AdditiveBlending} />
      </mesh>
      {locked ? (
        <group position={[0, 1.6, 0]}>
          <mesh>
            <boxGeometry args={[1.3, 1.0, 0.5]} />
            <meshStandardMaterial color="#ffc21f" metalness={0.4} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.5, 0]}>
            <torusGeometry args={[0.42, 0.12, 8, 16, Math.PI]} />
            <meshStandardMaterial color="#c8ccd8" metalness={0.8} roughness={0.3} />
          </mesh>
        </group>
      ) : null}
      <Label position={[0, 4.4, 0]} text={`+${formatNum(wins)} Wins`} sub={sub} color={color} subColor="#ffffff" size={0.85} />
    </group>
  )
}

/* ----------------------------------------------------------------- portal */

function Portal({ portal, rebirths }) {
  const disc = useRef(null)
  const need = WORLD_UNLOCK_REBIRTHS[portal.to]
  const open = rebirths >= need
  useFrame((_, dt) => {
    if (disc.current) disc.current.rotation.z += dt * 1.5
  })
  const ringColor = open ? '#3fe8ff' : '#9a5cff'
  return (
    <group position={[portal.p[0], portal.r + 0.4, portal.p[2]]} rotation={[0, Math.PI, 0]}>
      <mesh castShadow>
        <torusGeometry args={[portal.r, 0.55, 14, 40]} />
        <meshStandardMaterial color={ringColor} emissive={new Color(ringColor)} emissiveIntensity={0.8} roughness={0.3} />
      </mesh>
      <mesh ref={disc}>
        <circleGeometry args={[portal.r - 0.3, 40]} />
        <meshBasicMaterial map={getSwirlTexture()} transparent opacity={0.85} depthWrite={false} />
      </mesh>
      <Label
        position={[0, portal.r + 1.8, 0]}
        text={portal.to === 1 ? 'WORLD 2' : 'WORLD 1'}
        sub={open ? 'Enter!' : `${need} Rebirths needed`}
        color="#ffffff"
        subColor={open ? '#5cff7a' : '#ff7ad9'}
        size={1.1}
      />
    </group>
  )
}

/* ------------------------------------------------------------ leaderboard */

const LB_TITLES = { speed: 'TOP SPEED', wins: 'MOST WINS', rebirths: 'MOST REBIRTHS' }
const LB_COLORS = { speed: '#3fe8ff', wins: '#ffc21f', rebirths: '#ff7ad9' }
const LB_W = 16
const LB_H = 13.5
const LB_ROW = 0.92
const MEDALS = ['#ffd21f', '#d8dce8', '#e0884a']

const lbTextures = new Map()
/** Board face: coloured frame, glossy header band and striped rows. */
function leaderboardTexture(color) {
  if (lbTextures.has(color)) return lbTextures.get(color)
  const S = 40
  const c = document.createElement('canvas')
  c.width = LB_W * S
  c.height = LB_H * S
  const g = c.getContext('2d')
  const W = c.width
  const H = c.height
  const rr = (x, y, w, h, r) => {
    g.beginPath()
    g.moveTo(x + r, y)
    g.arcTo(x + w, y, x + w, y + h, r)
    g.arcTo(x + w, y + h, x, y + h, r)
    g.arcTo(x, y + h, x, y, r)
    g.arcTo(x, y, x + w, y, r)
    g.closePath()
  }
  g.fillStyle = '#1b1530'
  rr(0, 0, W, H, 0.7 * S)
  g.fill()
  g.fillStyle = color
  rr(0.15 * S, 0.15 * S, W - 0.3 * S, H - 0.3 * S, 0.6 * S)
  g.fill()
  const body = g.createLinearGradient(0, 0, 0, H)
  body.addColorStop(0, '#3a2a78')
  body.addColorStop(1, '#1d1640')
  g.fillStyle = body
  rr(0.45 * S, 2.6 * S, W - 0.9 * S, H - 3.05 * S, 0.45 * S)
  g.fill()
  const head = g.createLinearGradient(0, 0, 0, 2.6 * S)
  head.addColorStop(0, '#ffffff')
  head.addColorStop(0.15, color)
  head.addColorStop(1, color)
  g.fillStyle = head
  rr(0.45 * S, 0.45 * S, W - 0.9 * S, 2.0 * S, 0.45 * S)
  g.fill()
  for (let i = 0; i < 10; i += 1) {
    const y = (2.85 + i * LB_ROW) * S
    g.fillStyle = i < 3 ? 'rgba(255,255,255,0.12)' : i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)'
    rr(0.7 * S, y, W - 1.4 * S, (LB_ROW - 0.08) * S, 0.25 * S)
    g.fill()
  }
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 4
  lbTextures.set(color, tex)
  return tex
}

let bulbGeos = null
/** Marquee bulbs around the frame, split into two sets that blink in turn. */
function getBulbGeometries() {
  if (bulbGeos) return bulbGeos
  const sets = [[], []]
  let i = 0
  const add = (x, y) => {
    const g = new BoxGeometry(0.28, 0.28, 0.12)
    g.translate(x, y, 0.08)
    sets[i % 2].push(g)
    i += 1
  }
  for (let x = -LB_W / 2 + 0.6; x <= LB_W / 2 - 0.5; x += 1.0) {
    add(x, LB_H / 2 + 0.05)
    add(x, -LB_H / 2 - 0.05)
  }
  for (let y = -LB_H / 2 + 0.8; y <= LB_H / 2 - 0.6; y += 1.0) {
    add(-LB_W / 2 - 0.05, y)
    add(LB_W / 2 + 0.05, y)
  }
  bulbGeos = sets.map((list) => mergeGeometries(list))
  return bulbGeos
}

const BULB_ON = new Color('#fff4b8')
const BULB_OFF = new Color('#6b5a2a')
const bulbMats = [new MeshBasicMaterial({ color: '#fff4b8', toneMapped: false }), new MeshBasicMaterial({ color: '#6b5a2a', toneMapped: false })]

function Leaderboard({ board }) {
  const rows = useGame((s) => s.lb[board.kind]) || []
  const color = LB_COLORS[board.kind]
  const bulbs = getBulbGeometries()
  useFrame((state) => {
    const on = Math.floor(state.clock.elapsedTime * 2.5) % 2 === 0
    bulbMats[0].color.copy(on ? BULB_ON : BULB_OFF)
    bulbMats[1].color.copy(on ? BULB_OFF : BULB_ON)
  })
  const top = LB_H / 2
  return (
    <group position={board.p} rotation={[0, board.ry, 0]}>
      <mesh position={[0, 0, -0.18]}>
        <boxGeometry args={[LB_W + 0.4, LB_H + 0.4, 0.3]} />
        <meshStandardMaterial color="#1b1530" roughness={0.8} />
      </mesh>
      <mesh>
        <planeGeometry args={[LB_W, LB_H]} />
        <meshBasicMaterial map={leaderboardTexture(color)} toneMapped={false} />
      </mesh>
      <mesh geometry={bulbs[0]} material={bulbMats[0]} />
      <mesh geometry={bulbs[1]} material={bulbMats[1]} />
      <Text font={FONT_URL} position={[0, top - 1.45, 0.05]} fontSize={1.25} color="#ffffff" outlineColor="#1b1530" outlineWidth={0.12} anchorX="center" anchorY="middle">
        {LB_TITLES[board.kind]}
      </Text>
      {rows.length === 0 ? (
        <Text font={FONT_URL} position={[0, -0.5, 0.05]} fontSize={0.9} color="#ffffff" outlineColor="#1b1530" outlineWidth={0.07} anchorX="center" anchorY="middle">
          Be the first!
        </Text>
      ) : null}
      {rows.slice(0, 10).map((r, i) => {
        const y = top - 2.85 - i * LB_ROW - LB_ROW / 2 + 0.04
        return (
          <group key={i} position={[0, y, 0.05]}>
            <mesh position={[-6.95, 0, 0]}>
              <circleGeometry args={[0.36, 20]} />
              <meshBasicMaterial color={MEDALS[i] || '#4a3f80'} toneMapped={false} />
            </mesh>
            <Text font={FONT_URL} position={[-6.95, 0, 0.01]} fontSize={0.42} color={i < 3 ? '#1b1530' : '#ffffff'} anchorX="center" anchorY="middle">
              {String(i + 1)}
            </Text>
            <Text
              font={FONT_URL}
              position={[-6.2, 0, 0.01]}
              fontSize={i < 3 ? 0.62 : 0.56}
              maxWidth={9}
              color={i < 3 ? MEDALS[i] : '#ffffff'}
              outlineColor="#1b1530"
              outlineWidth={0.05}
              anchorX="left"
              anchorY="middle"
            >
              {r.name}
            </Text>
            <Text font={FONT_URL} position={[7.2, 0, 0.01]} fontSize={0.6} color={color} outlineColor="#1b1530" outlineWidth={0.05} anchorX="right" anchorY="middle">
              {formatNum(r.value)}
            </Text>
          </group>
        )
      })}
    </group>
  )
}

/* ---------------------------------------------------------------- export */

export function Interactives({ layout }) {
  const me = useGame((s) => s.me)
  const rebirths = useGame((s) => s.stats.rebirths)
  const ownedTreadmills = useMemo(() => new Set(me?.treadmills || []), [me?.treadmills])
  const ownedBoards = useMemo(() => new Set(me?.boards || [1]), [me?.boards])
  const equippedBoard = me?.board ?? 1
  const ownedPads = useMemo(() => new Set(me?.pads || []), [me?.pads])
  // Boards unlock in order: the first one you don't own is the next upgrade.
  const nextBoard = useMemo(() => BOARDS.find((b) => !ownedBoards.has(b.id))?.id ?? -1, [ownedBoards])

  // One shared belt texture: scroll it once per frame for every treadmill.
  useFrame((_, dt) => {
    const tex = getBeltTexture()
    tex.offset.y = (tex.offset.y - dt * 1.6) % 1
  })

  return (
    <>
      {layout.treadmills.map((tm) => (
        <Near key={tm.id} at={tm.p} radius={220}>
          <Treadmill tm={tm} owned={!tm.cost || ownedTreadmills.has(tm.id)} rebirths={rebirths} />
        </Near>
      ))}
      {layout.boardPads.map((bp) => (
        <Near key={bp.board} at={bp.p} radius={220}>
          <BoardPad bp={bp} owned={ownedBoards.has(bp.board)} equipped={equippedBoard === bp.board} next={nextBoard === bp.board} rebirths={rebirths} />
        </Near>
      ))}
      {layout.winPads.map((pad) => (
        <Near key={pad.id} at={pad.p} radius={260}>
          <WinPad pad={pad} rebirths={rebirths} owned={!pad.premium || ownedPads.has(pad.id)} />
        </Near>
      ))}
      {layout.portal ? <Portal portal={layout.portal} rebirths={rebirths} /> : null}
      {layout.leaderboards.map((b) => (
        <Near key={b.kind} at={b.p}>
          <Leaderboard board={b} />
        </Near>
      ))}
    </>
  )
}

export default Interactives
