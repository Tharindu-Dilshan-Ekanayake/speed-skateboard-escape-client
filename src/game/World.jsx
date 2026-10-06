import { Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three'

import { WATER_Y } from '../shared/layout'
import { getPipeGeometry, getUnitWedge, ribbonGeometry } from './geometry'
import { getMaterials, tintedMaterial } from './materials'
import Near from './Near'
import { buildVisuals } from './worldVisuals'

export const FONT_URL = `${import.meta.env.BASE_URL}fonts/fredoka-700.woff`

/**
 * The map is ~4 km long. Static pieces are batched into instanced meshes per
 * material AND per 60 m slice of the course, so the camera (and the shadow
 * camera) only ever draws the few slices around the rider instead of the whole
 * world every frame.
 */
const CHUNK = 60

const Y_AXIS = new Vector3(0, 1, 0)
const _m = new Matrix4()
const _q = new Quaternion()
const _p = new Vector3()
const _s = new Vector3()
const _c = new Color()
const _e = new Euler()

const chunkOf = (z) => Math.floor(z / CHUNK)

/**
 * Groups `items` by chunk and adds one instanced mesh per chunk.
 * `place(item, matrix)` writes the instance transform; items need `.color`.
 */
function addChunked(group, geometry, material, items, place, { shadows, cast = true } = {}) {
  const byChunk = new Map()
  for (const it of items) {
    const k = chunkOf(it.cz ?? it.p[2])
    if (!byChunk.has(k)) byChunk.set(k, [])
    byChunk.get(k).push(it)
  }
  for (const list of byChunk.values()) {
    const mesh = new InstancedMesh(geometry, material, list.length)
    list.forEach((it, i) => {
      place(it, _m)
      mesh.setMatrixAt(i, _m)
      if (it.color) mesh.setColorAt(i, _c.set(it.color))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.castShadow = shadows && cast
    mesh.receiveShadow = true
    mesh.computeBoundingSphere()
    group.add(mesh)
  }
}

const placeBox = (it, m) => m.compose(_p.set(it.p[0], it.p[1], it.p[2]), _q.setFromAxisAngle(Y_AXIS, it.ry || 0), _s.set(it.s[0], it.s[1], it.s[2]))

/** Builds every static mesh for one world. */
function buildStatic(layout, shadows) {
  const mats = getMaterials()
  const group = new Group()
  const boxGeo = new BoxGeometry(1, 1, 1)
  const visuals = buildVisuals(layout)

  const byMat = new Map()
  for (const b of visuals.boxes) {
    const key = mats[b.mat] ? b.mat : 'plain'
    if (!byMat.has(key)) byMat.set(key, [])
    byMat.get(key).push(b)
  }
  for (const [key, items] of byMat) {
    addChunked(group, boxGeo, mats[key], items, placeBox, { shadows, cast: key !== 'decal' && key !== 'glow' })
  }

  const wedges = layout.wedges.filter((w) => w.visible)
  addChunked(group, getUnitWedge(), mats.stud, wedges, placeBox, { shadows })

  for (const p of layout.pipes) {
    const mesh = new Mesh(getPipeGeometry(p.radius, p.length, p.phi), tintedMaterial('stud', p.color))
    mesh.position.set(p.p[0], p.p[1], p.p[2])
    mesh.rotation.y = p.ry
    mesh.castShadow = shadows
    mesh.receiveShadow = true
    group.add(mesh)
  }

  for (const r of layout.ribbons) {
    const mesh = new Mesh(ribbonGeometry(r), mats.ribbon)
    mesh.castShadow = shadows
    mesh.receiveShadow = true
    group.add(mesh)
  }

  // Pillars + every cylindrical prop part.
  const cyls = [
    ...layout.cylinders.map((c) => ({ p: [c.p[0], c.p[1] + c.height / 2, c.p[2]], r: c.radius, h: c.height, color: c.color })),
    ...visuals.cylinders,
  ]
  addChunked(group, new CylinderGeometry(1, 1, 1, 14), mats.plain, cyls, (c, m) =>
    m.compose(_p.set(c.p[0], c.p[1], c.p[2]), _q.setFromEuler(_e.set(c.rx || 0, 0, c.rz || 0)), _s.set(c.r, c.h, c.r)),
  { shadows })
  addChunked(group, new ConeGeometry(1, 1, 12), mats.plain, visuals.cones, (c, m) =>
    m.compose(_p.set(c.p[0], c.p[1] + c.h / 2, c.p[2]), _q.identity(), _s.set(c.r, c.h, c.r)),
  { shadows })
  addChunked(group, new IcosahedronGeometry(1, 0), mats.rock, visuals.rocks, (r, m) =>
    m.compose(_p.set(r.p[0], r.p[1], r.p[2]), _q.setFromAxisAngle(Y_AXIS, r.ry), _s.set(r.s[0], r.s[1], r.s[2])),
  { shadows })

  // Rails + posts.
  const railItems = []
  const up = new Vector3(0, 1, 0)
  for (const r of layout.rails) {
    const a = new Vector3(...r.a)
    const b = new Vector3(...r.b)
    const dir = b.clone().sub(a)
    const len = dir.length()
    dir.normalize()
    const mid = a.clone().add(b).multiplyScalar(0.5)
    railItems.push({ cz: mid.z, pos: mid, quat: new Quaternion().setFromUnitVectors(up, dir), scale: [0.075, len, 0.075] })
    if (r.posts) {
      const n = Math.max(2, Math.ceil(len / 4) + 1)
      for (let i = 0; i < n; i += 1) {
        const pt = a.clone().lerp(b, i / (n - 1))
        const h = Math.max(0.2, pt.y)
        railItems.push({ cz: pt.z, pos: new Vector3(pt.x, pt.y - h / 2, pt.z), quat: new Quaternion(), scale: [0.06, h, 0.06] })
      }
    }
  }
  addChunked(group, new CylinderGeometry(1, 1, 1, 10), mats.metal, railItems, (it, m) => m.compose(it.pos, it.quat, _s.set(...it.scale)), { shadows })

  // River: water surface plus a dark bed underneath for depth.
  const bedMat = new MeshStandardMaterial({ color: layout.world === 0 ? '#11708f' : '#3a0b4a', roughness: 1 })
  for (const w of layout.water) {
    const geo = new PlaneGeometry(w.s[0], w.s[1])
    const uv = geo.attributes.uv
    for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * (w.s[0] / 9), uv.getY(i) * (w.s[1] / 9))
    const water = new Mesh(geo, mats.water)
    water.rotation.x = -Math.PI / 2
    water.position.set(w.p[0], WATER_Y, w.p[2])
    water.receiveShadow = true
    group.add(water)
    const bed = new Mesh(new PlaneGeometry(w.s[0], w.s[1]), bedMat)
    bed.rotation.x = -Math.PI / 2
    bed.position.set(w.p[0], WATER_Y - 1.6, w.p[2])
    group.add(bed)
  }

  mats.water.color.set(layout.theme.water)
  return group
}

/** Crumbling bridge planks, animated from the physics state (one draw call). */
function Crumbles({ physics }) {
  const mesh = useMemo(() => {
    const list = physics.crumbles
    if (!list.length) return null
    const m = new InstancedMesh(new BoxGeometry(1, 1, 1), getMaterials().wood, list.length)
    list.forEach((p, i) => {
      m.setMatrixAt(i, placeBox(p.def, _m))
      m.setColorAt(i, _c.set(p.def.color))
    })
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    m.castShadow = true
    m.receiveShadow = true
    m.frustumCulled = false
    return m
  }, [physics])
  const tilt = useRef(new Euler())
  const ref = useRef(null)

  useFrame(() => {
    const inst = ref.current
    if (!inst) return
    physics.crumbles.forEach((p, i) => {
      const [x, y, z] = p.def.p
      if (p.state === 'gone') {
        _m.makeScale(0, 0, 0)
      } else {
        tilt.current.set(p.state === 'falling' ? p.t * 1.4 : 0, 0, p.shake * 2)
        _m.compose(_p.set(x + p.shake, y + p.y, z), _q.setFromEuler(tilt.current), _s.set(p.def.s[0], p.def.s[1], p.def.s[2]))
      }
      inst.setMatrixAt(i, _m)
    })
    inst.instanceMatrix.needsUpdate = true
  })

  return mesh ? <primitive ref={ref} object={mesh} /> : null
}

function Sign({ s }) {
  return (
    <group position={s.p} rotation={[s.tilt, s.ry, 0]}>
      <Text font={FONT_URL} fontSize={s.size} color={s.color} outlineColor={s.outline} outlineWidth={s.size * 0.09} anchorX="center" anchorY="middle">
        {s.text}
      </Text>
      {s.sub ? (
        <Text
          font={FONT_URL}
          position={[0, -s.size * 0.85, 0]}
          fontSize={s.size * 0.42}
          color={s.subColor}
          outlineColor={s.outline}
          outlineWidth={s.size * 0.05}
          anchorX="center"
          anchorY="middle"
        >
          {s.sub}
        </Text>
      ) : null}
    </group>
  )
}

export function World({ layout, shadows, physics }) {
  const group = useMemo(() => buildStatic(layout, shadows), [layout, shadows])

  useEffect(
    () => () => {
      group.traverse((o) => {
        if (o.isInstancedMesh) o.dispose()
        else if (o.isMesh && o.geometry?.attributes?.color) o.geometry.dispose()
      })
    },
    [group],
  )

  useFrame((_, dt) => {
    const tex = getMaterials().waterTexture
    tex.offset.x = (tex.offset.x + dt * 0.03) % 1
    tex.offset.y = (tex.offset.y + dt * 0.05) % 1
  })

  return (
    <>
      <primitive object={group} />
      {physics ? <Crumbles physics={physics} /> : null}
      {layout.signs.map((s, i) => (
        <Near key={i} at={s.p} radius={180}>
          <Sign s={s} />
        </Near>
      ))}
    </>
  )
}

export default World
