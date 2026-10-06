import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { BackSide, BoxGeometry, Color, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, ShaderMaterial, Vector3 } from 'three'

/** Blocky clouds scattered along the course (seeded, so stable). */
function buildClouds(theme, ox) {
  const geo = new BoxGeometry(1, 1, 1)
  const mat = new MeshBasicMaterial({ color: theme.sky[0] === '#120a35' ? '#6a4a9a' : '#ffffff', fog: false })
  const pieces = []
  let seed = 7
  const rnd = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  for (let i = 0; i < 26; i += 1) {
    const cx = ox + (rnd() - 0.5) * 900
    const cz = 200 - rnd() * 3000
    const cy = 140 + rnd() * 90
    const n = 3 + Math.floor(rnd() * 4)
    for (let k = 0; k < n; k += 1) {
      const s = 18 + rnd() * 26
      pieces.push([cx + (rnd() - 0.5) * 50, cy + rnd() * 10, cz + (rnd() - 0.5) * 30, s, s * 0.55, s * 0.8])
    }
  }
  const mesh = new InstancedMesh(geo, mat, pieces.length)
  const m = new Matrix4()
  pieces.forEach(([x, y, z, sx, sy, sz], i) => {
    m.compose(new Vector3(x, y, z), new Quaternion(), new Vector3(sx, sy, sz))
    mesh.setMatrixAt(i, m)
  })
  mesh.instanceMatrix.needsUpdate = true
  mesh.computeBoundingSphere()
  return mesh
}

/** Gradient sky dome + blocky clouds that follow the camera. */
export function Sky({ theme, ox }) {
  const dome = useRef(null)

  const material = useMemo(
    () =>
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: new Color(theme.sky[0]) },
          bottom: { value: new Color(theme.sky[1]) },
        },
        vertexShader: `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          uniform vec3 top;
          uniform vec3 bottom;
          varying vec3 vDir;
          void main() {
            float h = clamp(vDir.y * 1.6 + 0.15, 0.0, 1.0);
            gl_FragColor = vec4(mix(bottom, top, pow(h, 0.8)), 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    [theme],
  )

  const clouds = useMemo(() => buildClouds(theme, ox), [theme, ox])

  useFrame(({ camera }) => {
    if (dome.current) dome.current.position.copy(camera.position)
  })

  return (
    <>
      <mesh ref={dome} material={material} renderOrder={-1} frustumCulled={false}>
        <sphereGeometry args={[1400, 32, 16]} />
      </mesh>
      <primitive object={clouds} />
    </>
  )
}

export default Sky
