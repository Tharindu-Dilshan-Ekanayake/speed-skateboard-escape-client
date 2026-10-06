import { useEffect, useState } from 'react'

import { useGame } from '../state/store'
import './loading.css'

const TIPS = [
  'Stand on a treadmill to train speed while you chill.',
  'Higher level = faster board = bigger jumps over the speed gaps.',
  'Land on a rail to grind it - press Jump to pop off!',
  'Watch out for Granny. One touch and you are back at the stage start!',
  'Rebirth at Level 25 to multiply every bit of speed you earn.',
  'Skate with friends: every rider in your server boosts your speed.',
  'Claim the Daily Streak every day for bigger rewards.',
]

/** Simple, friendly loading page shown until the player is in a server. */
export function LoadingScreen() {
  const phase = useGame((s) => s.phase)
  const progress = useGame((s) => s.progress)
  const text = useGame((s) => s.loadingText)
  const [tip, setTip] = useState(() => Math.floor(Math.random() * TIPS.length))
  const [gone, setGone] = useState(false)
  const done = phase === 'playing'

  useEffect(() => {
    const t = setInterval(() => setTip((i) => (i + 1) % TIPS.length), 3500)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!done) return undefined
    const t = setTimeout(() => setGone(true), 700)
    return () => clearTimeout(t)
  }, [done])

  if (gone) return null
  return (
    <div className={`loading${done ? ' out' : ''}`}>
      <div className="loading-sky" />
      <div className="loading-inner">
        <div className="logo">
          <span className="plus">+1 SPEED</span>
          <span className="main">SKATEBOARD</span>
          <span className="esc">ESCAPE</span>
        </div>
        <div className="board-anim" aria-hidden="true">
          <div className="deck" />
          <div className="wheel w1" />
          <div className="wheel w2" />
        </div>
        <div className="lbar">
          <div className="lfill" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <div className="ltext">{text}</div>
        <div className="ltip">{TIPS[tip]}</div>
      </div>
    </div>
  )
}

export function KickedScreen() {
  return (
    <div className="loading">
      <div className="loading-sky" />
      <div className="loading-inner">
        <div className="logo">
          <span className="main">See you there!</span>
        </div>
        <div className="ltext">You opened the game in another tab or device.</div>
        <button type="button" className="reload" onClick={() => window.location.reload()}>
          Play here instead
        </button>
      </div>
    </div>
  )
}

export default LoadingScreen
