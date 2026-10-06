import { useMemo } from 'react'
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  LatheGeometry,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Shape,
  ShapeGeometry,
  Vector2,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { boardById } from '../shared/config'

/**
 * A proper popsicle skateboard: rounded nose and tail, kicktails bent up, grip
 * tape on top, a printed graphic underneath (different per board), metal trucks
 * and rounded urethane wheels. Nose points +Z, wheels touch y = 0.
 */

const DECK_W = 0.34
const DECK_L = 1.0
const DECK_T = 0.04
const DECK_Y = 0.135

/** Kicktails (nose and tail lift up) + concave (edges curl up slightly). */
function bend(geo) {
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const over = Math.abs(z) - 0.3
    let lift = x * x * 0.9
    if (over > 0) lift += over * over * 2.2
    pos.setY(i, pos.getY(i) + lift)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  return geo
}

function deckShape(scale = 1) {
  const w = (DECK_W / 2) * scale
  const r = w
  const l = (DECK_L / 2) * scale
  const s = new Shape()
  s.moveTo(-w, -l + r)
  s.lineTo(-w, l - r)
  s.absarc(0, l - r, r, Math.PI, 0, true)
  s.lineTo(w, -l + r)
  s.absarc(0, -l + r, r, 0, Math.PI, true)
  return s
}

let shared = null
function boardGeometries() {
  if (shared) return shared
  const deck = new ExtrudeGeometry(deckShape(), {
    depth: DECK_T,
    bevelEnabled: true,
    bevelThickness: 0.006,
    bevelSize: 0.006,
    bevelSegments: 1,
    curveSegments: 12,
    steps: 1,
  })
  deck.rotateX(-Math.PI / 2)
  deck.translate(0, DECK_Y, 0)
  bend(deck)

  const gripTop = new ShapeGeometry(deckShape(0.96), 12)
  gripTop.rotateX(-Math.PI / 2)
  gripTop.translate(0, DECK_Y + DECK_T + 0.0075, 0)
  bend(gripTop)
  const gripParts = [gripTop]
  for (const s of [1, -1]) {
    // Riser pads between the deck and the trucks.
    const riser = new BoxGeometry(0.12, 0.012, 0.16)
    riser.translate(0, DECK_Y - 0.004, s * 0.3)
    gripParts.push(riser.toNonIndexed())
  }
  const grip = mergeGeometries(gripParts.map((g) => (g.index ? g.toNonIndexed() : g)))

  const metal = []
  for (const s of [1, -1]) {
    const zc = s * 0.3
    const base = new BoxGeometry(0.11, 0.025, 0.15)
    base.translate(0, DECK_Y - 0.012, zc)
    const hanger = new BoxGeometry(0.27, 0.045, 0.06)
    hanger.translate(0, 0.085, zc)
    const neck = new BoxGeometry(0.05, 0.05, 0.05)
    neck.translate(0, 0.11, zc)
    const axle = new CylinderGeometry(0.011, 0.011, 0.36, 6)
    axle.rotateZ(Math.PI / 2)
    axle.translate(0, 0.06, zc)
    metal.push(base, hanger, neck, axle)
    // Mounting bolts poking through the grip tape.
    for (const bx of [-0.03, 0.03]) {
      for (const bz of [-0.045, 0.045]) {
        const bolt = new CylinderGeometry(0.009, 0.009, 0.008, 6)
        bolt.translate(bx, DECK_Y + DECK_T + 0.011 + 0.0006, zc + bz)
        metal.push(bolt)
      }
    }
    // Bearing shields on the outside of each wheel.
    for (const side of [1, -1]) {
      const shield = new CylinderGeometry(0.026, 0.026, 0.01, 12)
      shield.rotateZ(Math.PI / 2)
      shield.translate(side * 0.181, 0.062, zc)
      metal.push(shield)
    }
  }

  const profile = [
    new Vector2(0.018, -0.028),
    new Vector2(0.05, -0.028),
    new Vector2(0.06, -0.016),
    new Vector2(0.062, 0),
    new Vector2(0.06, 0.016),
    new Vector2(0.05, 0.028),
    new Vector2(0.018, 0.028),
  ]
  const wheels = []
  for (const s of [1, -1]) {
    for (const side of [1, -1]) {
      const wheel = new LatheGeometry(profile, 14)
      wheel.rotateZ(Math.PI / 2)
      wheel.translate(side * 0.15, 0.062, s * 0.3)
      wheels.push(wheel)
    }
  }

  const hubs = []
  for (const s of [1, -1]) {
    for (const side of [1, -1]) {
      const hub = new CylinderGeometry(0.036, 0.036, 0.058, 12)
      hub.rotateZ(Math.PI / 2)
      hub.translate(side * 0.15, 0.062, s * 0.3)
      hubs.push(hub)
    }
  }

  shared = { deck, grip, metal: mergeGeometries(metal), wheel: mergeGeometries(wheels), hub: mergeGeometries(hubs) }
  return shared
}

/* ---------------------------------------------------------------- textures */

const DESIGNS = ['stripes', 'flames', 'stars', 'bolt', 'checker', 'wave']

/** Underside graphic, mapped in deck metres (u across, v along). */
function graphicTexture(def) {
  const c = document.createElement('canvas')
  c.width = 96
  c.height = 288
  const g = c.getContext('2d')
  const W = c.width
  const L = c.height
  if (def.deck === 'rainbow') {
    const cols = ['#ff3b3b', '#ff9a1f', '#ffe14d', '#3fe05a', '#3fb8ff', '#6b4dff', '#d04dff']
    cols.forEach((col, i) => {
      g.fillStyle = col
      g.fillRect(0, (i * L) / cols.length, W, L / cols.length + 1)
    })
  } else if (def.deck === 'cosmic') {
    const grad = g.createLinearGradient(0, 0, 0, L)
    grad.addColorStop(0, '#2a0b5c')
    grad.addColorStop(0.5, '#0c0322')
    grad.addColorStop(1, '#5b0b7c')
    g.fillStyle = grad
    g.fillRect(0, 0, W, L)
    for (let i = 0; i < 90; i += 1) {
      g.fillStyle = i % 4 ? '#ffffff' : '#ff8af0'
      g.fillRect((i * 37) % W, (i * 91) % L, 2, 2)
    }
  } else {
    g.fillStyle = def.deck
    g.fillRect(0, 0, W, L)
    const accent = def.wheel
    const design = DESIGNS[(def.id - 1) % DESIGNS.length]
    g.fillStyle = accent
    g.strokeStyle = '#1b1530'
    g.lineWidth = 4
    if (design === 'stripes') {
      for (let i = 0; i < 3; i += 1) g.fillRect(W * 0.18 + i * W * 0.24, 0, W * 0.1, L)
    } else if (design === 'flames') {
      g.fillStyle = '#ffb31f'
      for (let i = 0; i < 4; i += 1) {
        g.beginPath()
        g.moveTo(i * (W / 4), L)
        g.quadraticCurveTo(i * (W / 4) + W / 8, L * 0.45, i * (W / 4) + W / 4, L)
        g.fill()
      }
      g.fillStyle = '#ff3b1f'
      for (let i = 0; i < 4; i += 1) {
        g.beginPath()
        g.moveTo(i * (W / 4) + 4, L)
        g.quadraticCurveTo(i * (W / 4) + W / 8, L * 0.62, i * (W / 4) + W / 4 - 4, L)
        g.fill()
      }
    } else if (design === 'stars') {
      for (let i = 0; i < 9; i += 1) {
        const x = (i * 41) % W
        const y = (i * 67) % L
        g.save()
        g.translate(x, y)
        g.beginPath()
        for (let k = 0; k < 10; k += 1) {
          const r = k % 2 ? 5 : 11
          const a = (k * Math.PI) / 5
          g.lineTo(Math.cos(a) * r, Math.sin(a) * r)
        }
        g.closePath()
        g.fill()
        g.restore()
      }
    } else if (design === 'bolt') {
      g.beginPath()
      g.moveTo(W * 0.6, L * 0.08)
      g.lineTo(W * 0.25, L * 0.5)
      g.lineTo(W * 0.5, L * 0.5)
      g.lineTo(W * 0.38, L * 0.92)
      g.lineTo(W * 0.78, L * 0.42)
      g.lineTo(W * 0.52, L * 0.42)
      g.closePath()
      g.fill()
      g.stroke()
    } else if (design === 'checker') {
      const s = W / 4
      for (let y = 0; y < L / s; y += 1) for (let x = 0; x < 4; x += 1) if ((x + y) % 2) g.fillRect(x * s, y * s, s, s)
    } else {
      for (let i = 0; i < 6; i += 1) {
        g.beginPath()
        g.moveTo(0, i * 50 + 20)
        g.bezierCurveTo(W * 0.3, i * 50, W * 0.7, i * 50 + 40, W, i * 50 + 20)
        g.lineWidth = 10
        g.strokeStyle = accent
        g.stroke()
      }
    }
  }
  // "+1" logo in the middle.
  g.fillStyle = '#ffffff'
  g.strokeStyle = '#1b1530'
  g.lineWidth = 5
  g.beginPath()
  g.arc(W / 2, L / 2, 26, 0, Math.PI * 2)
  g.fill()
  g.stroke()
  g.fillStyle = '#1b1530'
  g.font = 'bold 26px sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('+1', W / 2, L / 2 + 1)

  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.wrapS = RepeatWrapping
  tex.wrapT = RepeatWrapping
  // Extrude caps carry UVs in shape metres: map [-W/2, W/2] x [-L/2, L/2] to 0..1.
  tex.repeat.set(1 / DECK_W, 1 / DECK_L)
  tex.offset.set(0.5, 0.5)
  return tex
}

let gripMat = null
function getGripMaterial() {
  if (gripMat) return gripMat
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 64
  const g = c.getContext('2d')
  g.fillStyle = '#16161c'
  g.fillRect(0, 0, 64, 64)
  for (let i = 0; i < 500; i += 1) {
    g.fillStyle = i % 3 ? '#2a2a34' : '#0a0a0e'
    g.fillRect((i * 37) % 64, (i * 53) % 64, 1, 1)
  }
  const tex = new CanvasTexture(c)
  tex.wrapS = RepeatWrapping
  tex.wrapT = RepeatWrapping
  tex.repeat.set(3, 3)
  tex.colorSpace = SRGBColorSpace
  // Double-sided: the shape's winding makes its triangles face down after rotation.
  gripMat = new MeshStandardMaterial({ map: tex, roughness: 1, side: DoubleSide })
  return gripMat
}

/** Plywood edge: the 7 maple plies, with the board's colour in the middle ply. */
function plyMaterial(def) {
  const c = document.createElement('canvas')
  c.width = 8
  c.height = 70
  const g = c.getContext('2d')
  const mid = def.deck === 'rainbow' ? '#ff66cc' : def.deck === 'cosmic' ? '#7a2bff' : def.deck
  const plies = ['#d9b07a', '#f0d29c', mid, '#f0d29c', def.wheel, '#f0d29c', '#d9b07a']
  plies.forEach((col, i) => {
    g.fillStyle = col
    g.fillRect(0, i * 10, 8, 10)
  })
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.wrapS = RepeatWrapping
  tex.wrapT = RepeatWrapping
  // Side UVs run v = 1 - depth; map the deck's thickness (+ bevel) onto one stack.
  const span = DECK_T + 0.012
  tex.repeat.set(1, 1 / span)
  tex.offset.set(0, -(1 - DECK_T - 0.006) / span)
  return new MeshStandardMaterial({ map: tex, roughness: 0.7 })
}

const hubMat = new MeshStandardMaterial({ color: '#f4f4f8', roughness: 0.4 })
const metalMat = new MeshStandardMaterial({ color: '#c8ccd8', roughness: 0.28, metalness: 0.85 })
const materialCache = new Map()

function boardMaterials(def) {
  if (materialCache.has(def.id)) return materialCache.get(def.id)
  const glowColor = def.deck === 'rainbow' ? '#ff66cc' : def.deck === 'cosmic' ? '#7a2bff' : def.deck
  const mats = {
    deck: [
      new MeshStandardMaterial({
        map: graphicTexture(def),
        roughness: 0.4,
        metalness: 0.05,
        emissive: new Color(glowColor),
        emissiveIntensity: (def.glow || 0) * 0.6,
      }),
      plyMaterial(def),
    ],
    wheel: new MeshStandardMaterial({
      color: def.wheel,
      roughness: 0.55,
      emissive: new Color(def.wheel),
      emissiveIntensity: (def.glow || 0) * 0.4,
    }),
  }
  materialCache.set(def.id, mats)
  return mats
}

export function Skateboard({ board = 1, castShadow = true }) {
  const def = boardById(board)
  const m = useMemo(() => boardMaterials(def), [def])
  const g = boardGeometries()
  return (
    <group>
      <mesh geometry={g.deck} material={m.deck} castShadow={castShadow} />
      <mesh geometry={g.grip} material={getGripMaterial()} />
      <mesh geometry={g.metal} material={metalMat} castShadow={castShadow} />
      <mesh geometry={g.wheel} material={m.wheel} castShadow={castShadow} />
      <mesh geometry={g.hub} material={hubMat} />
    </group>
  )
}

export default Skateboard
