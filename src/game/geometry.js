import { BufferAttribute, BufferGeometry, Color } from 'three'

import { sampleRibbon } from '../shared/layout'

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

/* ------------------------------------------------------------------ ribbons */

/**
 * Triangles for a ribbon road (see `Builder.ribbon` in shared/layout.js): the
 * cross-section is swept along the smoothed path, so curves and slopes are one
 * seamless surface. Returns world-space positions plus one colour per vertex.
 */
export function ribbonTriangles(r) {
  const samples = sampleRibbon(r.pts)
  const hw = r.w / 2
  const t = r.thick
  const cw = 0.45
  const ch = 0.5
  // Clockwise cross-section (x right, y up); `c` picks the colour for the face
  // that starts at this point.
  const prof = r.curb
    ? [
        [-hw, ch, 'e'], [-hw + cw, ch, 'e'], [-hw + cw, 0, 't'], [hw - cw, 0, 'e'],
        [hw - cw, ch, 'e'], [hw, ch, 's'], [hw, -t, 's'], [-hw, -t, 's'],
      ]
    : [[-hw, 0, 't'], [hw, 0, 's'], [hw, -t, 's'], [-hw, -t, 's']]
  const rects = r.curb
    ? [[-hw, -t, -hw + cw, ch], [-hw + cw, -t, hw - cw, 0], [hw - cw, -t, hw, ch]]
    : [[-hw, -t, hw, 0]]

  const top = new Color(r.color)
  const edge = new Color(r.edge)
  const side = new Color(r.edge).multiplyScalar(0.78)
  const pick = (k) => (k === 't' ? top : k === 'e' ? edge : side)

  const pos = []
  const col = []
  const at = (s, x, y) => [s.x + -s.tz * x, s.y + y, s.z + s.tx * x]
  const tri = (a, b, c, color) => {
    pos.push(...a, ...b, ...c)
    for (let i = 0; i < 3; i += 1) col.push(color.r, color.g, color.b)
  }

  for (let i = 0; i < samples.length - 1; i += 1) {
    const s0 = samples[i]
    const s1 = samples[i + 1]
    for (let j = 0; j < prof.length; j += 1) {
      const A = prof[j]
      const B = prof[(j + 1) % prof.length]
      const c = pick(A[2])
      const a0 = at(s0, A[0], A[1])
      const b0 = at(s0, B[0], B[1])
      const b1 = at(s1, B[0], B[1])
      const a1 = at(s1, A[0], A[1])
      tri(a0, b0, b1, c)
      tri(a0, b1, a1, c)
    }
  }
  // End caps (start faces backwards along the path, end faces forwards).
  const first = samples[0]
  const last = samples[samples.length - 1]
  for (const [xa, ya, xb, yb] of rects) {
    tri(at(first, xa, ya), at(first, xb, ya), at(first, xb, yb), side)
    tri(at(first, xa, ya), at(first, xb, yb), at(first, xa, yb), side)
    tri(at(last, xa, ya), at(last, xb, yb), at(last, xb, ya), side)
    tri(at(last, xa, ya), at(last, xa, yb), at(last, xb, yb), side)
  }
  return { positions: new Float32Array(pos), colors: new Float32Array(col) }
}

export function ribbonGeometry(r) {
  const { positions, colors } = ribbonTriangles(r)
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(positions, 3))
  geo.setAttribute('color', new BufferAttribute(colors, 3))
  geo.setAttribute('uv', new BufferAttribute(new Float32Array((positions.length / 3) * 2), 2))
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  return geo
}
