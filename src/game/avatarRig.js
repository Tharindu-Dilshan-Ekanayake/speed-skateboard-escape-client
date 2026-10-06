import { Box3, NearestFilter, Quaternion, Vector3 } from 'three'

import { BACK_BONE, HAT_BONE, NECK_OFFSET_BONE, PART_SLOTS } from '../bloxity/avatarAssets'

/**
 * Rig manipulation for the base `player.glb` character.
 *
 * The rig's real structure (confirmed by reading player.glb directly):
 *   character
 *     - default_arm_L / default_arm_R / default_head
 *     - default_leg_L / default_leg_R / default_torso   (6 SkinnedMeshes, 1 skeleton)
 *     - Rig1
 *         - Spine1 > Spine2 > { ArmL_Offset > ArmL1 > ArmL2,
 *                               ArmR_Offset > ArmR1 > ArmR2,
 *                               Neck_Offset > Neck1 }
 *         - LegL_Offset > LegL1 > LegL2, LegR_Offset > LegR1 > LegR2
 *
 * Two consequences drive everything below:
 *  1. Body parts are NOT attached to bones. Each is a separate SkinnedMesh sharing one
 *     skeleton, so equipping a part means swapping that mesh's geometry (remapping
 *     skin indices into the base skeleton's bone order first).
 *  2. Accessories DO attach to bones: hats to `Neck1`, back items to `Spine2`.
 *
 * player.glb ships no animation clips, so the character is posed, not animated.
 */

/**
 * Walks the loaded rig and collects everything later operations need.
 *
 * @param {import('three').Object3D} root
 */
export function collectRig(root) {
  const rig = {
    root,
    skeleton: null,
    /** slot -> SkinnedMesh */
    partMeshes: {},
    /** slot -> the pristine geometry to restore on unequip */
    originalGeometries: {},
    /** bone name -> { bone, origPos, origQuat, origScale } */
    bones: {},
    hatBone: null,
    backBone: null,
    neckOffsetBindY: 0,
    skinnedMeshes: [],
    /** Rest Y of the character root, so the run-cycle bob can return to it. */
    rootRestY: root.position.y,
    rootRestX: root.position.x,
  }

  const meshBySlot = new Map(
    Object.entries(PART_SLOTS).map(([slot, cfg]) => [cfg.mesh.toLowerCase(), slot]),
  )

  root.traverse((node) => {
    if (node.isSkinnedMesh) {
      node.castShadow = true
      node.receiveShadow = true
      rig.skinnedMeshes.push(node)
      if (!rig.skeleton) rig.skeleton = node.skeleton

      const slot = meshBySlot.get((node.name || '').toLowerCase())
      if (slot) {
        rig.partMeshes[slot] = node
        rig.originalGeometries[slot] = node.geometry.clone()
      }
    } else if (node.isMesh) {
      node.castShadow = true
      node.receiveShadow = true
    }
  })

  const skeleton = rig.skeleton
  if (skeleton) {
    for (const bone of skeleton.bones) {
      // Proportions are re-applied every frame from these rest values.
      bone.matrixAutoUpdate = true
      rig.bones[bone.name] = {
        bone,
        origPos: bone.position.clone(),
        origQuat: bone.quaternion.clone(),
        origScale: bone.scale.clone(),
      }
    }

    // Bone local axes are NOT world-aligned in this rig: a limb bone's local X
    // points along world -Z and its local Z along world -X, so rotating a leg about
    // its local X swings it sideways instead of forward/back. The offsets differ per
    // bone (Spine1 is identity, ArmL2 is off by ~14 degrees), so rather than hardcode
    // an axis, record for each bone the local-space axis matching each character-space
    // axis and animate about those.
    root.updateMatrixWorld(true)
    const rootQuat = new Quaternion()
    root.getWorldQuaternion(rootQuat)
    const rootQuatInv = rootQuat.invert()
    const boneWorld = new Quaternion()

    for (const bone of skeleton.bones) {
      const entry = rig.bones[bone.name]
      if (!entry) continue
      bone.getWorldQuaternion(boneWorld)
      // Bone orientation relative to the character, then inverted: this maps a
      // character-space axis into the bone's own local frame.
      const relInv = rootQuatInv.clone().multiply(boneWorld).invert()
      /** Local axis to rotate about for forward/back swing. */
      entry.axisX = new Vector3(1, 0, 0).applyQuaternion(relInv).normalize()
      /** Local axis to rotate about for lateral sway. */
      entry.axisZ = new Vector3(0, 0, 1).applyQuaternion(relInv).normalize()
    }

    // Leg measurements for foot placement (kick-push IK), in the character's
    // parent space at rest: hip height, thigh and shin length, sole height.
    const soleY = new Box3().setFromObject(root).min.y
    const parentInv = root.parent ? root.parent.matrixWorld.clone().invert() : null
    const at = (name) => {
      const v = rig.bones[name]?.bone.getWorldPosition(new Vector3())
      return v && parentInv ? v.applyMatrix4(parentInv) : v
    }
    rig.legs = {}
    for (const side of ['L', 'R']) {
      const hip = at(`Leg${side}1`)
      const knee = at(`Leg${side}2`)
      if (!hip || !knee) continue
      rig.legs[side] = { hipX: hip.x, hipY: hip.y, l1: hip.distanceTo(knee), l2: Math.max(0.01, knee.y - soleY) }
    }
    rig.soleY = soleY
    // +1 when the rider's right is +X in character space.
    rig.rightSign = rig.legs.R && rig.legs.L && rig.legs.R.hipX < rig.legs.L.hipX ? -1 : 1

    rig.hatBone = skeleton.bones.find((b) => b.name === HAT_BONE) || null
    rig.backBone = skeleton.bones.find((b) => b.name === BACK_BONE) || null

    const neckIndex = skeleton.bones.findIndex((b) => b.name === NECK_OFFSET_BONE)
    if (neckIndex >= 0) {
      // elements[13] is the Y translation of the inverted bind matrix.
      rig.neckOffsetBindY = skeleton.boneInverses[neckIndex].clone().invert().elements[13]
    }
  }

  return rig
}

/** Bloxity textures are authored unflipped and pixel-art filtered. */
export function configureAvatarTexture(texture) {
  if (!texture) return texture
  texture.flipY = false
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  texture.needsUpdate = true
  return texture
}

/**
 * Applies the skin texture to every skinned mesh of the base body.
 * The base body ships with an empty texture, so this always runs - with skin "0"
 * standing in when nothing is equipped.
 */
export function applySkin(rig, texture) {
  if (!texture) return
  for (const mesh of rig.skinnedMeshes) {
    if (!mesh.material) continue
    mesh.material.map = texture
    mesh.material.needsUpdate = true
  }
}

/**
 * Swaps a body part's geometry onto its base skinned mesh.
 *
 * A part GLB carries its own skeleton whose bone *order* may differ from the base
 * rig's. Its `skinIndex` attribute therefore has to be remapped by bone name, or the
 * limb deforms against the wrong bones.
 *
 * @param {object} rig from `collectRig`
 * @param {string} slot key of PART_SLOTS
 * @param {import('three').Object3D|null} partScene loaded GLB scene, or null to reset
 */
export function applyPart(rig, slot, partScene) {
  const targetMesh = rig.partMeshes[slot]
  if (!targetMesh) return

  // Unequipped / failed download: restore the part baked into player.glb.
  if (!partScene) {
    const original = rig.originalGeometries[slot]
    if (original && targetMesh.geometry !== original) targetMesh.geometry = original
    return
  }

  let skinnedSource = null
  let plainSource = null
  partScene.traverse((node) => {
    if (node.isSkinnedMesh && !skinnedSource) skinnedSource = node
    else if (node.isMesh && !plainSource) plainSource = node
  })

  if (!skinnedSource) {
    // Some parts ship as plain meshes; use them as-is.
    if (plainSource) targetMesh.geometry = plainSource.geometry
    return
  }

  const baseSkeleton = rig.skeleton
  if (!baseSkeleton || !skinnedSource.skeleton) {
    targetMesh.geometry = skinnedSource.geometry
    return
  }

  const geometry = skinnedSource.geometry.clone()

  const baseIndexByName = new Map()
  baseSkeleton.bones.forEach((bone, i) => baseIndexByName.set(bone.name, i))

  const remap = new Map()
  skinnedSource.skeleton.bones.forEach((bone, i) => {
    const baseIndex = baseIndexByName.get(bone.name)
    if (baseIndex !== undefined) remap.set(i, baseIndex)
  })

  const skinIndex = geometry.getAttribute('skinIndex')
  if (skinIndex) {
    const array = skinIndex.array
    for (let i = 0; i < array.length; i += 1) {
      const mapped = remap.get(array[i])
      if (mapped !== undefined) array[i] = mapped
    }
    skinIndex.needsUpdate = true
  }

  targetMesh.geometry = geometry
}

/**
 * Attaches a hat or back accessory to its bone.
 * Offsets are the SDK's own: hats sit at y=0.8 on `Neck1`, back items at the origin
 * of `Spine2`.
 */
export function attachAccessory(rig, kind, object) {
  const bone = kind === 'hat' ? rig.hatBone : rig.backBone
  if (!object || !bone) return null

  object.scale.setScalar(1)
  object.position.set(0, kind === 'hat' ? 0.8 : 0, 0)
  object.traverse((child) => {
    if (child.isMesh) child.castShadow = true
  })

  bone.add(object)
  return object
}

/**
 * Applies Bloxity body proportions.
 *
 * Must run every frame: each bone is reset to its rest transform before the
 * multipliers are re-applied, which is what makes the result idempotent and lets
 * proportion changes take effect live.
 *
 * `height`, `armLength`, `headScale` and `neckHeight` are applied exactly as the
 * Bloxity portal does, so the in-game body matches the preview. The remaining three
 * (`shoulderWidth`, `torsoScaleX`, `legOffsetX`) are not implemented in the SDK's
 * preview renderer; they are applied here in the spirit of their names and are the
 * ones to sanity-check against the portal.
 */
export function applyProportions(rig, proportions) {
  const skeleton = rig.skeleton
  if (!skeleton || !proportions) return

  const height = proportions.height ?? 1
  const armLength = proportions.armLength ?? 1
  const headScale = proportions.headScale ?? 1
  const neckHeight = proportions.neckHeight ?? 1
  const shoulderWidth = proportions.shoulderWidth ?? 1
  const torsoScaleX = proportions.torsoScaleX ?? 1
  const legOffsetX = proportions.legOffsetX ?? 1

  // Overall height is a scale on the character root, not on a bone.
  rig.root.scale.set(1, height, 1)

  for (const bone of skeleton.bones) {
    const rest = rig.bones[bone.name]
    if (!rest) continue

    const { origScale, origPos, origQuat } = rest
    bone.position.copy(origPos)
    bone.quaternion.copy(origQuat)
    bone.scale.copy(origScale)

    const name = bone.name

    if (name.startsWith('Arm')) {
      bone.scale.y = origScale.y * armLength
      // Not in the SDK preview: widen the shoulders by pushing the arm roots out.
      if (name === 'ArmL_Offset' || name === 'ArmR_Offset') {
        bone.position.x = origPos.x * shoulderWidth
      }
    } else if (name === NECK_OFFSET_BONE) {
      // Keeps the head sitting on the neck as height/headScale change, then applies
      // neckHeight against the bind-pose offset.
      bone.position.y += (height - headScale) * origPos.y
      bone.position.y += rig.neckOffsetBindY * (neckHeight - 1) * 0.8
    } else if (name === HAT_BONE) {
      // Divided by height so the head stays uniform inside the stretched root.
      bone.scale.set(
        origScale.x * headScale,
        origScale.y * (headScale / height),
        origScale.z * headScale,
      )
    } else if (name === BACK_BONE) {
      // Not in the SDK preview: torso width.
      bone.scale.x = origScale.x * torsoScaleX
    } else if (name === 'LegL_Offset' || name === 'LegR_Offset') {
      // Not in the SDK preview: leg splay, mirrored about the rig centre.
      bone.position.x = origPos.x * legOffsetX
    }
  }
}

/* ---------------------------------------------------------------------------
 * Procedural animation
 *
 * player.glb ships zero animation clips, so a walk/run/jump cycle has to be
 * driven directly on the bones. Rotations are *multiplied onto* whatever
 * applyProportions() just wrote, so this must run immediately after it in the
 * same frame - proportions reset each bone to its rest pose, which is exactly
 * the clean base a pose needs.
 * ------------------------------------------------------------------------- */

const _animQ = new Quaternion()

/**
 * Rotates a bone about one of its precomputed character-space axes.
 * `which` is 'axisX' (forward/back swing) or 'axisZ' (lateral sway).
 */
function rotateBone(rig, name, which, angle) {
  if (!angle) return
  const entry = rig.bones[name]
  const axis = entry?.[which]
  if (!axis) return
  entry.bone.quaternion.multiply(_animQ.setFromAxisAngle(axis, angle))
}

/** Swing a limb forward/back - the plane a walk cycle actually moves in. */
const swing = (rig, name, angle) => rotateBone(rig, name, 'axisX', angle)
/** Sway a limb out to the side. */
const sway = (rig, name, angle) => rotateBone(rig, name, 'axisZ', angle)

/**
 * Poses the rig for the current motion state.
 *
 * @param {object} rig from `collectRig`
 * @param {{ time: number, speed: number, grounded: boolean, maxSpeed: number }} motion
 *   `speed` is horizontal speed in world units/sec; `maxSpeed` is what counts as a
 *   full-amplitude run, so the cycle scales smoothly from a walk to a sprint.
 */
export function animateRig(rig, motion) {
  if (!rig?.skeleton || !motion) return

  const { time = 0, speed = 0, grounded = true, maxSpeed = 6 } = motion
  const ratio = Math.min(speed / Math.max(maxSpeed, 0.001), 1)

  rig.root.position.y = rig.rootRestY

  // --- Airborne: tuck the legs, throw the arms up ---------------------------
  if (!grounded) {
    swing(rig, 'LegL1', -0.55)
    swing(rig, 'LegL2', 0.75)
    swing(rig, 'LegR1', 0.3)
    swing(rig, 'LegR2', 0.2)
    swing(rig, 'ArmL1', -2.1)
    swing(rig, 'ArmR1', -2.1)
    swing(rig, 'Spine1', -0.1)
    return
  }

  // --- Standing still: a slow breathing sway --------------------------------
  if (ratio < 0.04) {
    const idle = Math.sin(time * 1.6)
    sway(rig, 'ArmL1', -0.07 - idle * 0.03)
    sway(rig, 'ArmR1', 0.07 + idle * 0.03)
    swing(rig, 'Spine1', idle * 0.02)
    rig.root.position.y = rig.rootRestY + idle * 0.03
    return
  }

  // --- Walk / run cycle -----------------------------------------------------
  // Step frequency rises with speed so a sprint doesn't look like a moonwalk.
  const phase = time * (5 + ratio * 5)
  const cycle = Math.sin(phase)
  const legAmp = 0.85 * ratio
  const armAmp = 0.7 * ratio

  // Legs swing in opposition; knees fold on the backswing only.
  swing(rig, 'LegL1', cycle * legAmp)
  swing(rig, 'LegR1', -cycle * legAmp)
  swing(rig, 'LegL2', Math.max(0, -cycle) * 1.1 * ratio)
  swing(rig, 'LegR2', Math.max(0, cycle) * 1.1 * ratio)

  // Arms counter-swing against the legs.
  swing(rig, 'ArmL1', -cycle * armAmp)
  swing(rig, 'ArmR1', cycle * armAmp)
  swing(rig, 'ArmL2', Math.max(0, cycle) * 0.5 * ratio)
  swing(rig, 'ArmR2', Math.max(0, -cycle) * 0.5 * ratio)

  // Lean into the run, and bob once per step (twice per full cycle).
  swing(rig, 'Spine1', -0.14 * ratio)
  rig.root.position.y = rig.rootRestY + Math.abs(Math.cos(phase)) * 0.18 * ratio
}

/** Height of the deck top above the ground, in metres (see Skater.jsx). */
const DECK_HEIGHT = 0.26
/** Kick-push foot placement across the board, metres right of the centreline. */
const KICK_ON_DECK = 0.1
const KICK_ON_GROUND = 0.36
/** How far the body leans over the front foot while kicking. */
const BODY_SHIFT = 0.1
/** Where the board foot rests across the deck, metres right of the centreline. */
const FRONT_FOOT_SIDE = 0.02

const ease = (k) => k * k * (3 - 2 * k)
const clamp1 = (v) => Math.max(-1, Math.min(1, v))

/**
 * Street-style arms. `m.arms` (eased by Skater) is how far they spread: held low
 * and a little out to both sides while riding, down and relaxed when standing.
 * They move ONLY forward and back, in turn (one arm forward while the other
 * goes back) - never left/right.
 * `pump` drives the swing in time with a kick; otherwise it is a slow,
 * smooth rhythm while rolling that fades out when standing.
 */
function streetArms(rig, m, pump) {
  const out = window.__ARMS ?? m.arms ?? 1 // TEMP-DEBUG
  const t = m.time || 0
  const kicking = (m.pushU ?? -1) >= 0
  // No swing in the air: the arms just hold out to the sides.
  const ride = kicking || !m.grounded ? 0 : Math.max(0, Math.min(1, (out - 0.12) / 0.2))
  // Forward/back swing only: + means the LEFT arm goes forward, the right one back.
  const sweep = kicking ? pump : (Math.sin(t * 2.4) * 0.42 + Math.sin(t * 4.8 + 0.6) * 0.05) * ride
  // The sideways spread is fixed, so the arms never move left/right.
  sway(rig, 'ArmL1', -(0.06 + out))
  sway(rig, 'ArmR1', 0.06 + out)
  swing(rig, 'ArmL1', -sweep - 0.1 * out)
  swing(rig, 'ArmR1', sweep - 0.1 * out)
  // Elbows soften, bending more on the arm that swings forward.
  swing(rig, 'ArmL2', -0.12 - 0.08 * Math.min(out, 0.4) - Math.max(0, sweep) * 0.6)
  swing(rig, 'ArmR2', -0.12 - 0.08 * Math.min(out, 0.4) - Math.max(0, -sweep) * 0.6)
}

/**
 * Places a foot flat on a surface `down` below the hip: the shin stays upright
 * (blocky feet have no ankle, so a tilted shin digs a corner into the deck) and
 * the thigh lifts forward as far as it needs to.
 */
function flatLeg(rig, side, down, right, h) {
  const leg = rig.legs[side]
  sway(rig, `Leg${side}1`, Math.atan2(right, down))
  const d = Math.hypot(down, right)
  const lift = Math.acos(Math.max(-1, Math.min(1, (d - leg.l2 * h) / (leg.l1 * h))))
  swing(rig, `Leg${side}1`, -lift)
  swing(rig, `Leg${side}2`, lift)
}

/**
 * Two-bone IK for one leg. `fwd`, `down` and `right` place the sole relative to
 * the hip (parent-space units). The leg first tilts sideways towards the target,
 * then hip and knee bend in that plane; the knee always points forward.
 */
function legIK(rig, side, fwd, down, right, h) {
  const leg = rig.legs[side]
  const l1 = leg.l1 * h
  const l2 = leg.l2 * h
  sway(rig, `Leg${side}1`, Math.atan2(right, down))
  const dy = Math.hypot(down, right)
  const d = Math.min(Math.max(Math.hypot(fwd, dy), 0.05 * (l1 + l2)), (l1 + l2) * 0.999)
  const knee = Math.PI - Math.acos(clamp1((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2)))
  const hipAngle = Math.atan2(fwd, dy) + Math.acos(clamp1((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)))
  swing(rig, `Leg${side}1`, -hipAngle)
  swing(rig, `Leg${side}2`, knee)
}

/**
 * Skateboarding pose. The avatar stands sideways on the board (the parent
 * rotates it ~80°), knees bent, arms out along the board for balance. During a
 * kick-push (`m.pushU` in 0..1) the body turns forward, the front knee bends
 * so the back foot reaches the ground, sweeps backward, then lifts and returns.
 *
 * @param {object} rig from `collectRig`
 * @param {{ time:number, speed:number, maxSpeed:number, grounded:boolean,
 *           grinding:boolean, pushU:number, lean:number, style:number }} m
 *   style: 0 surfer, 1 classic, 2 chill
 */
export function poseSkater(rig, m, unitScale = 1) {
  if (!rig?.skeleton || !m) return
  const ratio = Math.min(1, (m.speed || 0) / Math.max(1, m.maxSpeed || 10))
  const t = m.time || 0
  const lean = m.lean || 0
  rig.root.position.x = rig.rootRestX

  if (m.grinding) {
    sway(rig, 'LegL1', -0.32)
    sway(rig, 'LegR1', 0.32)
    swing(rig, 'LegL1', -0.8)
    swing(rig, 'LegL2', 1.45)
    swing(rig, 'LegR1', -0.8)
    swing(rig, 'LegR2', 1.45)
    swing(rig, 'Spine1', -0.3)
    sway(rig, 'ArmL1', -1.3 + Math.sin(t * 8) * 0.08)
    sway(rig, 'ArmR1', 1.3 - Math.sin(t * 8) * 0.08)
    rig.root.position.y = rig.rootRestY - 0.6
    return
  }

  if (!m.grounded && m.style === -1) {
    // Indy grab: knees tucked, trailing hand reaches down to the board.
    sway(rig, 'LegL1', -0.35)
    sway(rig, 'LegR1', 0.35)
    swing(rig, 'LegL1', -1.35)
    swing(rig, 'LegL2', 2.0)
    swing(rig, 'LegR1', -1.35)
    swing(rig, 'LegR2', 2.0)
    swing(rig, 'Spine1', -0.45)
    sway(rig, 'ArmL1', -1.5)
    swing(rig, 'ArmL1', -0.3)
    swing(rig, 'ArmR1', -0.4)
    sway(rig, 'ArmR1', 0.25)
    swing(rig, 'ArmR2', -0.2)
    rig.root.position.y = rig.rootRestY - 0.55
    return
  }

  if (!m.grounded) {
    sway(rig, 'LegL1', -0.3)
    sway(rig, 'LegR1', 0.3)
    swing(rig, 'LegL1', -1.1)
    swing(rig, 'LegL2', 1.7)
    swing(rig, 'LegR1', -1.1)
    swing(rig, 'LegR2', 1.7)
    swing(rig, 'Spine1', -0.25)
    // Arms stretch straight out to both sides for the jump (eased by Skater).
    streetArms(rig, m, 0)
    rig.root.position.y = rig.rootRestY - 0.4
    return
  }

  if (m.braking) {
    // Powerslide: deep, wide crouch, weight on the back, arms out for balance.
    sway(rig, 'LegL1', -0.45)
    sway(rig, 'LegR1', 0.45)
    swing(rig, 'LegL1', -0.95)
    swing(rig, 'LegL2', 1.6)
    swing(rig, 'LegR1', -0.75)
    swing(rig, 'LegR2', 1.35)
    swing(rig, 'Spine1', -0.1)
    sway(rig, 'ArmL1', -1.35)
    sway(rig, 'ArmR1', 1.15)
    swing(rig, 'ArmR1', -0.4)
    rig.root.position.y = rig.rootRestY - 0.7
    return
  }

  const u = m.pushU ?? -1
  // Street style standing still: one foot on the board, the other on the ground.
  const idle = m.style === 0 && u < 0 ? m.idle || 0 : 0
  if ((u >= 0 || idle > 0.001) && rig.legs?.L && rig.legs?.R) {
    // Kick-push: the front foot stays planted on the deck while the other leg
    // steps OFF the board, plants on the ground beside it, pushes back along the
    // ground, then lifts and comes back up onto the deck. Feet are placed with
    // two-bone IK so the sole really touches the deck and the ground.
    const s = unitScale || 1
    const w = (metres) => metres / s
    const deck = rig.soleY
    const ground = deck - w(DECK_HEIGHT)
    // Sink the hips (front knee bends) so the kicking leg reaches the ground,
    // easing in at the start and out at the end of each kick.
    let sink = u >= 0 ? Math.max(0, Math.sin(Math.min(1, u * 1.15) * Math.PI)) : 0
    let drop = w(0.1 + 0.2 * sink)

    // Positions in metres: `fwd` along the board, `side` across it (to the
    // rider's right of the centreline), `y` the sole height.
    let fwd
    let side
    let y
    const h = rig.root.scale.y || 1
    const L = rig.legs.L
    const R = rig.legs.R
    const hipOffset = (leg) => rig.rightSign * (leg.hipX - rig.rootRestX)
    let shift = w(BODY_SHIFT)
    if (u < 0) {
      // Step off and stand: the hip moves over the ground foot so that leg is
      // straight and carries the weight; the other foot rests flat on the deck.
      const k = ease(Math.min(1, idle))
      const breathe = Math.sin(t * 1.8) * 0.01 * k
      const hipRest = rig.rootRestY + h * (R.hipY - rig.rootRestY)
      const standDrop = hipRest - ground - (R.l1 + R.l2) * h * 0.995
      sink = 0
      drop = w(0.1) + (standDrop - w(0.1)) * k + w(breathe)
      shift += (w(KICK_ON_GROUND) - hipOffset(R) - shift) * k
      fwd = -0.12 + 0.12 * k
      side = KICK_ON_DECK + (KICK_ON_GROUND - KICK_ON_DECK) * k
      y = deck + (ground - deck) * k + w(0.08) * Math.sin(k * Math.PI)
    } else if (u < 0.2) {
      // Step off the deck, slightly ahead, to plant beside the front truck.
      const k = ease(u / 0.2)
      fwd = -0.12 + 0.3 * k
      side = KICK_ON_DECK + (KICK_ON_GROUND - KICK_ON_DECK) * k
      y = deck + (ground - deck) * k + w(0.06) * Math.sin(k * Math.PI)
    } else if (u < 0.62) {
      // Foot on the ground beside the board, pushing back.
      const k = (u - 0.2) / 0.42
      fwd = 0.18 - 0.62 * k
      side = KICK_ON_GROUND
      y = ground
    } else {
      // Lift up behind and swing back onto the deck.
      const k = ease((u - 0.62) / 0.38)
      fwd = -0.44 + 0.32 * k
      side = KICK_ON_GROUND + (KICK_ON_DECK - KICK_ON_GROUND) * k
      y = ground + (deck - ground) * k + w(0.08) * Math.sin(k * Math.PI)
    }

    // Weight over the front foot: the body shifts so that foot sits on the
    // centreline and the kicking leg hangs beside the board, not over it.
    rig.root.position.x = rig.rootRestX + rig.rightSign * shift
    rig.root.position.y = rig.rootRestY - drop
    const hipY = (leg) => rig.root.position.y + h * (leg.hipY - rig.rootRestY)
    const hipRight = (leg) => hipOffset(leg) + shift
    flatLeg(rig, 'L', hipY(L) - deck, w(FRONT_FOOT_SIDE) - hipRight(L), h)
    legIK(rig, 'R', w(fwd), hipY(R) - y, w(side) - hipRight(R), h)

    swing(rig, 'Spine1', -0.06 - sink * 0.06)
    streetArms(rig, m, u >= 0 ? fwd * 1.5 : 0)
    return
  }

  if (m.style === 0) {
    // Street (default, Roblox-style): standing almost upright on the board,
    // front foot ahead and back foot behind, knees softly bent, arms relaxed
    // a little away from the body. Leans into turns.
    const bend = 0.16 + ratio * 0.1
    const breathe = Math.sin(t * 2.2) * 0.025
    swing(rig, 'LegL1', -0.22 - bend)
    swing(rig, 'LegL2', 0.3 + bend * 1.6)
    swing(rig, 'LegR1', 0.18 - bend * 0.6)
    swing(rig, 'LegR2', 0.25 + bend * 1.2)
    sway(rig, 'LegL1', -0.06)
    sway(rig, 'LegR1', 0.06)
    swing(rig, 'Spine1', -0.06 - ratio * 0.08)
    sway(rig, 'Spine1', lean * 0.25)
    streetArms(rig, m, 0)
    rig.root.position.y = rig.rootRestY - bend * 0.6 + breathe
    return
  }

  if (m.style === 2) {
    // Chill: upright and relaxed, arms loose by the sides, a slow sway.
    const sway2 = Math.sin(t * 1.3) * 0.05
    sway(rig, 'LegL1', -0.2)
    sway(rig, 'LegR1', 0.2)
    swing(rig, 'LegL1', -0.12)
    swing(rig, 'LegL2', 0.25)
    swing(rig, 'LegR1', -0.12)
    swing(rig, 'LegR2', 0.25)
    swing(rig, 'Spine1', -0.04)
    sway(rig, 'Spine1', lean * 0.25 + sway2)
    sway(rig, 'ArmL1', -0.18 - ratio * 0.2 + sway2)
    sway(rig, 'ArmR1', 0.18 + ratio * 0.2 + sway2)
    swing(rig, 'ArmL1', 0.15)
    swing(rig, 'ArmR1', 0.1)
    swing(rig, 'ArmL2', -0.4)
    swing(rig, 'ArmR2', -0.4)
    rig.root.position.y = rig.rootRestY - 0.14
    return
  }

  // Classic cruising: sideways stance, feet apart along the board, arms out.
  const crouch = 0.3 + ratio * 0.22
  const bob = Math.sin(t * 2.4) * 0.03
  sway(rig, 'LegL1', -0.3)
  sway(rig, 'LegR1', 0.3)
  swing(rig, 'LegL1', -crouch)
  swing(rig, 'LegL2', crouch * 1.9)
  swing(rig, 'LegR1', -crouch)
  swing(rig, 'LegR2', crouch * 1.9)
  swing(rig, 'Spine1', -0.12 - ratio * 0.12 - lean * 0.3)
  sway(rig, 'ArmL1', -0.75 - ratio * 0.3 + bob)
  sway(rig, 'ArmR1', 0.6 + ratio * 0.3 - bob)
  swing(rig, 'ArmL1', -0.15)
  swing(rig, 'ArmR1', 0.2)
  swing(rig, 'ArmL2', -0.25)
  swing(rig, 'ArmR2', -0.25)
  rig.root.position.y = rig.rootRestY - crouch * 0.85 + bob
}
