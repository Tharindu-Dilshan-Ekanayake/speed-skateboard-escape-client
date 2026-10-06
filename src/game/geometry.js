import { BufferAttribute, BufferGeometry } from 'three'

/**
 * Custom geometry shared by the renderer and the physics builder, so what you
 * see is exactly what you collide with.
 */

function fromTriangles(positions) {
  const geo = new BufferGeometry()
  const arr = new Float32Array(positions)
  geo.setAttribute('position', new BufferAttribute(arr, 3))
  // Placeholder UVs: the triplanar material maps in world space anyway.
  geo.setAttribute('uv', new BufferAttribute(new Float32Array((arr.length / 3) * 2), 2))
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  geo.computeBoundingBox()
  return geo
}

/**
 * Unit wedge: footprint x,z in [-0.5, 0.5], height 0 at z=+0.5 rising to 1 at
 * z=-0.5. Scale by (width, height, length) and rotate about Y.
 */
export function unitWedgeTriangles() {
  const a = [-0.5, 0, 0.5]
  const b = [0.5, 0, 0.5]
  const c = [0.5, 0, -0.5]
  const d = [-0.5, 0, -0.5]
  const e = [-0.5, 1, -0.5]
  const f = [0.5, 1, -0.5]
  const tris = [
    // slope
    a, b, f,
    a, f, e,
    // back
    d, e, f,
    d, f, c,
    // bottom
    a, d, c,
    a, c, b,
    // sides
    a, e, d,
    b, c, f,
  ]
  return tris.flat()
}

let wedgeGeo = null
export function getUnitWedge() {
  if (!wedgeGeo) wedgeGeo = fromTriangles(unitWedgeTriangles())
  return wedgeGeo
}

/** The 6 corner points of a placed wedge, for a convex-hull collider. */
export function wedgeHullPoints(w) {
  const [sx, sy, sz] = w.s
  const cos = Math.cos(w.ry)
  const sin = Math.sin(w.ry)
  const local = [
    [-0.5, 0, 0.5], [0.5, 0, 0.5], [0.5, 0, -0.5], [-0.5, 0, -0.5], [-0.5, 1, -0.5], [0.5, 1, -0.5],
  ]
  const out = []
  for (const [x, y, z] of local) {
    const lx = x * sx
    const lz = z * sz
    out.push(w.p[0] + lx * cos + lz * sin, w.p[1] + y * sy, w.p[2] - lx * sin + lz * cos)
  }
  return new Float32Array(out)
}

/**
 * Quarter pipe in local space: curve from (0,0) rising toward +X up to angle phi,
 * extruded along Z (length), plus back wall and side caps.
 */
export function pipeTriangles(radius, length, phi, segments = 16) {
  const prof = []
  for (let i = 0; i <= segments; i += 1) {
    const a = (phi * i) / segments
    prof.push([radius * Math.sin(a), radius * (1 - Math.cos(a))])
  }
  const xBack = prof[prof.length - 1][0]
  const top = prof[prof.length - 1][1]
  const z0 = -length / 2
  const z1 = length / 2
  const t = []
  const quad = (p0, p1, p2, p3) => t.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3)
  for (let i = 0; i < segments; i += 1) {
    const [x0, y0] = prof[i]
    const [x1, y1] = prof[i + 1]
    // Facing the incoming rider (normal toward -X / +Y).
    quad([x0, y0, z1], [x1, y1, z1], [x1, y1, z0], [x0, y0, z0])
  }
  // Back wall.
  quad([xBack, top, z1], [xBack, 0, z1], [xBack, 0, z0], [xBack, top, z0])
  // Side caps (fan from the bottom-back corner).
  for (let i = 0; i < segments; i += 1) {
    const [x0, y0] = prof[i]
    const [x1, y1] = prof[i + 1]
    t.push(xBack, 0, z1, x1, y1, z1, x0, y0, z1)
    t.push(xBack, 0, z0, x0, y0, z0, x1, y1, z0)
  }
  return t
}

const pipeCache = new Map()
export function getPipeGeometry(radius, length, phi) {
  const key = `${radius}|${length}|${phi.toFixed(4)}`
  if (!pipeCache.has(key)) pipeCache.set(key, fromTriangles(pipeTriangles(radius, length, phi)))
  return pipeCache.get(key)
}

/** World-space triangle soup for a placed pipe (for the trimesh collider). */
export function pipeWorldTriangles(pipe) {
  const local = pipeTriangles(pipe.radius, pipe.length, pipe.phi)
  const cos = Math.cos(pipe.ry)
  const sin = Math.sin(pipe.ry)
  const out = new Float32Array(local.length)
  for (let i = 0; i < local.length; i += 3) {
    const x = local[i]
    const y = local[i + 1]
    const z = local[i + 2]
    out[i] = pipe.p[0] + x * cos + z * sin
    out[i + 1] = pipe.p[1] + y
    out[i + 2] = pipe.p[2] - x * sin + z * cos
  }
  return out
}
