import { useEffect, useState } from 'react'

import { useBloxity } from '../bloxity/BloxityContext'
import { audio } from '../game/audio'
import { isTouchDevice } from '../game/controls'
import { net } from '../net/session'
import {
  LOBBY_TREADMILLS,
  SPEED_PACKS,
  boardById,
  boostCost,
  formatNum,
  levelProgress,
  moveSpeedFor,
  squadBoost,
} from '../shared/config'
import { premiumItem } from '../shared/layout'
import { live, useGame } from '../state/store'
import {
  BackpackIcon,
  BasketIcon,
  FlameIcon,
  GemIcon,
  GiftIcon,
  GlobeIcon,
  PencilIcon,
  RebirthIcon,
  ShoeIcon,
  TrophyIcon,
} from './icons'
import Panels from './Panels'
import TouchControls from './TouchControls'
import './hud.css'

const click = () => audio.play('click')

function Stats() {
  const wins = useGame((s) => s.stats.wins)
  const rebirths = useGame((s) => s.stats.rebirths)
  return (
    <div className="stats">
      <div className="stat-row stroke">
        <RebirthIcon />
        {formatNum(rebirths)}
      </div>
      <div className="stat-row stroke">
        <TrophyIcon />
        {formatNum(wins)}
      </div>
    </div>
  )
}

/** Menu buttons: brick blocks with a grass cap, like the park walls. */
const MENU = [
  { id: 'shop', label: 'Shop', Icon: BasketIcon, tint: 'linear-gradient(160deg, #ff8ab4, #ff2f6d)', key: 'O', tag: 'OP!' },
  { id: 'backpack', label: 'Backpack', Icon: BackpackIcon, tint: 'linear-gradient(160deg, #ffc46b, #f07a1f)', key: 'B' },
  { id: 'rebirth', label: 'Rebirth', Icon: RebirthIcon, tint: 'linear-gradient(160deg, #6fd8ff, #1f7bff)', key: 'R' },
  { id: 'teleport', label: 'Teleport', Icon: GemIcon, tint: 'linear-gradient(160deg, #d98aff, #8a2bff)', key: 'T' },
  { id: 'worlds', label: 'Worlds', Icon: GlobeIcon, tint: 'linear-gradient(160deg, #5fe6c0, #1f9e8a)', key: 'M' },
  { id: 'rewards', label: 'Rewards', Icon: GiftIcon, tint: 'linear-gradient(160deg, #fff27a, #ffb31f)', key: 'G' },
]

function Menu() {
  const openPanel = useGame((s) => s.openPanel)
  return (
    <div className="menu">
      {MENU.map(({ id, label, Icon, tint, tag, key }) => (
        <button
          key={id}
          type="button"
          className="mbtn pe"
          style={{ '--tint': tint }}
          title={`${label} (${key})`}
          onClick={() => {
            click()
            openPanel(id)
          }}
        >
          <Icon />
          <span className="label stroke">{label}</span>
          <span className="key">{key}</span>
          {tag ? <span className="tag stroke">{tag}</span> : null}
        </button>
      ))}
    </div>
  )
}

/** Keyboard shortcuts for the menu (shown as keycaps on the buttons). */
function useHotkeys() {
  useEffect(() => {
    const onKey = (e) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const game = useGame.getState()
      if (e.code === 'Escape') {
        if (game.panel) game.closePanel()
        else if (game.prompt) game.setPrompt(null)
        return
      }
      if (e.code === 'KeyP') {
        click()
        game.openPanel('settings')
        return
      }
      const item = MENU.find((m) => `Key${m.key}` === e.code)
      if (item) {
        click()
        game.openPanel(item.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

function Quest() {
  const quest = useGame((s) => s.me?.quest)
  if (!quest) return null
  const text = quest.counter ? `${quest.text} (${quest.progress}/${quest.target})` : quest.text
  return (
    <div className="quest stroke">
      {text}
      <div className="sub stroke-thin">Reward: {formatNum(quest.wins)} Wins</div>
    </div>
  )
}

/** Top-right: the player's Bloxity avatar + name. Opens settings / login. */
function ProfileChip() {
  const { identity } = useBloxity()
  const openPanel = useGame((s) => s.openPanel)
  const name = identity?.displayName || identity?.username || 'Player'
  const [imgOk, setImgOk] = useState(true)
  return (
    <div className="profile-wrap pe">
      <button
        type="button"
        className="profile"
        title="Settings (P)"
        onClick={() => {
          click()
          openPanel('settings')
        }}
      >
        {identity?.pfp && imgOk ? (
          <img src={identity.pfp} alt="" onError={() => setImgOk(false)} />
        ) : (
          <span className="pfp-fallback">{name.charAt(0).toUpperCase()}</span>
        )}
        <span className="pname stroke-thin">{name}</span>
      </button>
    </div>
  )
}

function useNow(interval = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), interval)
    return () => clearInterval(t)
  }, [interval])
  return now
}

const mmss = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function RightColumn() {
  const level = useGame((s) => s.stats.level)
  const rebirths = useGame((s) => s.stats.rebirths)
  const board = useGame((s) => s.me?.board ?? 1)
  const boosts = useGame((s) => s.me?.boosts)
  const custom = useGame((s) => s.settings.customSpeed)
  const updateSettings = useGame((s) => s.updateSettings)
  const now = useNow()
  const max = Math.round(moveSpeedFor(level, board))
  const current = custom > 0 ? Math.min(custom, max) : max
  // Boost expiry times are server timestamps.
  const serverTime = now + live.serverOffset
  const speedLeft = (boosts?.speedUntil || 0) - serverTime
  const winsLeft = (boosts?.winsUntil || 0) - serverTime

  return (
    <div className="rightcol">
      <div className="custom pe">
        <div className="title stroke">Custom Speed</div>
        <div className="custom-box">
          <PencilIcon />
          <span className="stroke-thin">{current}</span>
          <input
            type="range"
            min={4}
            max={max}
            value={current}
            aria-label="Custom speed"
            onChange={(e) => {
              const v = Number(e.target.value)
              updateSettings({ customSpeed: v >= max ? 0 : v })
            }}
          />
        </div>
        <div className="max stroke-thin">MAX: {max}</div>
      </div>
      <button
        type="button"
        className="boost pe c-blue stroke"
        onClick={() => {
          click()
          net.send('buyBoost', { kind: 'speed' })
        }}
      >
        x2 Speed
        <span className="price stroke-thin">
          <TrophyIcon /> {formatNum(boostCost('speed', rebirths))}
        </span>
        {speedLeft > 0 ? <span className="timer">{mmss(speedLeft)}</span> : null}
      </button>
      <button
        type="button"
        className="boost pe c-gold stroke"
        onClick={() => {
          click()
          net.send('buyBoost', { kind: 'wins' })
        }}
      >
        x2 Wins
        <span className="price stroke-thin">
          <TrophyIcon /> {formatNum(boostCost('wins', rebirths))}
        </span>
        {winsLeft > 0 ? <span className="timer">{mmss(winsLeft)}</span> : null}
      </button>
    </div>
  )
}

function Bottom() {
  const speed = useGame((s) => s.stats.speed)
  const rebirths = useGame((s) => s.stats.rebirths)
  const prog = levelProgress(speed, rebirths)
  const pct = prog.max ? 100 : Math.min(100, (prog.into / Math.max(1, prog.need)) * 100)
  return (
    <div className="bottom">
      <div className="speedtxt stroke">{formatNum(speed)} Speed</div>
      <div className="lvlbar">
        <div className="fill" style={{ width: `${pct}%` }} />
        <div className="txt">
          <span>Level {prog.level}</span>
          <span>{prog.max ? 'MAX - Rebirth!' : `${formatNum(prog.into)}/${formatNum(prog.need)}`}</span>
        </div>
      </div>
      <div className="packs">
        {SPEED_PACKS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`pack pe stroke c-${p.color}`}
            onClick={() => {
              click()
              net.send('buyPack', { id: p.id })
            }}
          >
            {p.label}
            <span className="price stroke-thin">
              <TrophyIcon /> {formatNum(p.cost)}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function Squad() {
  const count = useGame((s) => s.players.length)
  return <div className="squad stroke">Squad Boost: +{Math.round(squadBoost(count) * 100)}%</div>
}

function StreakButton() {
  const openPanel = useGame((s) => s.openPanel)
  const daily = useGame((s) => s.me?.daily)
  return (
    <button
      type="button"
      className="streakbtn pe"
      onClick={() => {
        click()
        openPanel('rewards')
      }}
    >
      <FlameIcon />
      <span className="dot stroke-thin">{daily?.streak ?? 0}</span>
    </button>
  )
}

function Popups() {
  const popups = useGame((s) => s.popups)
  return (
    <div className="popups">
      {popups.map((p) => (
        <div key={p.id} className="popup stroke" style={{ '--px': `${(p.x - 0.5) * 18}rem` }}>
          <ShoeIcon />+{formatNum(p.n)}
        </div>
      ))}
    </div>
  )
}

function Banner() {
  const banner = useGame((s) => s.banner)
  if (!banner) return null
  return (
    <div key={banner.id} className="banner">
      <div className="big stroke" style={{ color: banner.color }}>
        {banner.text}
      </div>
      {banner.sub ? <div className="small stroke-thin">{banner.sub}</div> : null}
    </div>
  )
}

function BigWins() {
  const big = useGame((s) => s.bigWins)
  if (!big) return null
  return (
    <div key={big.id} className="bigwins stroke">
      +{formatNum(big.n)} {big.n === 1 ? 'Win' : 'Wins'}
    </div>
  )
}

function Toasts() {
  const toasts = useGame((s) => s.toasts)
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast stroke-thin ${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  )
}

/** Buy prompt when standing on a locked board pad or treadmill. */
/**
 * Small action pill above the level bar ("[E] Claim Wins · +4"), shown when you
 * stand on a pad, board or treadmill. Click it or press E. Never covers the game.
 */
function Prompt() {
  const prompt = useGame((s) => s.prompt)
  const wins = useGame((s) => s.stats.wins)
  const boards = useGame((s) => s.me?.boards)
  if (!prompt) return null
  let label = ''
  let cost = 0
  let action = null
  let tone = 'green'
  if (prompt.kind === 'win') {
    label = 'Claim Wins'
    action = () => net.send('claim', {})
  } else if (prompt.kind === 'board') {
    const b = boardById(prompt.id)
    const owned = boards?.includes(b.id)
    label = owned ? `Equip ${b.name}` : `Buy ${b.name}`
    cost = owned ? 0 : b.cost
    tone = owned ? 'blue' : 'gold'
    action = () => net.send(owned ? 'equipBoard' : 'buyBoard', { id: b.id })
  } else if (prompt.kind === 'treadmill') {
    const m = /^t(d)_(d)$/.exec(prompt.id)
    const def = m ? LOBBY_TREADMILLS[Number(m[1])][Number(m[2])] : null
    if (!def) return null
    label = `Unlock x${formatNum(def.mult)} Treadmill`
    cost = def.cost
    tone = 'gold'
    action = () => net.send('buyTreadmill', { id: prompt.id })
  } else if (prompt.kind === 'premium') {
    const entry = premiumItem(prompt.id)
    if (!entry) return null
    label = entry.kind === 'pad' ? 'Unlock VIP Pad (x3 Wins)' : `Unlock VIP x${formatNum(entry.item.mult)} Treadmill`
    cost = entry.item.cost
    tone = 'gold'
    action = () => net.send('buyPremium', { id: prompt.id })
  }
  const short = cost > 0 && wins < cost
  return (
    <button
      type="button"
      className={`prompt-pill pe tone-${tone}${short ? ' short' : ''}`}
      onClick={() => {
        click()
        action()
      }}
    >
      <span className="kbd">E</span>
      <span className="plabel stroke-thin">{label}</span>
      {cost > 0 ? (
        <span className="pcost stroke-thin">
          <TrophyIcon /> {formatNum(cost)}
        </span>
      ) : null}
    </button>
  )
}

function Reconnecting() {
  const reconnecting = useGame((s) => s.reconnecting)
  if (!reconnecting) return null
  return (
    <div className="reconnect stroke-thin">
      Reconnecting…
    </div>
  )
}

export function Hud() {
  const [touch] = useState(isTouchDevice)
  useHotkeys()
  return (
    <div className={`hud${touch ? ' touch' : ''}`}>
      <Stats />
      <Menu />
      <Quest />
      <ProfileChip />
      <RightColumn />
      <Bottom />
      <Squad />
      <StreakButton />
      <Popups />
      <BigWins />
      <Banner />
      <Toasts />
      <Prompt />
      <Reconnecting />
      {touch ? <TouchControls /> : null}
      <Panels />
    </div>
  )
}

export default Hud
