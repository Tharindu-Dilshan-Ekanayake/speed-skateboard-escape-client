import {
  CanvasTexture,
  Color,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three'

/**
 * Procedural textures (no image downloads) + a world-space "triplanar" mapping so
 * the Roblox-style studs keep the same size on every box, whatever its scale.
 */

function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const g = canvas.getContext('2d')
  draw(g, size)
  const tex = new CanvasTexture(canvas)
  tex.wrapS = RepeatWrapping
  tex.wrapT = RepeatWrapping
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/** Roblox 2022-style "studs": a soft L-shaped bevel per stud. */
const studTexture = () =>
  canvasTexture(128, (g, s) => {
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, s, s)
    const cell = s / 4
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        const px = x * cell
        const py = y * cell
        g.strokeStyle = 'rgba(0,0,0,0.13)'
        g.lineWidth = 3
        g.beginPath()
        g.moveTo(px + cell * 0.22, py + cell * 0.78)
        g.lineTo(px + cell * 0.78, py + cell * 0.78)
        g.lineTo(px + cell * 0.78, py + cell * 0.22)
        g.stroke()
        g.strokeStyle = 'rgba(255,255,255,0.9)'
        g.lineWidth = 2
        g.beginPath()
        g.moveTo(px + cell * 0.22, py + cell * 0.72)
        g.lineTo(px + cell * 0.22, py + cell * 0.22)
        g.lineTo(px + cell * 0.72, py + cell * 0.22)
        g.stroke()
      }
    }
  })

/** Brick walls: flat colour with a grid of darker dots. */
const dotsTexture = () =>
  canvasTexture(128, (g, s) => {
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, s, s)
    const step = s / 8
    g.fillStyle = 'rgba(80,20,0,0.28)'
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        g.beginPath()
        g.arc(x * step + step / 2 + (y % 2) * (step / 2), y * step + step / 2, step * 0.17, 0, Math.PI * 2)
        g.fill()
      }
    }
  })

const woodTexture = () =>
  canvasTexture(128, (g, s) => {
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, s, s)
    for (let i = 0; i < 4; i += 1) {
      g.fillStyle = i % 2 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.0)'
      g.fillRect(0, (i * s) / 4, s, s / 4)
      g.fillStyle = 'rgba(0,0,0,0.22)'
      g.fillRect(0, (i * s) / 4, s, 2)
      g.fillRect(((i * 37) % 4) * (s / 4) + 10, (i * s) / 4, 2, s / 4)
    }
    g.strokeStyle = 'rgba(0,0,0,0.07)'
    for (let i = 0; i < 18; i += 1) {
      g.beginPath()
      const y = (i * 53) % s
      g.moveTo(0, y)
      g.bezierCurveTo(s * 0.3, y + 3, s * 0.6, y - 3, s, y + 1)
      g.stroke()
    }
  })

const waterTexture = () =>
  canvasTexture(256, (g, s) => {
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, s, s)
    g.strokeStyle = 'rgba(255,255,255,1)'
    g.fillStyle = 'rgba(0,60,90,0.12)'
    g.fillRect(0, 0, s, s)
    g.lineWidth = 5
    g.strokeStyle = 'rgba(255,255,255,0.75)'
    for (let i = 0; i < 9; i += 1) {
      const cx = (i * 97) % s
      const cy = (i * 61) % s
      for (const [dx, dy] of [[0, 0], [s, 0], [0, s], [-s, 0], [0, -s]]) {
        g.beginPath()
        g.ellipse(cx + dx, cy + dy, 34, 20, 0, 0.2, Math.PI - 0.2)
        g.stroke()
      }
    }
  })

/* -------------------------------------------------------- triplanar shader */

function applyTriplanar(material, scale) {
  material.userData.tpScale = { value: scale }
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTpScale = material.userData.tpScale
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vTpPos;\nvarying vec3 vTpNormal;',
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 tpWorld = vec4( transformed, 1.0 );
        vec3 tpN = objectNormal;
        #ifdef USE_INSTANCING
          tpWorld = instanceMatrix * tpWorld;
          mat3 tpIm = mat3( instanceMatrix );
          tpN /= vec3( dot( tpIm[ 0 ], tpIm[ 0 ] ), dot( tpIm[ 1 ], tpIm[ 1 ] ), dot( tpIm[ 2 ], tpIm[ 2 ] ) );
          tpN = tpIm * tpN;
        #endif
        tpWorld = modelMatrix * tpWorld;
        vTpPos = tpWorld.xyz;
        vTpNormal = normalize( mat3( modelMatrix ) * tpN );`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vTpPos;\nvarying vec3 vTpNormal;\nuniform float uTpScale;',
      )
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
          vec3 tpAn = abs( vTpNormal );
          vec2 tpUv = tpAn.y > max( tpAn.x, tpAn.z ) ? vTpPos.xz : ( tpAn.x > tpAn.z ? vTpPos.zy : vTpPos.xy );
          vec4 sampledDiffuseColor = texture2D( map, tpUv * uTpScale );
          diffuseColor *= sampledDiffuseColor;
        #endif`,
      )
  }
  material.customProgramCacheKey = () => `tp-${scale}`
  return material
}

let cache = null

/** Shared materials, created once (textures need a DOM canvas). */
export function getMaterials() {
  if (cache) return cache
  const stud = studTexture()
  const dots = dotsTexture()
  const wood = woodTexture()
  const water = waterTexture()
  cache = {
    stud: applyTriplanar(new MeshStandardMaterial({ map: stud, roughness: 0.82, metalness: 0 }), 1 / 1.6),
    dots: applyTriplanar(new MeshStandardMaterial({ map: dots, roughness: 0.92, metalness: 0 }), 1 / 3.2),
    wood: applyTriplanar(new MeshStandardMaterial({ map: wood, roughness: 0.9, metalness: 0 }), 1 / 2.5),
    plain: new MeshStandardMaterial({ roughness: 0.6, metalness: 0.05 }),
    // Lamps, headlights, neon windows: unlit, tinted per instance.
    glow: new MeshBasicMaterial({ color: '#ffffff' }),
    rock: new MeshStandardMaterial({ roughness: 0.95, metalness: 0, flatShading: true }),
    metal: new MeshStandardMaterial({ color: '#d9dde8', roughness: 0.25, metalness: 0.75 }),
    water: new MeshStandardMaterial({
      map: water,
      color: new Color('#35d8f0'),
      roughness: 0.15,
      metalness: 0.1,
      transparent: true,
      opacity: 0.92,
      emissive: new Color('#0c6f86'),
      emissiveIntensity: 0.35,
    }),
    waterTexture: water,
  }
  return cache
}
