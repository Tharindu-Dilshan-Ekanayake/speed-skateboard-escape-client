/**
 * Hand-made SVG icons in a chunky, outlined Roblox-simulator style.
 * All use a dark #1b1530 outline so they read on any background.
 */

const O = '#1b1530'

const Svg = ({ children, size = '1em', viewBox = '0 0 64 64', className }) => (
  <svg width={size} height={size} viewBox={viewBox} className={className} aria-hidden="true">
    {children}
  </svg>
)

export const TrophyIcon = (p) => (
  <Svg {...p}>
    <path d="M18 8h28v14c0 9-6 16-14 16s-14-7-14-16z" fill="#ffc21f" stroke={O} strokeWidth="4" strokeLinejoin="round" />
    <path d="M18 14H9c0 9 4 14 10 14M46 14h9c0 9-4 14-10 14" fill="none" stroke={O} strokeWidth="4" strokeLinecap="round" />
    <path d="M26 38h12v8H26z" fill="#ffc21f" stroke={O} strokeWidth="4" />
    <path d="M18 46h28v10H18z" fill="#ff9a1f" stroke={O} strokeWidth="4" strokeLinejoin="round" />
    <path d="M24 13v9" stroke="#fff6c8" strokeWidth="4" strokeLinecap="round" />
    <text x="32" y="28" textAnchor="middle" fontSize="14" fontWeight="900" fill={O}>1</text>
  </Svg>
)

export const RebirthIcon = (p) => (
  <Svg {...p}>
    <circle cx="32" cy="32" r="25" fill="#fff" stroke={O} strokeWidth="4" />
    <path d="M9 30a23 23 0 0 1 44-8l5-6 2 22-20-4 6-5a15 15 0 0 0-29 1z" fill="#ff3b4a" stroke={O} strokeWidth="4" strokeLinejoin="round" />
    <path d="M55 34a23 23 0 0 1-44 8l-5 6-2-22 20 4-6 5a15 15 0 0 0 29-1z" fill="#3fa2ff" stroke={O} strokeWidth="4" strokeLinejoin="round" />
  </Svg>
)

export const BasketIcon = (p) => (
  <Svg {...p}>
    <path d="M20 24c0-10 5-16 12-16s12 6 12 16" fill="none" stroke={O} strokeWidth="5" strokeLinecap="round" />
    <path d="M8 24h48l-6 30H14z" fill="#ff3b5c" stroke={O} strokeWidth="4" strokeLinejoin="round" />
    <path d="M8 24h48v8H8z" fill="#ff7a8f" stroke={O} strokeWidth="4" strokeLinejoin="round" />
    <path d="M24 38v10M32 38v10M40 38v10" stroke={O} strokeWidth="4" strokeLinecap="round" />
  </Svg>
)

export const BackpackIcon = (p) => (
  <Svg {...p}>
    <path d="M22 14c0-5 4-8 10-8s10 3 10 8" fill="none" stroke={O} strokeWidth="5" />
    <rect x="11" y="13" width="42" height="45" rx="12" fill="#e98a3a" stroke={O} strokeWidth="4" />
    <rect x="18" y="34" width="28" height="18" rx="6" fill="#c96a24" stroke={O} strokeWidth="4" />
    <path d="M24 34v-6h16v6" fill="none" stroke={O} strokeWidth="4" />
  </Svg>
)

export const GemIcon = (p) => (
  <Svg {...p}>
    <ellipse cx="32" cy="32" rx="18" ry="26" fill="#a24dff" stroke={O} strokeWidth="4" />
    <ellipse cx="32" cy="32" rx="11" ry="17" fill="#d6a8ff" stroke={O} strokeWidth="3" />
    <path d="M32 21l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="#fff" />
  </Svg>
)

export const GlobeIcon = (p) => (
  <Svg {...p}>
    <circle cx="32" cy="32" r="25" fill="#3fa2ff" stroke={O} strokeWidth="4" />
    <path d="M12 24c10 4 30 4 40 0M10 36c12 5 32 5 44 0M14 47c10 3 26 3 36 0" fill="none" stroke="#bfe6ff" strokeWidth="4" strokeLinecap="round" />
    <circle cx="23" cy="20" r="5" fill="#e8f6ff" opacity="0.8" />
  </Svg>
)

export const GiftIcon = (p) => (
  <Svg {...p}>
    <rect x="9" y="26" width="46" height="31" rx="5" fill="#ff3b4a" stroke={O} strokeWidth="4" />
    <rect x="6" y="18" width="52" height="12" rx="4" fill="#ff5a68" stroke={O} strokeWidth="4" />
    <path d="M28 18h8v39h-8z" fill="#ffd21f" stroke={O} strokeWidth="4" />
    <path d="M32 18c-6-10-18-10-16-2 1 4 10 3 16 2zM32 18c6-10 18-10 16-2-1 4-10 3-16 2z" fill="#ffd21f" stroke={O} strokeWidth="4" strokeLinejoin="round" />
  </Svg>
)

export const ShoeIcon = (p) => (
  <Svg {...p}>
    <path d="M6 44c0-8 4-20 10-24l10 8c4 3 10 2 14-1l6 9 12 3c4 1 4 9 0 9H10c-3 0-4-2-4-4z" fill="#3f9bff" stroke={O} strokeWidth="4" strokeLinejoin="round" />
    <path d="M6 46h52" stroke={O} strokeWidth="4" />
    <path d="M8 50h48" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
    <path d="M22 27l4 3M27 23l4 3" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
  </Svg>
)

export const BoltIcon = (p) => (
  <Svg {...p}>
    <path d="M36 4L12 36h16l-4 24 26-34H34z" fill="#ffd21f" stroke={O} strokeWidth="4" strokeLinejoin="round" />
  </Svg>
)

export const PencilIcon = (p) => (
  <Svg {...p}>
    <path d="M12 52l4-14 30-30 10 10-30 30z" fill="#ffc21f" stroke={O} strokeWidth="4" strokeLinejoin="round" />
    <path d="M42 12l10 10" stroke={O} strokeWidth="4" />
    <path d="M46 8l10 10 2-2c2-2 2-6 0-8l-2-2c-2-2-6-2-8 0z" fill="#ff7a9a" stroke={O} strokeWidth="4" />
    <path d="M12 52l4-14 10 10z" fill="#f4d7a8" stroke={O} strokeWidth="4" strokeLinejoin="round" />
  </Svg>
)

export const GearIcon = (p) => (
  <Svg {...p}>
    <path
      d="M28 6h8l2 7 6 3 7-3 5 6-4 6 2 6 7 2v8l-7 2-2 6 4 6-5 6-7-3-6 3-2 7h-8l-2-7-6-3-7 3-5-6 4-6-2-6-7-2v-8l7-2 2-6-4-6 5-6 7 3 6-3z"
      fill="#e8eaf2"
      stroke={O}
      strokeWidth="4"
      strokeLinejoin="round"
    />
    <circle cx="32" cy="32" r="8" fill="#8a90a8" stroke={O} strokeWidth="4" />
  </Svg>
)

export const UsersIcon = (p) => (
  <Svg {...p}>
    <circle cx="24" cy="22" r="9" fill="#ffd21f" stroke={O} strokeWidth="4" />
    <path d="M8 52c0-10 7-17 16-17s16 7 16 17z" fill="#ffd21f" stroke={O} strokeWidth="4" strokeLinejoin="round" />
    <circle cx="44" cy="24" r="7" fill="#5cff7a" stroke={O} strokeWidth="4" />
    <path d="M40 52c0-8 2-15 6-15 7 0 12 6 12 15z" fill="#5cff7a" stroke={O} strokeWidth="4" strokeLinejoin="round" />
  </Svg>
)

export const FlameIcon = (p) => (
  <Svg {...p}>
    <path d="M32 4c4 10 18 16 18 32a18 18 0 0 1-36 0c0-8 4-13 8-16 0 6 2 9 5 10-1-10 2-19 5-26z" fill="#ff5a1f" stroke={O} strokeWidth="4" strokeLinejoin="round" />
    <path d="M32 30c3 6 9 8 9 15a9 9 0 0 1-18 0c0-5 4-8 9-15z" fill="#ffd21f" />
  </Svg>
)

export const LockIcon = (p) => (
  <Svg {...p}>
    <path d="M20 28v-8a12 12 0 0 1 24 0v8" fill="none" stroke={O} strokeWidth="6" />
    <rect x="12" y="28" width="40" height="28" rx="6" fill="#ffc21f" stroke={O} strokeWidth="4" />
    <circle cx="32" cy="41" r="4" fill={O} />
  </Svg>
)

export const SkateIcon = ({ color = '#38f05a', ...p }) => (
  <Svg {...p}>
    <path d="M6 30c0-4 3-6 6-6h40c3 0 6 2 6 6s-3 6-6 6H12c-3 0-6-2-6-6z" fill={color} stroke={O} strokeWidth="4" />
    <circle cx="18" cy="44" r="6" fill="#fff" stroke={O} strokeWidth="4" />
    <circle cx="46" cy="44" r="6" fill="#fff" stroke={O} strokeWidth="4" />
  </Svg>
)

export const TrailIcon = ({ color = '#ff3b3b', ...p }) => (
  <Svg {...p}>
    <path d="M4 40c10-2 14-10 26-12-8 6-6 12-2 14-8 0-14 2-24-2z" fill={color} stroke={O} strokeWidth="3" strokeLinejoin="round" />
    <path d="M6 22c10 0 18 4 24 8-12 0-18 2-24-8z" fill="#ff7a3b" stroke={O} strokeWidth="3" strokeLinejoin="round" />
    <rect x="30" y="18" width="26" height="26" rx="6" fill="#ffd21f" stroke={O} strokeWidth="4" />
    <circle cx="38" cy="28" r="2.5" fill={O} />
    <circle cx="48" cy="28" r="2.5" fill={O} />
    <path d="M37 35c3 3 8 3 11 0" stroke={O} strokeWidth="3" fill="none" strokeLinecap="round" />
  </Svg>
)

export const GlowIcon = (p) => (
  <Svg {...p}>
    <ellipse cx="32" cy="46" rx="26" ry="9" fill="#ff5ad8" opacity="0.55" />
    <ellipse cx="32" cy="46" rx="15" ry="5" fill="#ffd1f4" />
    <path d="M8 34c0-3 3-5 6-5h36c3 0 6 2 6 5s-3 5-6 5H14c-3 0-6-2-6-5z" fill="#3fe8ff" stroke={O} strokeWidth="4" />
    <circle cx="20" cy="42" r="4" fill="#fff" stroke={O} strokeWidth="3" />
    <circle cx="44" cy="42" r="4" fill="#fff" stroke={O} strokeWidth="3" />
    <path d="M32 6v10M18 10l5 8M46 10l-5 8" stroke="#ffd21f" strokeWidth="4" strokeLinecap="round" />
  </Svg>
)

export const StarIcon = (p) => (
  <Svg {...p}>
    <path d="M32 4l7 21 21 7-21 7-7 21-7-21-21-7 21-7z" fill="#b13bff" stroke={O} strokeWidth="4" strokeLinejoin="round" />
    <path d="M32 18l3 11 11 3-11 3-3 11-3-11-11-3 11-3z" fill="#e3a8ff" />
  </Svg>
)

export const TreadmillIcon = (p) => (
  <Svg {...p}>
    <path d="M6 48l40-10 12 4-40 10z" fill="#3a3a46" stroke={O} strokeWidth="4" strokeLinejoin="round" />
    <path d="M44 38V14l8-2v28" fill="none" stroke={O} strokeWidth="5" strokeLinejoin="round" />
    <rect x="38" y="8" width="18" height="10" rx="3" fill="#3fe8ff" stroke={O} strokeWidth="4" />
  </Svg>
)

export const CloseIcon = (p) => (
  <Svg {...p}>
    <path d="M16 16l32 32M48 16L16 48" stroke="#fff" strokeWidth="10" strokeLinecap="round" />
  </Svg>
)

export const SpeakerIcon = ({ off, ...p }) => (
  <Svg {...p}>
    <path d="M8 24h12l14-12v40L20 40H8z" fill="#e8eaf2" stroke={O} strokeWidth="4" strokeLinejoin="round" />
    {off ? (
      <path d="M42 24l14 16M56 24L42 40" stroke="#ff3b4a" strokeWidth="5" strokeLinecap="round" />
    ) : (
      <path d="M42 22c4 5 4 15 0 20M48 16c8 8 8 24 0 32" fill="none" stroke={O} strokeWidth="4" strokeLinecap="round" />
    )}
  </Svg>
)

/* ------------------------------------------------------------ charm icons */

const CHARM_ART = {
  clover: (
    <>
      {[0, 90, 180, 270].map((r) => (
        <circle key={r} cx="32" cy="20" r="10" fill="#38d05a" stroke={O} strokeWidth="4" transform={`rotate(${r} 32 32)`} />
      ))}
      <path d="M32 36l6 22" stroke={O} strokeWidth="5" strokeLinecap="round" />
    </>
  ),
  sneaker: (
    <path d="M6 44c0-8 4-20 10-24l10 8c4 3 10 2 14-1l6 9 12 3c4 1 4 9 0 9H10c-3 0-4-2-4-4z" fill="#b7bdcc" stroke={O} strokeWidth="4" strokeLinejoin="round" />
  ),
  book: (
    <>
      <path d="M12 10h30l10 8v38H22l-10-8z" fill="#c4682e" stroke={O} strokeWidth="4" strokeLinejoin="round" />
      <path d="M12 48h30v8" fill="#f4e6c8" stroke={O} strokeWidth="4" />
      <path d="M22 20h16" stroke="#f4e6c8" strokeWidth="4" strokeLinecap="round" />
    </>
  ),
  bolt: <path d="M36 4L12 36h16l-4 24 26-34H34z" fill="#3fe8ff" stroke={O} strokeWidth="4" strokeLinejoin="round" />,
  ring: (
    <>
      <ellipse cx="32" cy="36" rx="22" ry="14" fill="none" stroke={O} strokeWidth="12" />
      <ellipse cx="32" cy="36" rx="22" ry="14" fill="none" stroke="#ffc21f" strokeWidth="6" />
    </>
  ),
  magnifier: (
    <>
      <path d="M38 38l14 14" stroke={O} strokeWidth="10" strokeLinecap="round" />
      <circle cx="26" cy="26" r="17" fill="#8fe0ff" stroke="#ff3b4a" strokeWidth="7" />
    </>
  ),
  wing: (
    <path d="M8 48c4-22 20-36 48-40-6 8-8 12-8 16-8 0-12 4-14 8 4-2 10-2 14 0-8 4-14 8-18 14 2-1 6-1 10 0-10 6-22 6-32 2z" fill="#fff" stroke={O} strokeWidth="4" strokeLinejoin="round" />
  ),
  crown: (
    <path d="M8 48l-2-30 14 12 12-20 12 20 14-12-2 30z" fill="#ffc21f" stroke={O} strokeWidth="4" strokeLinejoin="round" />
  ),
  comet: (
    <>
      <path d="M8 56l24-30" stroke="#ff8af0" strokeWidth="8" strokeLinecap="round" />
      <circle cx="40" cy="22" r="14" fill="#7a2bff" stroke={O} strokeWidth="4" />
      <circle cx="36" cy="18" r="4" fill="#fff" />
    </>
  ),
  trophy: (
    <>
      <path d="M18 8h28v14c0 9-6 16-14 16s-14-7-14-16z" fill="#ffd700" stroke={O} strokeWidth="4" />
      <path d="M18 46h28v10H18z" fill="#ff9a1f" stroke={O} strokeWidth="4" />
      <path d="M26 38h12v8H26z" fill="#ffd700" stroke={O} strokeWidth="4" />
    </>
  ),
}

export const CharmIcon = ({ id, ...p }) => <Svg {...p}>{CHARM_ART[id] || CHARM_ART.clover}</Svg>
