import { Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  IcosahedronGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three'

import { WATER_Y } from '../shared/layout'
import { getPipeGeometry, getUnitWedge } from './geometry'
import { getMaterials } from './materials'
import Near from './Near'
import { buildVisuals } from './worldVisuals'

export const FONT_URL = `${import.meta.env.BASE_URL}fonts/fredoka-700.woff`

const Y_AXIS = new Vector3(0, 1, 0)
const _m = new Matrix4()
const _q = new Quaternion()
const _p = new Vector3()
const _s = new Vector3()
const _c = new Color()

function instanced(geometry, material, items, shadows) {
  const mesh = new InstancedMesh(geometry, material, items.length)
  items.forEach((it, i) => {
    _p.set(it.p[0], it.p[1], it.p[2])
    _q.setFromAxisAngle(Y_AXIS, it.ry || 0)
    _s.set(it.s[0], it.s[1], it.s[2])
    _m.compose(_p, _q, _s)
    mesh.setMatrixAt(i, _m)
    mesh.setColorAt(i, _c.set(it.color))
  })
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.castShadow = shadows
  mesh.receiveShadow = true
  mesh.computeBoundingSphere()
  return mesh
}

function finish(mesh, shadows) {
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.castShadow = shadows
  mesh.receiveShadow = true
  mesh.computeBoundingSphere()
}

/** Builds every static mesh for one world as a single Three.js group. */
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
  for (const [key, items] of byMat) group.add(instanced(boxGeo, mats[key], items, shadows))

  const wedges = layout.wedges.filter((w) => w.visible)
  if (wedges.length) {
    // Wedge origin is the base centre; the instancing helper scales from origin.
    group.add(instanced(getUnitWedge(), mats.stud, wedges, shadows))
  }

  for (const p of layout.pipes) {
    const mesh = new InstancedMesh(getPipeGeometry(p.radius, p.length, p.phi), mats.stud, 1)
    _p.set(p.p[0], p.p[1], p.p[2])
    _q.setFromAxisAngle(Y_AXIS, p.ry)
    mesh.setMatrixAt(0, _m.compose(_p, _q, _s.set(1, 1, 1)))
    mesh.setColorAt(0, _c.set(p.color))
    mesh.castShadow = shadows
    mesh.receiveShadow = true
    mesh.computeBoundingSphere()
    group.add(mesh)
  }

  // Pillars + every cylindrical prop part, one instanced batch.
  const cyls = [
    ...layout.cylinders.map((c) => ({ p: [c.p[0], c.p[1] + c.height / 2, c.p[2]], r: c.radius, h: c.height, color: c.color })),
    ...visuals.cylinders,
  ]
  if (cyls.length) {
    const mesh = new InstancedMesh(new CylinderGeometry(1, 1, 1, 14), mats.plain, cyls.length)
    const e = new Euler()
    cyls.forEach((c, i) => {
      _q.setFromEuler(e.set(c.rx || 0, 0, c.rz || 0))
      mesh.setMatrixAt(i, _m.compose(_p.set(...c.p), _q, _s.set(c.r, c.h, c.r)))
      mesh.setColorAt(i, _c.set(c.color))
    })
    finish(mesh, shadows)
    group.add(mesh)
  }
  if (visuals.cones.length) {
    const mesh = new InstancedMesh(new ConeGeometry(1, 1, 12), mats.plain, visuals.cones.length)
    visuals.cones.forEach((c, i) => {
      mesh.setMatrixAt(i, _m.compose(_p.set(c.p[0], c.p[1] + c.h / 2, c.p[2]), _q.identity(), _s.set(c.r, c.h, c.r)))
      mesh.setColorAt(i, _c.set(c.color))
    })
    finish(mesh, shadows)
    group.add(mesh)
  }
  if (visuals.rocks.length) {
    const mesh = new InstancedMesh(new IcosahedronGeometry(1, 0), mats.rock, visuals.rocks.length)
    visuals.rocks.forEach((r, i) => {
      _q.setFromAxisAngle(Y_AXIS, r.ry)
      mesh.setMatrixAt(i, _m.compose(_p.set(...r.p), _q, _s.set(...r.s)))
      mesh.setColorAt(i, _c.set(r.color))
    })
    finish(mesh, shadows)
    group.add(mesh)
  }

  // Rails + posts as instanced cylinders.
  const railItems = []
  const up = new Vector3(0, 1, 0)
  for (const r of layout.rails) {
    const a = new Vector3(...r.a)
    const b = new Vector3(...r.b)
    const dir = b.clone().sub(a)
    const len = dir.length()
    dir.normalize()
    railItems.push({ pos: a.clone().add(b).multiplyScalar(0.5), quat: new Quaternion().setFromUnitVectors(up, dir), scale: [0.075, len, 0.075] })
    if (r.posts) {
      const n = Math.max(2, Math.ceil(len / 4) + 1)
      for (let i = 0; i < n; i += 1) {
        const pt = a.clone().lerp(b, i / (n - 1))
        const h = Math.max(0.2, pt.y)
        railItems.push({ pos: new Vector3(pt.x, pt.y - h / 2, pt.z), quat: new Quaternion(), scale: [0.06, h, 0.06] })
      }
    }
  }
  if (railItems.length) {
    const mesh = new InstancedMesh(new CylinderGeometry(1, 1, 1, 10), mats.metal, railItems.length)
    railItems.forEach((it, i) => mesh.setMatrixAt(i, _m.compose(it.pos, it.quat, _s.set(...it.scale))))
    mesh.instanceMatrix.needsUpdate = true
    mesh.castShadow = shadows
    mesh.computeBoundingSphere()
    group.add(mesh)
  }

  // Water with a dark bed underneath for depth.
  const bedMat = new MeshStandardMaterial({ color: layout.world === 0 ? '#0b5c7a' : '#3a0b4a', roughness: 1 })
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

function Sign({ s }) {
  return (
    <group position={s.p} rotation={[s.tilt, s.ry, 0]}>
      <Text
        font={FONT_URL}
        fontSize={s.size}
        color={s.color}
        outlineColor={s.outline}
        outlineWidth={s.size * 0.09}
        anchorX="center"
        anchorY="middle"
      >
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

export function World({ layout, shadows }) {
  const group = useMemo(() => buildStatic(layout, shadows), [layout, shadows])

  useEffect(
    () => () => {
      group.traverse((o) => {
        if (o.isInstancedMesh) o.dispose()
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
      {layout.signs.map((s, i) => (
        <Near key={i} at={s.p}>
          <Sign s={s} />
        </Near>
      ))}
    </>
  )
}

export default World
