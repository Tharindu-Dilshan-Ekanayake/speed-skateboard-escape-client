/**
 * Expands the layout's decorative items (trees, props, houses, arches, murals,
 * lane markings…) into a few primitive lists, so the whole map renders as a
 * handful of instanced draw calls:
 *   boxes:     { p, s, ry, color, mat }        mat: stud | dots | wood | plain | glow
 *   cylinders: { p, r, h, color, rx, rz }     p = centre
 *   cones:     { p, r, h, color }             p = base centre
 *   rocks:     { p, s, ry, color }
 */

const GRAFFITI = ['#ff3b6b', '#ffd21f', '#3fe8ff', '#7dff5a', '#b13bff', '#ff8a1f', '#ffffff']

/** Tiny deterministic hash -> [0, 1). */
const hash = (a, b = 0) => {
  const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453
  return s - Math.floor(s)
}

export function buildVisuals(layout) {
  const boxes = []
  const cylinders = []
  const cones = []
  const rocks = []
  const t = layout.theme
  const box = (p, s, color, mat = 'stud', ry = 0) => boxes.push({ p, s, color, mat, ry })
  const cyl = (p, r, h, color, rx = 0, rz = 0) => cylinders.push({ p, r, h, color, rx, rz })

  for (const b of layout.boxes) if (b.visible) boxes.push(b)

  /* ---- trees: chunky trunk + layered two-tone canopy ---- */
  for (const tr of layout.trees) {
    const [x, y, z] = tr.p
    const k = tr.s
    const h1 = hash(x, z)
    const h2 = hash(z, x)
    box([x, y + 3.2 * k, z], [1.5 * k, 6.4 * k, 1.5 * k], t.trunk, 'wood')
    box([x + 0.8 * k, y + 4.8 * k, z], [1.6 * k, 0.5 * k, 0.5 * k], t.trunk, 'wood')
    box([x, y + 7.6 * k, z], [7 * k, 3.6 * k, 7 * k], t.leaf)
    box([x + (h1 - 0.5) * 1.6 * k, y + 10.1 * k, z + (h2 - 0.5) * 1.6 * k], [5 * k, 2.4 * k, 5 * k], t.leafLight)
    box([x + 3.2 * k, y + 7 * k, z + 1.2 * k], [2.6 * k, 2.6 * k, 2.6 * k], t.leafDark)
    box([x - 2.8 * k, y + 8.2 * k, z - 1.8 * k], [2.4 * k, 2.4 * k, 2.4 * k], t.leafDark)
    box([x + (h2 - 0.5) * k, y + 11.8 * k, z], [2.6 * k, 1.4 * k, 2.6 * k], t.leaf)
  }

  /* ---- props ---- */
  for (const pr of layout.props) {
    const [x, y, z] = pr.p
    const k = pr.k || 1
    const c = Math.cos(pr.ry)
    const sn = Math.sin(pr.ry)
    // Local (dx, dz) offset rotated by the prop's yaw.
    const at = (dx, dy, dz) => [x + dx * c + dz * sn, y + dy, z - dx * sn + dz * c]
    switch (pr.kind) {
      case 'lamp': {
        const dir = x > layout.ox ? -1 : 1
        cyl([x, y + 3.1, z], 0.13, 6.2, '#3a3f52')
        box([x, y + 0.2, z], [0.6, 0.4, 0.6], '#3a3f52', 'plain')
        box([x + dir * 0.7, y + 6.15, z], [1.6, 0.18, 0.18], '#3a3f52', 'plain')
        box([x + dir * 1.35, y + 5.9, z], [0.7, 0.35, 0.5], layout.world === 0 ? '#fff4b8' : '#9ffcff', 'glow')
        break
      }
      case 'bench':
        box(at(0, 0.55, 0), [2.6, 0.18, 0.8], t.wood, 'wood', pr.ry)
        box(at(0, 0.95, -0.36), [2.6, 0.55, 0.14], t.wood, 'wood', pr.ry)
        box(at(-1.05, 0.28, 0), [0.16, 0.56, 0.7], '#3a3f52', 'plain', pr.ry)
        box(at(1.05, 0.28, 0), [0.16, 0.56, 0.7], '#3a3f52', 'plain', pr.ry)
        break
      case 'trash':
        cyl([x, y + 0.55, z], 0.42, 1.1, '#2f9a4a')
        cyl([x, y + 1.15, z], 0.48, 0.12, '#226e36')
        break
      case 'cone':
        cones.push({ p: [x, y + 0.06, z], r: 0.32, h: 0.85, color: '#ff7a1f' })
        cyl([x, y + 0.45, z], 0.22, 0.14, '#ffffff')
        box([x, y + 0.03, z], [0.7, 0.06, 0.7], '#22222a', 'plain')
        break
      case 'barrel': {
        const col = pr.color || '#ff3b3b'
        cyl([x, y + 0.7, z], 0.55, 1.4, col)
        cyl([x, y + 0.35, z], 0.57, 0.08, '#2a2a34')
        cyl([x, y + 1.05, z], 0.57, 0.08, '#2a2a34')
        break
      }
      case 'car': {
        const col = pr.color || '#ff3b3b'
        box(at(0, 0.7, 0), [2.4, 0.9, 4.6], col, 'stud', pr.ry)
        box(at(0, 1.5, -0.2), [2.0, 0.75, 2.5], col, 'stud', pr.ry)
        box(at(0, 1.5, -0.2), [2.06, 0.5, 2.3], '#2a3550', 'plain', pr.ry)
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) cyl(at(sx * 1.12, 0.38, sz * 1.5), 0.38, 0.3, '#1d1d24', 0, Math.PI / 2)
          box(at(sx * 0.75, 0.75, 2.31), [0.45, 0.25, 0.05], '#fff4b8', 'glow', pr.ry)
          box(at(sx * 0.8, 0.8, -2.31), [0.45, 0.2, 0.05], '#ff3b3b', 'glow', pr.ry)
        }
        break
      }
      case 'hydrant':
        cyl([x, y + 0.35, z], 0.2, 0.7, '#e8323c')
        cyl([x, y + 0.75, z], 0.24, 0.12, '#b8202a')
        cyl([x, y + 0.45, z], 0.08, 0.6, '#b8202a', 0, Math.PI / 2)
        break
      case 'planter': {
        box([x, y + 0.4, z], [2.6, 0.8, 2.6], '#9a7a5a', 'stud')
        box([x, y + 0.81, z], [2.2, 0.04, 2.2], '#4a3020', 'plain')
        box([x, y + 1.15, z], [1.9, 0.6, 1.9], t.leafDark)
        // A few blocky flowers poking out of the hedge.
        for (let i = 0; i < 4; i += 1) {
          const fx = x + (hash(x + i, z) - 0.5) * 1.5
          const fz = z + (hash(z, x + i) - 0.5) * 1.5
          box([fx, y + 1.55, fz], [0.34, 0.34, 0.34], GRAFFITI[(i + Math.floor(hash(x, z) * 7)) % GRAFFITI.length], 'plain')
        }
        break
      }
      case 'bush':
        box([x, y + 0.55 * k, z], [2 * k, 1.1 * k, 2 * k], t.leafDark)
        box([x + 0.6 * k, y + 0.9 * k, z + 0.3 * k], [1.3 * k, 1 * k, 1.3 * k], t.leaf)
        box([x - 0.6 * k, y + 0.8 * k, z - 0.4 * k], [1.1 * k, 0.9 * k, 1.1 * k], t.leafLight)
        break
      case 'rock': {
        const r = hash(x, z)
        rocks.push({ p: [x, y + 0.45 * k, z], s: [1.2 * k * (0.9 + r * 0.4), 0.9 * k, 1.1 * k], ry: r * 6, color: t.rock })
        if (r > 0.4) rocks.push({ p: [x + 1.1 * k, y + 0.25 * k, z + 0.6 * k], s: [0.6 * k, 0.5 * k, 0.6 * k], ry: r * 3, color: t.rock })
        break
      }
      default:
        break
    }
  }

  /* ---- decor ---- */
  for (const d of layout.decor) {
    if (d.kind === 'house') {
      const [x, y, z] = d.p
      const [w, h, dep] = d.s
      box([x, y + h / 2, z], [w, h, dep], d.color, 'stud')
      box([x, y + h + 0.35, z], [w + 0.8, 0.7, dep + 0.8], '#ffffff', 'plain')
      box([x + w * 0.25, y + h + 1.4, z], [1, 1.6, 1], '#9a4a3a', 'stud')
      const face = x > layout.ox ? -1 : 1
      const rows = Math.max(1, Math.floor(h / 3.5))
      for (let r = 0; r < rows; r += 1) {
        for (const off of [-dep / 4, dep / 4]) {
          box([x + face * (w / 2 + 0.05), y + 2 + r * 3.2, z + off], [0.15, 1.6, 1.6], layout.world === 0 ? '#bfefff' : '#ffe14d', layout.world === 0 ? 'plain' : 'glow')
        }
      }
    } else if (d.kind === 'arch') {
      // Stage gate: two banded towers with neon strips, stepped caps with flags,
      // a two-tone beam lined with bulbs and a checkered crown.
      const [x, y, z] = d.p
      const half = d.w / 2
      const zc = z - 0.6
      for (const s of [-1, 1]) {
        const tx = x + s * (half + 0.6)
        box([tx, y + 0.5, zc], [3.4, 1, 3.4], '#ffffff', 'plain')
        box([tx, y + 8, zc], [2.6, 15, 2.6], d.color)
        for (const by of [3, 7.5, 12]) box([tx, y + by, zc], [2.8, 0.45, 2.8], '#ffffff', 'plain')
        // Neon strip on the face toward the track.
        box([tx - s * 1.33, y + 7.5, zc], [0.12, 13, 0.5], '#ffffff', 'glow')
        box([tx, y + 15.9, zc], [3.0, 0.8, 3.0], '#ffffff', 'plain')
        box([tx, y + 16.7, zc], [2.2, 0.8, 2.2], d.color)
        box([tx, y + 17.4, zc], [1.3, 0.6, 1.3], '#ffd21f', 'plain')
        cyl([tx, y + 19.2, zc], 0.07, 3, '#e8eaf2')
        box([tx + 0.75, y + 20.1, zc], [1.4, 0.9, 0.06], s > 0 ? '#ff3b4a' : '#3fa2ff', 'plain')
      }
      box([x, y + 14.3, zc], [d.w + 4.4, 2.2, 2], d.color)
      box([x, y + 13.35, zc + 1.02], [d.w + 2, 0.3, 0.06], '#ffffff', 'plain')
      const bulbs = Math.floor(d.w / 1.3)
      for (let i = 0; i < bulbs; i += 1) {
        const bx = x - d.w / 2 + (i + 0.5) * (d.w / bulbs)
        box([bx, y + 13.1, zc + 1.0], [0.34, 0.34, 0.2], i % 2 ? '#fff4b8' : '#ffd21f', 'glow')
      }
      for (let i = 0; i < 18; i += 1) {
        box([x - (d.w + 4) / 2 + (i + 0.5) * ((d.w + 4) / 18), y + 15.7, zc], [(d.w + 4) / 18, 0.6, 2.1], i % 2 ? '#ffffff' : '#1b1530', 'plain')
      }
    } else if (d.kind === 'mural') {
      const [x, y, z] = d.p
      const s = d.side
      box([x + s * 0.06, y, z], [0.12, d.h, d.w], '#fdf4ff', 'plain')
      const n = 4 + Math.floor(hash(d.seed) * 3)
      for (let i = 0; i < n; i += 1) {
        const r1 = hash(d.seed, i)
        const r2 = hash(i, d.seed)
        const col = GRAFFITI[Math.floor(r1 * GRAFFITI.length)]
        const bw = d.w / n
        box([x + s * 0.14, y + (r2 - 0.5) * d.h * 0.3, z - d.w / 2 + (i + 0.5) * bw], [0.1, d.h * (0.45 + r2 * 0.4), bw * 0.8], col, 'plain')
        box([x + s * 0.18, y - d.h * 0.2 + r1 * d.h * 0.3, z - d.w / 2 + (i + 0.5) * bw], [0.08, d.h * 0.12, bw * 0.95], GRAFFITI[(i + 3) % GRAFFITI.length], 'plain')
      }
    } else if (d.kind === 'fountain') {
      const [x, y, z] = d.p
      // Basin rim, water, column, upper bowl and a little spout of water.
      for (const [dx, dz, w, l] of [[0, 3.05, 6.4, 0.3], [0, -3.05, 6.4, 0.3], [3.05, 0, 0.3, 6.4], [-3.05, 0, 0.3, 6.4]]) {
        box([x + dx, y + 1.0, z + dz], [w, 0.4, l], '#ffffff', 'plain')
      }
      box([x, y + 0.82, z], [5.8, 0.06, 5.8], d.water, 'glow')
      cyl([x, y + 1.8, z], 0.45, 2, '#d8d4ea')
      cyl([x, y + 2.9, z], 1.6, 0.35, '#ffffff')
      cyl([x, y + 3.1, z], 1.35, 0.08, d.water)
      cyl([x, y + 3.6, z], 0.18, 1.1, d.water)
      cones.push({ p: [x, y + 4.1, z], r: 0.55, h: 0.6, color: '#bff6ff' })
    } else if (d.kind === 'flagpole') {
      const [x, y, z] = d.p
      cyl([x, y + 6, z], 0.12, 12, '#e8eaf2')
      cyl([x, y + 12.15, z], 0.28, 0.3, '#ffd21f')
      box([x + 1.3, y + 10.8, z], [2.4, 1.5, 0.08], d.color, 'plain')
      box([x + 1.3, y + 10.8, z + 0.01], [2.4, 0.35, 0.08], '#ffffff', 'plain')
      box([x, y + 0.2, z], [0.9, 0.4, 0.9], '#3a3f52', 'plain')
    } else if (d.kind === 'chevron') {
      // ">" floor arrow pointing along local -Z of ry.
      const [x, , z] = d.p
      const c = Math.cos(d.ry)
      const sn = Math.sin(d.ry)
      for (const arm of [-1, 1]) {
        const ox = arm * 0.55
        const oz = 0.45
        box([x + ox * c + oz * sn, 0.035, z - ox * sn + oz * c], [0.32, 0.07, 1.5], d.color, 'plain', d.ry + arm * 0.75)
      }
    } else if (d.kind === 'bunting') {
      const [x, y, z] = d.p
      const n = Math.floor(d.w / 1.4)
      box([x, y + 0.5, z], [d.w, 0.06, 0.06], '#f4f4f8', 'plain')
      for (let i = 0; i < n; i += 1) {
        const u = (i + 0.5) / n
        const sag = Math.sin(u * Math.PI) * 1.4
        box([x - d.w / 2 + u * d.w, y + 0.5 - sag, z], [0.7, 0.75, 0.06], d.colors[i % d.colors.length], 'plain')
      }
    } else if (d.kind === 'banner') {
      const [x, y, z] = d.p
      const s = d.side
      box([x + s * 0.05, y + 2.6, z], [0.3, 0.3, 3.2], '#3a3f52', 'plain')
      box([x + s * 0.1, y, z], [0.1, 5, 2.6], d.color, 'plain')
      box([x + s * 0.16, y + 0.8, z], [0.06, 0.5, 2.6], '#ffffff', 'plain')
      box([x + s * 0.16, y - 0.8, z], [0.06, 0.5, 2.6], '#ffffff', 'plain')
      box([x + s * 0.1, y - 2.8, z - 0.65], [0.1, 0.6, 1.3], d.color, 'plain')
      box([x + s * 0.1, y - 2.8, z + 0.65], [0.1, 0.6, 1.3], d.color, 'plain')
    } else if (d.kind === 'awning') {
      const [x, y, z] = d.p
      const stripes = 9
      for (let i = 0; i < stripes; i += 1) {
        const sx = x - d.w / 2 + (i + 0.5) * (d.w / stripes)
        box([sx, y, z], [d.w / stripes, 0.5, d.d], i % 2 ? '#ffffff' : '#2f7bff', 'plain')
        box([sx, y - 0.7, z + d.d / 2], [d.w / stripes, 1.2, 0.2], i % 2 ? '#ffffff' : '#2f7bff', 'plain')
      }
    } else if (d.kind === 'shopkeeper') {
      const [x, y, z] = d.p
      box([x, y + 1.0, z], [0.9, 2, 0.5], '#1d1d24', 'plain')
      box([x, y + 2.6, z], [1.6, 1.4, 0.8], '#1d1d24', 'plain')
      box([x - 1.05, y + 2.5, z], [0.5, 1.4, 0.5], '#f1c27d', 'plain')
      box([x + 1.05, y + 2.5, z], [0.5, 1.4, 0.5], '#f1c27d', 'plain')
      box([x, y + 3.75, z], [0.95, 0.95, 0.95], '#f1c27d', 'plain')
      box([x, y + 4.3, z], [1.05, 0.35, 1.05], '#22222a', 'plain')
      box([x, y + 2.95, z + 0.42], [0.25, 0.25, 0.05], '#ffd21f', 'plain')
    } else if (d.kind === 'lane') {
      const [x0, z0] = d.a
      const [x1, z1] = d.b
      const len = Math.hypot(x1 - x0, z1 - z0)
      const ry = Math.atan2(x1 - x0, z1 - z0)
      const nx = Math.cos(ry)
      const nz = -Math.sin(ry)
      for (const side of [-1, 1]) {
        const off = side * (d.w / 2 - 0.45)
        box([(x0 + x1) / 2 + nx * off, 0.03, (z0 + z1) / 2 + nz * off], [0.35, 0.06, len], '#ffffff', 'plain', ry)
      }
      const dashes = Math.floor(len / 3)
      for (let i = 0; i < dashes; i += 1) {
        const u = (i + 0.5) / dashes
        box([x0 + (x1 - x0) * u, 0.03, z0 + (z1 - z0) * u], [0.35, 0.06, 1.4], '#ffd21f', 'plain', ry)
      }
    }
  }

  for (const s of layout.stripes) {
    const n = Math.round(s.w / 1.2)
    for (let i = 0; i < n; i += 1) {
      box([s.p[0] - s.w / 2 + (i + 0.5) * (s.w / n), 0.03, s.p[2]], [s.w / n, 0.06, 0.8], i % 2 ? '#1b1b22' : '#ffd21f', 'plain')
    }
  }

  return { boxes, cylinders, cones, rocks }
}
