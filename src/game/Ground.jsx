import { RigidBody } from '@react-three/rapier'

const TRACK_LENGTH = 200
const TRACK_WIDTH = 20

/**
 * A long flat running track with a fixed Rapier collider, plus low side rails so the
 * player can't trivially run off the edge.
 *
 * Placeholder materials throughout — swap for real art later.
 */
export function Ground() {
  return (
    <>
      <RigidBody type="fixed" friction={1} name="ground">
        <mesh receiveShadow position={[0, -0.5, -TRACK_LENGTH / 2 + 20]}>
          <boxGeometry args={[TRACK_WIDTH, 1, TRACK_LENGTH]} />
          <meshStandardMaterial color="#3f7d4f" />
        </mesh>
      </RigidBody>

      {/* Side rails */}
      {[-1, 1].map((side) => (
        <RigidBody key={side} type="fixed" name={`rail-${side}`}>
          <mesh
            castShadow
            receiveShadow
            position={[(side * TRACK_WIDTH) / 2, 0.5, -TRACK_LENGTH / 2 + 20]}
          >
            <boxGeometry args={[0.5, 2, TRACK_LENGTH]} />
            <meshStandardMaterial color="#8a8f98" />
          </mesh>
        </RigidBody>
      ))}

      {/* Distance stripes, purely visual, so movement reads on a flat plane. */}
      {Array.from({ length: 20 }, (_, i) => (
        <mesh
          key={i}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.011, 10 - i * 10]}
        >
          <planeGeometry args={[TRACK_WIDTH - 1, 0.3]} />
          <meshStandardMaterial color="#ffffff" opacity={0.35} transparent />
        </mesh>
      ))}
    </>
  )
}

export default Ground
