import { useEffect, useState } from 'react'

import { audio } from '../game/audio'
import { net } from '../net/session'
import {
  BOARDS,
  CHARMS,
  GLOWS,
  DAILY_REWARDS,
  LOBBY_TREADMILLS,
  MAX_EQUIPPED_CHARMS,
  MAX_LEVEL,
  PLAYTIME_GIFTS,
  RARITIES,
  stageCount,
  stageNumber,
  teleportCost,
  TRAILS,
  WORLD_NAMES,
  WORLD_UNLOCK_REBIRTHS,
  boardById,
  boardGlowColor,
  charmById,
  charmRefreshCost,
  formatNum,
  levelProgress,
  lobbyTreadmillId,
  rebirthSpeedMult,
  rebirthWinsMult,
  scaleReward,
} from '../shared/config'
import { serverNow, useGame } from '../state/store'
import {
  BackpackIcon,
  BasketIcon,
  GlowIcon,
  CharmIcon,
  CloseIcon,
  GearIcon,
  GemIcon,
  GiftIcon,
  GlobeIcon,
  LockIcon,
  RebirthIcon,
  SkateIcon,
  StarIcon,
  TrailIcon,
  TreadmillIcon,
  TrophyIcon,
} from './icons'

const click = () => audio.play('click')

function useTick(ms = 1000) {
  const [, setT] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setT((t) => t + 1), ms)
    return () => clearInterval(id)
  }, [ms])
}

const fmtTime = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`
}

function Panel({ title, Icon, children, width }) {
  const close = useGame((s) => s.closePanel)
  return (
    <div
      className="backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div className="panel" style={width ? { width } : undefined}>
        <div className="panel-title stroke">
          {Icon ? <Icon /> : null}
          {title}
        </div>
        <button
          type="button"
          className="panel-close"
          aria-label="Close"
          onClick={() => {
            click()
            close()
          }}
        >
          <CloseIcon />
        </button>
        <div className="panel-body">{children}</div>
      </div>
    </div>
  )
}

const Price = ({ value }) => (
  <>
    <TrophyIcon /> {formatNum(value)}
  </>
)

/* ------------------------------------------------------------- charm shop */

const FX_TEXT = { steady: 'Steady shine', pulse: 'Pulses', flicker: 'Flickers like fire', sparkle: 'Sparkles', rainbow: 'Cycles the rainbow' }

const swatch = (color) => ({
  width: '5.2rem',
  height: '5.2rem',
  flex: 'none',
  borderRadius: '50%',
  border: '0.3rem solid #1b1530',
  background:
    color === 'rainbow'
      ? 'conic-gradient(#ff3b3b, #ffd21f, #38f05a, #3fb8ff, #b13bff, #ff3b3b)'
      : `radial-gradient(circle, #ffffff 0 18%, ${color} 45%, ${color}55 75%)`,
  boxShadow: color === 'rainbow' ? '0 0 1.2rem #ff66cc' : `0 0 1.4rem ${color}`,
})

/** Underglow shop: buy with Wins, then tap again to equip / take off. */
function GlowsTab({ me }) {
  const board = boardById(me.board)
  return (
    <div className="list">
      <div className="item" style={{ background: '#3a2f6e' }}>
        <div style={swatch(boardGlowColor(board))} />
        <div className="info">
          <div className="name stroke-thin">{board.name} Board Glow</div>
          <div className="desc stroke-thin">Every board shines its own colour - free!</div>
        </div>
        <button type="button" className="gbtn c-gray stroke-thin" disabled={!me.glow} onClick={() => (click(), net.send('buyGlow', { id: me.glow }))}>
          {me.glow ? 'Use This' : 'In Use'}
        </button>
      </div>
      {GLOWS.map((g) => {
        const owned = me.glows.includes(g.id)
        const on = me.glow === g.id
        return (
          <div key={g.id} className="item" style={{ background: on ? '#2fbf55' : owned ? '#2f6dd8' : '#4a3f80' }}>
            <div style={swatch(g.color)} />
            <div className="info">
              <div className="name stroke-thin">{g.name}</div>
              <div className="desc stroke-thin">{FX_TEXT[g.fx]}</div>
            </div>
            {owned ? (
              <button type="button" className={`gbtn stroke-thin ${on ? 'c-gray' : 'c-blue'}`} onClick={() => (click(), net.send('buyGlow', { id: g.id }))}>
                {on ? 'Unequip' : 'Equip'}
              </button>
            ) : (
              <button type="button" className="gbtn c-green stroke-thin" disabled={me.wins < g.cost} onClick={() => (click(), net.send('buyGlow', { id: g.id }))}>
                <Price value={g.cost} />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ShopPanel() {
  const me = useGame((s) => s.me)
  const [tab, setTab] = useState('charms')
  if (!me) return null
  return (
    <Panel title="Shop" Icon={BasketIcon}>
      <div className="tabs">
        <button type="button" className={`tab c-purple${tab === 'charms' ? ' on' : ''}`} title="Charms" onClick={() => (click(), setTab('charms'))}>
          <StarIcon />
        </button>
        <button type="button" className={`tab c-blue${tab === 'glows' ? ' on' : ''}`} title="Glows" onClick={() => (click(), setTab('glows'))}>
          <GlowIcon />
        </button>
        <button type="button" className={`tab c-red${tab === 'trails' ? ' on' : ''}`} title="Trails" onClick={() => (click(), setTab('trails'))}>
          <TrailIcon />
        </button>
      </div>
      {tab === 'charms' ? <CharmShop /> : null}
      {tab === 'glows' ? <GlowsTab me={me} /> : null}
      {tab === 'trails' ? <TrailsTab me={me} /> : null}
    </Panel>
  )
}

function CharmShop() {
  useTick(1000)
  const me = useGame((s) => s.me)
  const [chances, setChances] = useState(false)
  if (!me) return null
  const shop = me.charmShop
  const left = shop.restockAt - serverNow()
  return (
    <>
      <div className="shop-head">
        <span className="timer stroke">{left > 0 ? `Restocks in ${fmtTime(left)}` : 'Restocking…'}</span>
        <button
          type="button"
          className="gbtn c-purple stroke-thin"
          onClick={() => {
            click()
            net.send('refreshCharms', {})
          }}
        >
          Refresh Now <Price value={charmRefreshCost(me.rebirths)} />
        </button>
        <button type="button" className="gbtn c-blue stroke-thin" onClick={() => setChances((c) => !c)}>
          Chances
        </button>
      </div>
      {chances ? (
        <div className="list" style={{ marginBottom: '2rem' }}>
          {Object.values(RARITIES).map((r) => (
            <div key={r.name} className="item stroke-thin" style={{ background: r.color, padding: '0.5rem 1.2rem' }}>
              <span className="name" style={{ flex: 1 }}>
                {r.name}
              </span>
              <span className="name">{r.weight}%</span>
            </div>
          ))}
        </div>
      ) : null}
      <div className="cards">
        {shop.offers.map((o) => {
          const c = charmById(o.id)
          const r = RARITIES[c.rarity]
          return (
            <div key={o.key} className="card" style={{ background: `linear-gradient(170deg, ${r.color}, ${r.color}cc)` }}>
              <span className="rar stroke">{r.name}</span>
              <CharmIcon id={c.icon} className="icon" />
              <span className="name stroke-thin">{c.name}</span>
              <span className="desc stroke-thin">
                +{c.pct}% {c.stat === 'speed' ? 'Speed' : 'Wins'}
              </span>
              <button
                type="button"
                className="gbtn c-green stroke-thin"
                disabled={o.sold}
                onClick={() => {
                  click()
                  net.send('buyCharm', { slot: o.slot })
                }}
              >
                {o.sold ? 'Sold' : <Price value={c.cost} />}
              </button>
            </div>
          )
        })}
      </div>
      <div className="section-title" style={{ textAlign: 'center', marginTop: '2rem' }}>
        Equip up to {MAX_EQUIPPED_CHARMS} charms in your Backpack.
      </div>
    </>
  )
}

/* -------------------------------------------------------------- backpack */

function BoardsTab({ me }) {
  return (
    <div className="list">
      {BOARDS.map((b) => {
        const owned = me.boards.includes(b.id)
        const equipped = me.board === b.id
        const locked = me.rebirths < WORLD_UNLOCK_REBIRTHS[b.world]
        const deck = b.deck === 'rainbow' ? '#ff66cc' : b.deck === 'cosmic' ? '#7a2bff' : b.deck
        return (
          <div key={b.id} className="item" style={{ background: equipped ? '#2fbf55' : owned ? '#2f8cff' : '#58607a' }}>
            <SkateIcon color={deck} className="icon" />
            <div className="info">
              <div className="name stroke-thin">{b.name}</div>
              <div className="desc stroke-thin">+{formatNum(b.bonus)} Speed · +{b.move.toFixed(1)} top speed</div>
            </div>
            {equipped ? (
              <button type="button" className="gbtn c-gray stroke-thin" disabled>
                Equipped
              </button>
            ) : owned ? (
              <button type="button" className="gbtn c-blue stroke-thin" onClick={() => (click(), net.send('equipBoard', { id: b.id }))}>
                Equip
              </button>
            ) : locked ? (
              <button type="button" className="gbtn c-gray stroke-thin" disabled>
                <LockIcon /> {WORLD_UNLOCK_REBIRTHS[b.world]} Rebirths
              </button>
            ) : (
              <button type="button" className="gbtn c-green stroke-thin" disabled={me.wins < b.cost} onClick={() => (click(), net.send('buyBoard', { id: b.id }))}>
                <Price value={b.cost} />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

function TrailsTab({ me }) {
  return (
    <div className="list">
      {TRAILS.map((t) => {
        const owned = me.trails.includes(t.id)
        const equipped = me.trail === t.id
        const color = t.color === 'rainbow' ? '#ff66cc' : t.color
        return (
          <div key={t.id} className="item" style={{ background: color }}>
            <TrailIcon color={color} className="icon" />
            <div className="info">
              <div className="name stroke-thin">{t.name}</div>
              <div className="desc stroke-thin">x{t.mult} Speed</div>
            </div>
            {owned ? (
              <button type="button" className={`gbtn stroke-thin ${equipped ? 'c-gray' : 'c-blue'}`} onClick={() => (click(), net.send('buyTrail', { id: t.id }))}>
                {equipped ? 'Unequip' : 'Equip'}
              </button>
            ) : (
              <button type="button" className="gbtn c-green stroke-thin" disabled={me.wins < t.cost} onClick={() => (click(), net.send('buyTrail', { id: t.id }))}>
                <Price value={t.cost} />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

function CharmsTab({ me }) {
  const owned = CHARMS.filter((c) => me.charms[c.id] > 0)
  if (!owned.length) {
    return <div className="section-title" style={{ textAlign: 'center' }}>No charms yet - visit the Charms Shop in the lobby!</div>
  }
  return (
    <>
      <div className="section-title" style={{ textAlign: 'center' }}>
        Equipped {me.equippedCharms.length}/{MAX_EQUIPPED_CHARMS}
      </div>
      <div className="list">
        {owned.map((c) => {
          const r = RARITIES[c.rarity]
          const eq = me.equippedCharms.filter((x) => x === c.id).length
          return (
            <div key={c.id} className="item" style={{ background: r.color }}>
              <CharmIcon id={c.icon} className="icon" />
              <div className="info">
                <div className="name stroke-thin">
                  {c.name} x{me.charms[c.id]}
                </div>
                <div className="desc stroke-thin">
                  {r.name} · +{c.pct}% {c.stat === 'speed' ? 'Speed' : 'Wins'}
                </div>
              </div>
              <button type="button" className={`gbtn stroke-thin ${eq ? 'c-gray' : 'c-blue'}`} onClick={() => (click(), net.send('toggleCharm', { id: c.id }))}>
                {eq ? (eq < me.charms[c.id] && me.equippedCharms.length < MAX_EQUIPPED_CHARMS ? `Equip +1 (${eq})` : 'Unequip') : 'Equip'}
              </button>
            </div>
          )
        })}
      </div>
    </>
  )
}

function TreadmillsTab({ me }) {
  return (
    <div className="list">
      {LOBBY_TREADMILLS.map((list, w) =>
        list.map((tm, i) => {
          const id = lobbyTreadmillId(w, i)
          const owned = me.treadmills.includes(id)
          const locked = me.rebirths < WORLD_UNLOCK_REBIRTHS[w]
          return (
            <div key={id} className="item" style={{ background: owned ? '#2fbf55' : '#58607a' }}>
              <TreadmillIcon className="icon" />
              <div className="info">
                <div className="name stroke-thin">x{formatNum(tm.mult)} Treadmill</div>
                <div className="desc stroke-thin">{WORLD_NAMES[w]} lobby</div>
              </div>
              {owned ? (
                <button type="button" className="gbtn c-purple stroke-thin" onClick={() => (click(), w === me.world ? net.send('tp', { to: 'treadmills' }) : null, useGame.getState().closePanel())}>
                  {w === me.world ? 'Go' : 'Owned'}
                </button>
              ) : locked ? (
                <button type="button" className="gbtn c-gray stroke-thin" disabled>
                  <LockIcon /> {WORLD_UNLOCK_REBIRTHS[w]} Rebirths
                </button>
              ) : (
                <button type="button" className="gbtn c-green stroke-thin" disabled={me.wins < tm.cost} onClick={() => (click(), net.send('buyTreadmill', { id }))}>
                  <Price value={tm.cost} />
                </button>
              )}
            </div>
          )
        }),
      )}
    </div>
  )
}

const BP_TABS = [
  { id: 'boards', Icon: SkateIcon, cls: 'c-green' },
  { id: 'trails', Icon: TrailIcon, cls: 'c-red' },
  { id: 'charms', Icon: StarIcon, cls: 'c-purple' },
  { id: 'glows', Icon: GlowIcon, cls: 'c-orange' },
  { id: 'treadmills', Icon: TreadmillIcon, cls: 'c-blue' },
]

function BackpackPanel() {
  const me = useGame((s) => s.me)
  const [tab, setTab] = useState('boards')
  if (!me) return null
  return (
    <Panel title="Backpack" Icon={BackpackIcon}>
      <div className="tabs">
        {BP_TABS.map(({ id, Icon, cls }) => (
          <button key={id} type="button" className={`tab ${cls}${tab === id ? ' on' : ''}`} onClick={() => (click(), setTab(id))}>
            <Icon />
          </button>
        ))}
      </div>
      {tab === 'boards' ? <BoardsTab me={me} /> : null}
      {tab === 'trails' ? <TrailsTab me={me} /> : null}
      {tab === 'charms' ? <CharmsTab me={me} /> : null}
      {tab === 'glows' ? <GlowsTab me={me} /> : null}
      {tab === 'treadmills' ? <TreadmillsTab me={me} /> : null}
    </Panel>
  )
}

/* --------------------------------------------------------------- rebirth */

function RebirthPanel() {
  const speed = useGame((s) => s.stats.speed)
  const r = useGame((s) => s.stats.rebirths)
  const prog = levelProgress(speed, r)
  const ready = prog.level >= MAX_LEVEL
  return (
    <Panel title="Rebirth" Icon={RebirthIcon}>
      <div className="rb-grid">
        <div className="rb-col-title stroke">Before</div>
        <div />
        <div className="rb-col-title stroke">After</div>
        <div className="rb-chip c-blue stroke">Speed x{rebirthSpeedMult(r)}</div>
        <div className="rb-arrow">▶</div>
        <div className="rb-chip c-blue stroke">Speed x{rebirthSpeedMult(r + 1)}</div>
        <div className="rb-chip c-gold stroke">Wins x{rebirthWinsMult(r)}</div>
        <div className="rb-arrow">▶</div>
        <div className="rb-chip c-gold stroke">Wins x{rebirthWinsMult(r + 1)}</div>
      </div>
      <div className="warn stroke-thin">Rebirth resets your speed &amp; level!</div>
      <div className="bar">
        <div className="fill" style={{ width: `${Math.min(100, (prog.level / MAX_LEVEL) * 100)}%` }} />
        <div className="txt stroke-thin">
          <span>Level {prog.level}</span>
          <span>
            {prog.level}/{MAX_LEVEL}
          </span>
        </div>
      </div>
      <div className="center-row">
        <button
          type="button"
          className={`gbtn stroke-thin ${ready ? 'c-green' : 'c-purple'}`}
          style={{ fontSize: '2.6rem', padding: '1rem 2.4rem' }}
          disabled={!ready}
          onClick={() => {
            click()
            net.send('rebirth', {})
          }}
        >
          {ready ? 'REBIRTH!' : `Level ${MAX_LEVEL} needed`}
        </button>
      </div>
      <div className="section-title" style={{ textAlign: 'center' }}>
        Next world unlocks at {WORLD_UNLOCK_REBIRTHS[1]} rebirths. You keep your Wins, boards, trails &amp; charms.
      </div>
    </Panel>
  )
}

/* -------------------------------------------------------------- teleport */

function TeleportPanel() {
  const me = useGame((s) => s.me)
  const close = useGame((s) => s.closePanel)
  if (!me) return null
  const w = me.world
  const go = (payload) => {
    click()
    net.send('tp', payload)
    close()
  }
  return (
    <Panel title="Teleport" Icon={GemIcon}>
      <div className="section-title">{WORLD_NAMES[w]}</div>
      <div className="tp-grid">
        <button type="button" className="gbtn c-green stroke-thin" onClick={() => go({ to: 'spawn' })}>
          Lobby
        </button>
        <button type="button" className="gbtn c-blue stroke-thin" onClick={() => go({ to: 'treadmills' })}>
          Treadmills
        </button>
        <button type="button" className="gbtn c-orange stroke-thin" onClick={() => go({ to: 'boards' })}>
          Skateboards
        </button>
        <button type="button" className="gbtn c-pink stroke-thin" onClick={() => go({ to: 'shop' })}>
          Shop
        </button>
      </div>
      <div className="section-title">Stages · a small fee in Wins</div>
      <div className="tp-grid">
        {Array.from({ length: stageCount(w) }, (_, i) => {
          const stage = i + 1
          const open = stage <= me.maxStage[w]
          const cost = teleportCost(w, stage)
          return (
            <button
              key={stage}
              type="button"
              className={`gbtn stroke-thin ${open ? 'c-purple' : 'c-gray'}`}
              disabled={!open || me.wins < cost}
              onClick={() => go({ to: 'stage', stage })}
            >
              <span className="dev-stage">
                <span>
                  {open ? null : <LockIcon />} Stage {stageNumber(w, stage)}
                </span>
                {open ? (
                  <small>
                    <TrophyIcon /> {formatNum(cost)}
                  </small>
                ) : null}
              </span>
            </button>
          )
        })}
      </div>
    </Panel>
  )
}

/* ---------------------------------------------------------------- worlds */

function WorldsPanel() {
  const me = useGame((s) => s.me)
  if (!me) return null
  return (
    <Panel title="Worlds" Icon={GlobeIcon}>
      <div className="list">
        {WORLD_NAMES.map((name, w) => {
          const need = WORLD_UNLOCK_REBIRTHS[w]
          const open = me.rebirths >= need
          const current = me.world === w
          return (
            <div
              key={w}
              className={`world-card ${w === 0 ? 'c-green' : 'c-blue'}`}
              onClick={() => {
                if (current || !open) return
                click()
                net.send('world', { w })
              }}
            >
              <div>
                <div className="wname stroke">World {w + 1}</div>
                <div className="stroke-thin" style={{ fontSize: '1.8rem' }}>
                  {name}
                </div>
              </div>
              <div className="wstate stroke" style={{ color: current ? '#ffe14d' : open ? '#ffffff' : '#ff4f8a' }}>
                {current ? 'Current' : open ? 'Travel ▶' : `${need} Rebirths Required`}
              </div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

/* --------------------------------------------------------------- rewards */

function rewardText(r) {
  if (r.wins) return `${formatNum(r.wins)} Wins`
  if (r.speed) return `${formatNum(r.speed)} Speed`
  if (r.boost) return `x2 ${r.boost === 'speed' ? 'Speed' : 'Wins'} 5m`
  return ''
}

function RewardsPanel() {
  useTick(1000)
  const me = useGame((s) => s.me)
  if (!me) return null
  const d = me.daily
  const playSeconds = me.session.playSeconds + Math.max(0, (serverNow() - me.now) / 1000)
  return (
    <Panel title="Rewards" Icon={GiftIcon}>
      <div className="section-title">Daily Streak: {d.streak} day{d.streak === 1 ? '' : 's'}</div>
      <div className="days">
        {DAILY_REWARDS.map((r, i) => {
          const scaled = scaleReward(r, me.rebirths)
          const done = d.claimedToday ? i <= (d.streak - 1) % 7 : i < d.streak % 7
          const next = !d.claimedToday && i === d.nextIndex
          return (
            <div key={i} className={`day ${next ? 'c-gold next' : done ? 'c-green done' : 'c-purple'}`}>
              <span className="stroke-thin">Day {i + 1}</span>
              <span className="stroke-thin">{rewardText(scaled)}</span>
            </div>
          )
        })}
      </div>
      <div className="center-row">
        <button type="button" className="gbtn c-gold stroke-thin" disabled={d.claimedToday} onClick={() => (click(), net.send('daily', {}))}>
          {d.claimedToday ? 'Come back tomorrow!' : 'Claim Daily Reward'}
        </button>
      </div>
      <div className="section-title">Playtime Gifts</div>
      <div className="gifts">
        {PLAYTIME_GIFTS.map((g, i) => {
          const claimed = me.session.gifts.includes(i)
          const left = g.min * 60 - playSeconds
          const ready = left <= 0 && !claimed
          return (
            <div key={i} className={`gift ${claimed ? 'c-gray' : ready ? 'c-gold' : 'c-blue'}`}>
              <GiftIcon />
              <span className="stroke-thin">{rewardText(scaleReward(g, me.rebirths))}</span>
              <button
                type="button"
                className="gbtn c-green stroke-thin"
                style={{ minWidth: 0, fontSize: '1.6rem', padding: '0.4rem 0.8rem' }}
                disabled={!ready}
                onClick={() => (click(), net.send('gift', { i }))}
              >
                {claimed ? 'Claimed' : ready ? 'Claim!' : fmtTime(left * 1000)}
              </button>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

/* -------------------------------------------------------------- settings */

function Toggle({ on, onClick }) {
  return (
    <button type="button" className={`gbtn stroke-thin ${on ? 'c-green' : 'c-gray'}`} style={{ minWidth: '8rem' }} onClick={onClick}>
      {on ? 'ON' : 'OFF'}
    </button>
  )
}

function SettingsPanel() {
  const settings = useGame((s) => s.settings)
  const update = useGame((s) => s.updateSettings)
  return (
    <Panel title="Settings" Icon={GearIcon}>
      <div className="set-row">
        <span>
          Music
        </span>
        <Toggle
          on={settings.music}
          onClick={() => {
            audio.setMusic(!settings.music)
            update({ music: !settings.music })
          }}
        />
      </div>
      <div className="set-row">
        <span>Sound Effects</span>
        <Toggle
          on={settings.sfx}
          onClick={() => {
            audio.setSfx(!settings.sfx)
            update({ sfx: !settings.sfx })
          }}
        />
      </div>
      <div className="set-row">
        <span>
          Riding Style
          <div className="hint">How your skater stands on the board (everyone sees it)</div>
        </span>
        <span style={{ display: 'flex', gap: '0.6rem' }}>
          {['Surfer', 'Classic', 'Chill'].map((label, i) => (
            <button
              key={label}
              type="button"
              className={`gbtn stroke-thin ${(settings.style ?? 0) === i ? 'c-green' : 'c-gray'}`}
              style={{ minWidth: '7.5rem' }}
              onClick={() => {
                click()
                update({ style: i })
                net.send('style', { style: i })
              }}
            >
              {label}
            </button>
          ))}
        </span>
      </div>
      <div className="set-row">
        <span>
          Graphics
          <div className="hint">Low turns off shadows for slower devices</div>
        </span>
        <button
          type="button"
          className="gbtn c-blue stroke-thin"
          style={{ minWidth: '8rem' }}
          onClick={() => update({ quality: settings.quality === 'high' ? 'low' : 'high' })}
        >
          {settings.quality === 'high' ? 'HIGH' : 'LOW'}
        </button>
      </div>
      <div className="section-title">Controls</div>
      <div className="keys">
        W A S D / Arrows - skate · S (or W when rolling backwards) - brake &amp; powerslide · Space - jump &amp; kickflip · Land on rails to grind
        <br />
        Drag - look around · Scroll / pinch - zoom · Stand on treadmills to train speed
        <br />
        E Shop · B Backpack · R Rebirth · T Teleport · M Worlds · G Rewards · P Profile · Esc close
      </div>
    </Panel>
  )
}

/* ----------------------------------------------------------------- root */

const PANELS = {
  shop: ShopPanel,
  backpack: BackpackPanel,
  rebirth: RebirthPanel,
  teleport: TeleportPanel,
  worlds: WorldsPanel,
  rewards: RewardsPanel,
  settings: SettingsPanel,
}

export function Panels() {
  const panel = useGame((s) => s.panel)
  const Comp = PANELS[panel]
  return Comp ? <Comp /> : null
}

export default Panels
