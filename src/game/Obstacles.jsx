import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { CanvasTexture, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace } from 'three'

import { grannyPos, sweeperAngle } from '../shared/layout'
import { serverSeconds } from '../state/store'
import Near from './Near'

/**
 * Moving hazards. Positions are pure functions of the server clock, so every
 * player in the lobby sees the granny and the sweepers in the same place.
 */

let floralMat = null
function getFloral() {
  if (floralMat) return floralMat
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 64
  const g = c.getContext('2d')
  g.fillStyle = '#5b3f9e'
  g.fillRect(0, 0, 64, 64)
  const petals = ['#ff8ad8', '#ffffff', '#ff5aa0', '#8fd0ff']
  for (let i = 0; i < 14; i += 1) {
    const x = (i * 23) % 64
    const y = (i * 37) % 64
    g.fillStyle = petals[i % petals.length]
    for (let k = 0; k < 5; k += 1) {
      const a = (k / 5) * Math.PI * 2
      g.beginPath()
      g.arc(x + Math.cos(a) * 2.6, y + Math.sin(a) * 2.6, 2, 0, Math.PI * 2)
      g.fill()
    }
  }
  const tex = new CanvasTexture(c)
  tex.wrapS = RepeatWrapping
  tex.wrapT = RepeatWrapping
  tex.repeat.set(2, 2)
  tex.colorSpace = SRGBColorSpace
  floralMat = new MeshStandardMaterial({ map: tex, roughness: 0.9 })
  return floralMat
}

const SKIN = '#f3d3b5'
const HAIR = '#f4f4f6'
const METAL = '#c9ced8'

function Granny({ o }) {
  const root = useRef(null)
  const legL = useRef(null)
  const legR = useRef(null)
  const body = useRef(null)
  const floral = useMemo(() => getFloral(), [])

  useFrame(() => {
    const g = grannyPos(o, serverSeconds())
    if (!root.current) return
    root.current.position.set(g.x, 0, g.z)
    root.current.rotation.y = g.facing > 0 ? Math.PI / 2 : -Math.PI / 2
    const swing = Math.sin(g.walk * 1.4) * 0.35
    legL.current.rotation.x = swing
    legR.current.rotation.x = -swing
    body.current.position.y = Math.abs(Math.cos(g.walk * 1.4)) * 0.15
  })

  return (
    <group ref={root}>
      <group ref={legL} position={[-0.75, 3.2, 0]}>
        <mesh position={[0, -1.6, 0]} castShadow>
          <boxGeometry args={[0.9, 3.2, 0.9]} />
          <meshStandardMaterial color={SKIN} />
        </mesh>
        <mesh position={[0, -3.0, 0.2]} castShadow>
          <boxGeometry args={[1.0, 0.45, 1.4]} />
          <meshStandardMaterial color="#4a2a6a" />
        </mesh>
      </group>
      <group ref={legR} position={[0.75, 3.2, 0]}>
        <mesh position={[0, -1.6, 0]} castShadow>
          <boxGeometry args={[0.9, 3.2, 0.9]} />
          <meshStandardMaterial color={SKIN} />
        </mesh>
        <mesh position={[0, -3.0, 0.2]} castShadow>
          <boxGeometry args={[1.0, 0.45, 1.4]} />
          <meshStandardMaterial color="#4a2a6a" />
        </mesh>
      </group>
      <group ref={body}>
        <mesh position={[0, 5.2, 0]} material={floral} castShadow>
          <boxGeometry args={[3.4, 4.4, 2.2]} />
        </mesh>
        <mesh position={[0, 3.0, 0]} material={floral} castShadow>
          <boxGeometry args={[3.8, 0.9, 2.6]} />
        </mesh>
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 2.1, 7.0, 0]} rotation={[-0.9, 0, 0]}>
            <mesh position={[0, -1.4, 0]} material={floral} castShadow>
              <boxGeometry args={[0.85, 2.9, 0.85]} />
            </mesh>
            <mesh position={[0, -3.0, 0]}>
              <boxGeometry args={[0.7, 0.6, 0.7]} />
              <meshStandardMaterial color={SKIN} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, 8.4, 0]} castShadow>
          <boxGeometry args={[2.0, 2.0, 2.0]} />
          <meshStandardMaterial color={SKIN} />
        </mesh>
        <mesh position={[0, 9.55, -0.1]}>
          <boxGeometry args={[2.2, 0.7, 2.2]} />
          <meshStandardMaterial color={HAIR} />
        </mesh>
        <mesh position={[0, 10.2, -0.4]}>
          <boxGeometry args={[1.1, 1.0, 1.1]} />
          <meshStandardMaterial color={HAIR} />
        </mesh>
        {[-0.45, 0.45].map((x) => (
          <mesh key={x} position={[x, 8.55, 1.02]}>
            <torusGeometry args={[0.28, 0.06, 6, 14]} />
            <meshStandardMaterial color="#222228" />
          </mesh>
        ))}
        <mesh position={[0, 7.85, 1.02]}>
          <boxGeometry args={[0.6, 0.1, 0.05]} />
          <meshStandardMaterial color="#b0485a" />
        </mesh>
        {/* Walker frame */}
        {[-1.7, 1.7].map((x) =>
          [2.0, 3.6].map((z) => (
            <mesh key={`${x}${z}`} position={[x, 2.1, z]}>
              <cylinderGeometry args={[0.12, 0.12, 4.2, 8]} />
              <meshStandardMaterial color={METAL} metalness={0.7} roughness={0.3} />
            </mesh>
          )),
        )}
        {[-1.7, 1.7].map((x) => (
          <mesh key={x} position={[x, 4.2, 2.8]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.14, 0.14, 1.8, 8]} />
            <meshStandardMaterial color={METAL} metalness={0.7} roughness={0.3} />
          </mesh>
        ))}
        <mesh position={[0, 2.4, 3.6]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.1, 0.1, 3.4, 8]} />
          <meshStandardMaterial color={METAL} metalness={0.7} roughness={0.3} />
        </mesh>
      </group>
    </group>
  )
}

function Sweeper({ o }) {
  const bar = useRef(null)
  useFrame(() => {
    if (bar.current) bar.current.rotation.y = sweeperAngle(o, serverSeconds())
  })
  return (
    <group ref={bar} position={o.p}>
      <mesh castShadow>
        <boxGeometry args={[o.radius * 2, 0.5, 0.5]} />
        <meshStandardMaterial color="#ff3b3b" emissive="#ff1f1f" emissiveIntensity={0.35} roughness={0.4} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (o.radius - 0.4), 0, 0]}>
          <boxGeometry args={[0.8, 0.56, 0.56]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
      ))}
    </group>
  )
}

function Movers({ physics }) {
  const refs = useRef([])
  useFrame(() => {
    physics.movers.forEach((m, i) => {
      const mesh = refs.current[i]
      if (mesh) mesh.position.set(m.pos[0], m.pos[1], m.pos[2])
    })
  })
  return physics.movers.map((m, i) => (
    <mesh
      key={m.def.id}
      ref={(el) => {
        refs.current[i] = el
      }}
      position={m.def.p}
      castShadow
      receiveShadow
    >
      <boxGeometry args={m.def.s} />
      <meshStandardMaterial color={m.def.color} roughness={0.6} emissive={m.def.color} emissiveIntensity={0.15} />
    </mesh>
  ))
}

export function Obstacles({ layout, physics }) {
  return (
    <>
      {layout.obstacles.map((o) => (
        <Near key={o.id} at={o.kind === 'granny' ? [(o.x0 + o.x1) / 2, 0, o.z] : o.p} radius={260}>
          {o.kind === 'granny' ? <Granny o={o} /> : <Sweeper o={o} />}
        </Near>
      ))}
      <Movers physics={physics} />
    </>
  )
}

export default Obstacles
