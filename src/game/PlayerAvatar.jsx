import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Box3, MeshStandardMaterial, Vector3 } from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'

import { assetUrls, BASE_BODY_URL, isRealId, PART_SLOTS, skinIdOrDefault } from '../bloxity/avatarAssets'
import { loadOBJ, loadPartGLB, loadTexture } from '../bloxity/avatarLoader'
import { applyPart, applyProportions, applySkin, attachAccessory, collectRig, poseSkater } from './avatarRig'

/**
 * A Bloxity avatar assembled at runtime from `player.glb` + the equipped parts,
 * posed every frame as a skateboarder. Used for the local rider and for every
 * remote rider (with their own equipped/proportions payload).
 *
 * @param {{ equipped?: object|null, proportions?: object|null,
 *           motionRef: React.MutableRefObject<object>, targetHeight?: number,
 *           onReady?: () => void }} props
 */
export function PlayerAvatar({ equipped, proportions, motionRef, targetHeight = 1.8, onReady }) {
  const { scene: baseScene } = useGLTF(BASE_BODY_URL)
  const [assembled, setAssembled] = useState(false)

  const character = useMemo(() => cloneSkeleton(baseScene), [baseScene])

  const rig = useMemo(() => {
    const collected = collectRig(character)
    for (const mesh of collected.skinnedMeshes) {
      mesh.material = new MeshStandardMaterial({ color: 0xffffff, metalness: 0, roughness: 1 })
    }
    return collected
  }, [character])

  const fit = useMemo(() => {
    const box = new Box3().setFromObject(character)
    const size = box.getSize(new Vector3())
    if (!Number.isFinite(size.y) || size.y <= 0) return { scale: 1, footOffset: 0 }
    const scale = targetHeight / size.y
    return { scale, footOffset: -box.min.y * scale }
  }, [character, targetHeight])

  // Stable key so a re-sent but identical payload doesn't rebuild the avatar.
  const equippedKey = useMemo(() => JSON.stringify(equipped || {}), [equipped])

  useEffect(() => {
    let cancelled = false
    const attached = []
    const eq = JSON.parse(equippedKey)
    const jobs = []

    jobs.push(loadTexture(assetUrls.skinTexture(skinIdOrDefault(eq?.skinId))).then((texture) => ({ kind: 'skin', texture })))

    for (const [slot, cfg] of Object.entries(PART_SLOTS)) {
      const id = eq?.[cfg.idKey]
      if (!isRealId(id)) {
        jobs.push(Promise.resolve({ kind: 'part', slot, scene: null }))
        continue
      }
      jobs.push(loadPartGLB(assetUrls.part(slot, id)).then((scene) => ({ kind: 'part', slot, scene })))
    }

    for (const [kind, idKey, meshUrl, texUrl] of [
      ['hat', 'hatId', assetUrls.hatMesh, assetUrls.hatTexture],
      ['back', 'backId', assetUrls.backMesh, assetUrls.backTexture],
    ]) {
      const id = eq?.[idKey]
      if (!isRealId(id)) continue
      jobs.push(
        Promise.all([loadOBJ(meshUrl(id)), loadTexture(texUrl(id))]).then(([object, texture]) => ({
          kind: 'accessory',
          accessory: kind,
          object,
          texture,
        })),
      )
    }

    Promise.all(jobs)
      .then((results) => {
        if (cancelled) return
        for (const result of results) {
          try {
            if (result.kind === 'skin') applySkin(rig, result.texture)
            else if (result.kind === 'part') applyPart(rig, result.slot, result.scene)
            else if (result.kind === 'accessory' && result.object) {
              if (result.texture) {
                result.object.traverse((child) => {
                  if (child.isMesh) child.material = new MeshStandardMaterial({ map: result.texture })
                })
              }
              const added = attachAccessory(rig, result.accessory, result.object)
              if (added) attached.push(added)
            }
          } catch {
            // One bad slot must not take the rest of the character down.
          }
        }
        setAssembled(true)
      })
      .catch(() => {
        if (!cancelled) setAssembled(true)
      })

    return () => {
      cancelled = true
      for (const object of attached) {
        object.parent?.remove(object)
        object.traverse((child) => child.geometry?.dispose())
      }
    }
  }, [rig, equippedKey])

  const proportionsRef = useRef(proportions)
  useEffect(() => {
    proportionsRef.current = proportions
  }, [proportions])

  useFrame(() => {
    try {
      applyProportions(rig, proportionsRef.current || {})
      poseSkater(rig, motionRef?.current)
    } catch {
      // A malformed payload must not kill the render loop.
    }
  })

  useEffect(() => {
    if (assembled) onReady?.()
  }, [assembled, onReady])

  return (
    <group scale={fit.scale} position={[0, fit.footOffset, 0]}>
      <primitive object={character} />
    </group>
  )
}

useGLTF.preload(BASE_BODY_URL)

export default PlayerAvatar
