import { Billboard, Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'

import { live } from '../state/store'
import { FONT_URL } from './World'

const NEAR_DIST = 6.5

/**
 * Floating info card (Roblox-simulator style): a rounded panel with a coloured
 * header, a couple of stat lines and a status pill. Always faces the camera and
 * bobs gently. Used above the lobby skateboards and treadmills.
 */

const cardCache = new Map()
const PX = 128

function roundRect(g, x, y, w, h, r) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

/** Card background texture: dark rounded panel with an accent header band. */
function cardTexture(accent, w, h, header) {
  const key = `${accent}|${w}|${h}|${header}`
  if (cardCache.has(key)) return cardCache.get(key)
  const c = document.createElement('canvas')
  c.width = Math.round(w * PX)
  c.height = Math.round(h * PX)
  const g = c.getContext('2d')
  const W = c.width
  const Hh = c.height
  const r = 0.28 * PX
  const b = 0.07 * PX
  g.fillStyle = '#1b1530'
  roundRect(g, 0, 0, W, Hh, r)
  g.fill()
  g.save()
  roundRect(g, b, b, W - 2 * b, Hh - 2 * b, r - b)
  g.clip()
  const body = g.createLinearGradient(0, 0, 0, Hh)
  body.addColorStop(0, '#3a2f6e')
  body.addColorStop(1, '#221a48')
  g.fillStyle = body
  g.fillRect(0, 0, W, Hh)
  const hb = header * PX
  const head = g.createLinearGradient(0, 0, 0, hb)
  head.addColorStop(0, '#ffffff')
  head.addColorStop(0.08, accent)
  head.addColorStop(1, accent)
  g.fillStyle = head
  g.fillRect(0, 0, W, hb)
  g.fillStyle = 'rgba(0,0,0,0.25)'
  g.fillRect(0, hb - 0.05 * PX, W, 0.05 * PX)
  // Faint stud pattern on the body.
  g.fillStyle = 'rgba(255,255,255,0.05)'
  for (let y = hb + 0.2 * PX; y < Hh; y += 0.3 * PX) {
    for (let x = 0.15 * PX; x < W; x += 0.3 * PX) {
      g.beginPath()
      g.arc(x, y, 0.06 * PX, 0, Math.PI * 2)
      g.fill()
    }
  }
  g.restore()
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 4
  cardCache.set(key, tex)
  return tex
}

/** Rounded pill texture for the status line. */
function pillTexture(color) {
  const key = `pill|${color}`
  if (cardCache.has(key)) return cardCache.get(key)
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 64
  const g = c.getContext('2d')
  g.fillStyle = '#1b1530'
  roundRect(g, 0, 0, 256, 64, 32)
  g.fill()
  const grad = g.createLinearGradient(0, 0, 0, 64)
  grad.addColorStop(0, '#ffffff')
  grad.addColorStop(0.15, color)
  grad.addColorStop(1, color)
  g.fillStyle = grad
  roundRect(g, 5, 5, 246, 54, 27)
  g.fill()
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  cardCache.set(key, tex)
  return tex
}

/**
 * @param {{ position:number[], accent:string, title:string, tag?:string,
 *           lines:{text:string,color?:string}[], status:string, statusColor:string,
 *           width?:number, seed?:number }} props
 */
export function InfoCard({ position, accent, title, tag, lines, status, statusColor, width = 4.4, seed = 0, anchor, miniY = 0 }) {
  const bob = useRef(null)
  const full = useRef(null)
  const mini = useRef(null)
  const header = 0.85
  const height = header + 0.5 + lines.length * 0.5 + 0.75
  useFrame((state) => {
    if (bob.current) bob.current.position.y = Math.sin(state.clock.elapsedTime * 1.6 + seed) * 0.12
    // Full card only for the pad you are standing at; a compact tag otherwise.
    if (anchor && full.current && mini.current) {
      const near = Math.hypot(live.local.x - anchor[0], live.local.z - anchor[2]) < NEAR_DIST
      full.current.visible = near
      mini.current.visible = !near
    }
  })
  const top = height / 2
  return (
    <group position={position}>
      <Billboard ref={full}>
        <group ref={bob}>
          <mesh renderOrder={1}>
            <planeGeometry args={[width, height]} />
            <meshBasicMaterial map={cardTexture(accent, width, height, header)} transparent depthWrite={false} toneMapped={false} />
          </mesh>
          <Text
            font={FONT_URL}
            position={[0, top - header / 2 + (tag ? 0.08 : 0), 0.02]}
            fontSize={0.46}
            maxWidth={width - 0.4}
            color="#ffffff"
            outlineColor="#1b1530"
            outlineWidth={0.05}
            anchorX="center"
            anchorY="middle"
          >
            {title}
          </Text>
          {tag ? (
            <Text font={FONT_URL} position={[0, top - header + 0.17, 0.02]} fontSize={0.2} color="#1b1530" anchorX="center" anchorY="middle">
              {tag}
            </Text>
          ) : null}
          {lines.map((l, i) => (
            <Text
              key={l.text}
              font={FONT_URL}
              position={[0, top - header - 0.38 - i * 0.5, 0.02]}
              fontSize={0.34}
              color={l.color || '#ffffff'}
              outlineColor="#1b1530"
              outlineWidth={0.03}
              anchorX="center"
              anchorY="middle"
            >
              {l.text}
            </Text>
          ))}
          <mesh position={[0, -top + 0.42, 0.015]} renderOrder={2}>
            <planeGeometry args={[width * 0.72, 0.5]} />
            <meshBasicMaterial map={pillTexture(statusColor)} transparent depthWrite={false} toneMapped={false} />
          </mesh>
          <Text
            font={FONT_URL}
            position={[0, -top + 0.42, 0.03]}
            fontSize={0.3}
            color="#ffffff"
            outlineColor="#1b1530"
            outlineWidth={0.035}
            anchorX="center"
            anchorY="middle"
          >
            {status}
          </Text>
        </group>
      </Billboard>
      {anchor ? (
        <Billboard ref={mini} position={[0, miniY, 0]} visible={false}>
          <mesh renderOrder={1}>
            <planeGeometry args={[3.2, 1.2]} />
            <meshBasicMaterial map={cardTexture(accent, 3.2, 1.2, 0.62)} transparent depthWrite={false} toneMapped={false} />
          </mesh>
          <Text font={FONT_URL} position={[0, 0.27, 0.02]} fontSize={0.36} maxWidth={3} color="#ffffff" outlineColor="#1b1530" outlineWidth={0.04} anchorX="center" anchorY="middle">
            {title}
          </Text>
          <Text font={FONT_URL} position={[0, -0.28, 0.02]} fontSize={0.3} color={statusColor} outlineColor="#1b1530" outlineWidth={0.04} anchorX="center" anchorY="middle">
            {status}
          </Text>
        </Billboard>
      ) : null}
    </group>
  )
}

export default InfoCard
