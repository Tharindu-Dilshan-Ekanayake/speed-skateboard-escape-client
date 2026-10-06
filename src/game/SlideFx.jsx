import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { BoxGeometry, Color, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from 'three'

/**
 * Powerslide effect: sparks and dust kicked out from the wheels while a rider
 * brakes. Particles live in world space (added straight to the scene), so they
 * stay behind as the rider slides on.
 */

const COUNT = 48
const _m = new Matrix4()
const _s = new Vector3()
const _q = new Quaternion()
const _c = new Color()
const _origin = new Vector3()
const SPARK = [new Color('#ffe14d'), new Color('#ff9a1f'), new Color('#ffffff')]
const DUST = new Color('#d8d2c4')

export function SlideFx({ motionRef, anchorRef }) {
  const scene = useThree((s) => s.scene)
  const meshRef = useRef(null)
  const parts = useRef(Array.from({ length: COUNT }, () => ({ life: 0, max: 1, spark: true, p: new Vector3(), v: new Vector3(), size: 0.1 })))
  const next = useRef(0)
  const acc = useRef(0)

  useEffect(() => {
    const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false }), COUNT)
    mesh.frustumCulled = false
    mesh.visible = false
    _m.makeScale(0, 0, 0)
    for (let i = 0; i < COUNT; i += 1) {
      mesh.setMatrixAt(i, _m)
      mesh.setColorAt(i, _c.set('#ffffff'))
    }
    scene.add(mesh)
    meshRef.current = mesh
    return () => {
      scene.remove(mesh)
      mesh.geometry.dispose()
      mesh.material.dispose()
      meshRef.current = null
    }
  }, [scene])

  useFrame((_, dt) => {
    const m = motionRef.current
    const anchor = anchorRef.current
    const mesh = meshRef.current
    if (!m || !anchor || !mesh) return
    const list = parts.current

    if (m.braking && m.speed > 1.5) {
      acc.current += dt * (20 + m.speed * 2.5)
      anchor.getWorldPosition(_origin)
      anchor.getWorldQuaternion(_q)
      while (acc.current >= 1) {
        acc.current -= 1
        const pt = list[next.current]
        next.current = (next.current + 1) % COUNT
        const spark = Math.random() < 0.6
        // Spawn at one of the wheel ends of the (sideways) board.
        const side = Math.random() < 0.5 ? -1 : 1
        pt.p.set(side * 0.35, 0.06, (Math.random() - 0.5) * 0.4).applyQuaternion(_q).add(_origin)
        const out = spark ? 3 + Math.random() * 3 : 0.8 + Math.random()
        pt.v.set((Math.random() - 0.5) * out, spark ? 1.5 + Math.random() * 2.5 : 0.6 + Math.random() * 0.6, (Math.random() - 0.5) * out)
        pt.spark = spark
        pt.max = spark ? 0.25 + Math.random() * 0.2 : 0.5 + Math.random() * 0.3
        pt.life = pt.max
        pt.size = spark ? 0.05 + Math.random() * 0.04 : 0.18 + Math.random() * 0.12
        mesh.setColorAt(next.current === 0 ? COUNT - 1 : next.current - 1, spark ? SPARK[Math.floor(Math.random() * 3)] : DUST)
      }
    } else {
      acc.current = 0
    }

    let any = false
    for (let i = 0; i < COUNT; i += 1) {
      const pt = list[i]
      if (pt.life <= 0) {
        _m.makeScale(0, 0, 0)
      } else {
        any = true
        pt.life -= dt
        pt.v.y -= (pt.spark ? 12 : 1.5) * dt
        pt.p.addScaledVector(pt.v, dt)
        const k = Math.max(0, pt.life / pt.max)
        const size = pt.spark ? pt.size * k : pt.size * (1.6 - k * 0.6)
        _m.compose(pt.p, _q.identity(), _s.set(size, size, size))
        if (pt.life <= 0) _m.makeScale(0, 0, 0)
      }
      mesh.setMatrixAt(i, _m)
    }
    mesh.visible = any || m.braking
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return null
}

export default SlideFx
