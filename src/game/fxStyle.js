/** Shared rules for how fancy a rider's trail and glow are. */

/** Effect style for a board's tier (0..14). */
export function styleForTier(tier) {
  if (tier >= 10) return 'rainbow'
  if (tier >= 8) return 'butterflies'
  if (tier >= 6) return 'electric'
  if (tier >= 4) return 'fire'
  if (tier >= 2) return 'glitter'
  return 'plain'
}

/** 0 up to level 8, then eases up to 1 at level 23. */
export const levelFactor = (level) => Math.min(1, Math.max(0, (level - 8) / 15))
