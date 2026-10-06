import { Client } from '@colyseus/sdk'

import { getSDK, safeCall } from '../bloxity/sdk'
import { getBloxityState, useBloxityStore } from '../bloxity/store'
import { audio } from '../game/audio'
import { GAME_ID, ROOM_NAME, WORLD_NAMES, formatNum } from '../shared/config'
import { live, useGame } from '../state/store'

/**
 * Connection lifecycle: auth -> matchmaker -> Colyseus room, plus every
 * server -> client message. Server messages are data only; all player-facing
 * text is written here on the client.
 */

const SERVER_URL = (import.meta.env.VITE_SERVER_URL || 'http://localhost:2567').replace(/\/$/, '')
const MATCHMAKER_URL = (import.meta.env.VITE_MATCHMAKER_URL || '').replace(/\/$/, '')
const PLAY_ID = import.meta.env.VITE_GAME_ID || GAME_ID
const GUEST_KEY = 'sse_guest_token'
const KICK_CODE = 4777

const FAIL_TEXT = {
  wins: 'Not enough Wins!',
  locked: 'Locked! Rebirth more to unlock it.',
  level: 'Reach Level 25 to Rebirth!',
  sold: 'Sold out! Wait for the restock.',
  full: 'Charm slots are full (max 3).',
  claimed: 'Already claimed!',
  early: 'Not ready yet - keep playing!',
  owned: 'You already own this!',
}

const OK_TEXT = {
  buyBoard: 'New skateboard equipped!',
  equipBoard: 'Skateboard equipped!',
  buyTreadmill: 'Treadmill unlocked!',
  buyPremium: 'VIP unlocked!',
  buyGlow: 'Glow equipped!',
  buyTrail: 'Trail equipped!',
  buyCharm: 'Charm bought & equipped!',
  refreshCharms: 'Charm shop refreshed!',
  buyPack: 'Speed added!',
  buyBoost: 'Boost activated!',
  daily: 'Daily reward claimed!',
  gift: 'Gift claimed!',
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function postJson(url, body) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
      signal: controller.signal,
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function readGuestToken() {
  try {
    return localStorage.getItem(GUEST_KEY)
  } catch {
    return null
  }
}

function writeGuestToken(token) {
  try {
    localStorage.setItem(GUEST_KEY, token)
  } catch {
    /* private mode: guest progress lasts for this tab only */
  }
}

/** Waits (briefly) for the Bloxity SDK so a logged-in player loads their account. */
async function waitForBloxity(timeoutMs = 6000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const status = useBloxityStore.getState().status
    if (status === 'ready' || status === 'error') return
    await wait(100)
  }
}

async function fetchSessionToken() {
  const sdk = getSDK()
  const { user, guest } = getBloxityState()
  const guestToken = readGuestToken()

  if (user) {
    const platformToken = safeCall(sdk?.auth?.getToken?.bind(sdk.auth))
    if (platformToken) {
      const res = await postJson(`${SERVER_URL}/api/legion-auth`, { token: platformToken, guestToken })
      if (res?.token) return res.token
    }
  }

  const res = await postJson(`${SERVER_URL}/api/guest`, {
    guestToken,
    name: guest?.displayName || guest?.username || '',
  })
  if (!res?.token) return null
  writeGuestToken(res.token)
  return res.token
}

/** Asks the Legion matchmaker for a pod; falls back to the direct backend URL. */
async function createClient() {
  if (MATCHMAKER_URL) {
    const res = await postJson(`${MATCHMAKER_URL}/v1/play/${PLAY_ID}`, {})
    if (res?.roomId) {
      return new Client(`${MATCHMAKER_URL.replace(/^http/, 'ws')}/v1/ws/${res.roomId}`)
    }
  }
  return new Client(SERVER_URL)
}

function lookPayload() {
  const { equipped, proportions } = getBloxityState()
  try {
    return JSON.stringify({ equipped, proportions }).slice(0, 3900)
  } catch {
    return ''
  }
}

class Session {
  room = null
  connecting = false
  intentionalLeave = false
  pingTimer = null
  listTimer = 0
  userKey = undefined

  /** Called once at boot; keeps retrying until a room is joined. */
  async start() {
    if (this.connecting) return
    this.connecting = true
    const game = useGame.getState()
    if (game.phase !== 'playing') {
      game.setPhase('connecting')
      game.setLoading(0.85, 'Signing in…')
    }
    await waitForBloxity()
    this.watchLogin()

    let attempt = 0
    for (;;) {
      try {
        const token = await fetchSessionToken()
        if (!token) throw new Error('no token')
        if (useGame.getState().phase !== 'playing') useGame.getState().setLoading(0.92, 'Finding a server…')
        const client = await createClient()
        // Resume at the current stage after a reconnect / server hop.
        const resume = { stage: live.local.checkpoint || 0 }
        const room = await client.joinOrCreate(ROOM_NAME, {
          token,
          look: lookPayload(),
          resume,
          style: useGame.getState().settings.style ?? 0,
        })
        this.attach(room)
        break
      } catch (err) {
        attempt += 1
        console.warn('[net] connect failed, retrying', err?.message || err)
        if (useGame.getState().phase !== 'playing') useGame.getState().setLoading(0.92, 'Connecting to server…')
        await wait(Math.min(8000, 800 * attempt))
      }
    }
    this.connecting = false
  }

  /** Rejoin from scratch (login change, server drain, failed reconnection). */
  async restart() {
    const old = this.room
    this.room = null
    if (old) {
      this.intentionalLeave = true
      try {
        await old.leave(true)
      } catch {
        /* already gone */
      }
      this.intentionalLeave = false
    }
    useGame.setState({ reconnecting: true })
    await this.start()
  }

  watchLogin() {
    if (this.userKey !== undefined) return
    this.userKey = getBloxityState().user?._id ?? null
    useBloxityStore.subscribe((s) => {
      const key = s.user?._id ?? null
      if (key === this.userKey) return
      this.userKey = key
      if (this.room) this.restart()
    })
  }

  attach(room) {
    this.room = room
    live.remotes.clear()
    const game = useGame.getState()
    useGame.setState({ sessionId: room.sessionId, reconnecting: false })
    safeCall(getSDK()?.game?.updateRoom, room.roomId)

    room.onStateChange((state) => this.onState(state))
    room.onMessage('tp', (m) => {
      live.local.seq = m.seq
      live.teleport = { p: m.p, ry: m.ry }
    })
    room.onMessage('me', (m) => useGame.setState({ me: m }))
    room.onMessage('time', (m) => {
      live.serverOffset = m.s - Date.now()
    })
    room.onMessage('pong', (m) => {
      const now = Date.now()
      const rtt = now - m.c
      if (rtt < 0 || rtt > 5000) return
      const offset = m.s + rtt / 2 - now
      live.serverOffset = live.serverOffset * 0.7 + offset * 0.3
    })
    room.onMessage('lb', (m) => useGame.setState({ lb: m }))
    room.onMessage('fx', (m) => this.onFx(m))
    room.onMessage('res', (m) => this.onResult(m))
    room.onMessage('migrate', () => this.restart())

    room.onDrop(() => useGame.setState({ reconnecting: true }))
    room.onReconnect(() => useGame.setState({ reconnecting: false }))
    room.onError((code) => console.warn('[net] room error', code))
    room.onLeave((code) => {
      if (this.room !== room) return
      this.room = null
      if (code === KICK_CODE) {
        useGame.getState().setPhase('kicked')
        return
      }
      if (!this.intentionalLeave) this.restart()
    })

    clearInterval(this.pingTimer)
    this.pingTimer = setInterval(() => this.send('ping', { c: Date.now() }), 4000)
    this.send('ping', { c: Date.now() })

    if (game.phase !== 'playing') {
      game.setLoading(1, 'Ready!')
      setTimeout(() => useGame.getState().setPhase('playing'), 250)
    }
  }

  send(type, payload) {
    const room = this.room
    if (!room || !room.connection?.isOpen) return false
    try {
      room.send(type, payload)
      return true
    } catch {
      return false
    }
  }

  onState(state) {
    const myId = this.room?.sessionId
    const now = performance.now()
    const seen = new Set()
    let mine = null

    state.players.forEach((p, id) => {
      if (id === myId) {
        mine = p
        return
      }
      seen.add(id)
      let rec = live.remotes.get(id)
      if (!rec) {
        rec = { id, buffer: [], look: '', lookParsed: null }
        live.remotes.set(id, rec)
      }
      rec.name = p.name
      if (rec.look !== p.look) {
        rec.look = p.look
        try {
          rec.lookParsed = p.look ? JSON.parse(p.look) : null
        } catch {
          rec.lookParsed = null
        }
      }
      rec.board = p.board
      rec.style = p.st
      rec.glow = p.gl
      rec.trail = p.trail
      rec.level = p.level
      rec.rebirths = p.rebirths
      rec.world = p.world
      rec.buffer.push({ t: now, x: p.x, y: p.y, z: p.z, ry: p.ry, a: p.a, f: p.f, v: p.v / 10 })
      if (rec.buffer.length > 40) rec.buffer.splice(0, rec.buffer.length - 40)
    })
    for (const id of live.remotes.keys()) if (!seen.has(id)) live.remotes.delete(id)

    if (mine) {
      const prev = useGame.getState().stats
      if (
        prev.speed !== mine.speed ||
        prev.wins !== mine.wins ||
        prev.level !== mine.level ||
        prev.rebirths !== mine.rebirths ||
        prev.world !== mine.world
      ) {
        const gained = mine.speed - prev.speed
        if (gained > 0 && prev.rebirths === mine.rebirths) {
          useGame.getState().popup(gained)
          audio.play('tick')
        }
        useGame.setState({
          stats: { speed: mine.speed, wins: mine.wins, level: mine.level, rebirths: mine.rebirths, world: mine.world },
        })
      }
    }

    if (now - this.listTimer > 1000) {
      this.listTimer = now
      const players = []
      state.players.forEach((p, id) =>
        players.push({ id, name: p.name, level: p.level, wins: p.wins, speed: p.speed, rebirths: p.rebirths, me: id === myId }),
      )
      players.sort((a, b) => b.speed - a.speed)
      useGame.setState({ players })
    }
  }

  onFx(m) {
    const game = useGame.getState()
    switch (m.k) {
      case 'wins':
        game.showBigWins(m.n)
        audio.play('win')
        break
      case 'level':
        game.showBanner('LEVEL UP!', `Level ${m.level}`, '#5cff7a')
        audio.play('levelup')
        break
      case 'unlock':
        game.showBanner(`STAGE ${m.stage}`, 'Unlocked! Teleport here any time.', '#3fe8ff')
        audio.play('unlock')
        break
      case 'quest':
        game.toast(`Quest complete: ${m.text}  +${formatNum(m.n)} Wins`, 'good')
        audio.play('quest')
        break
      default:
        break
    }
  }

  onResult(m) {
    const game = useGame.getState()
    const ok = m.code === 'ok' || m.code === 'equipped' || m.code === 'unequipped'
    if (!ok) {
      const text = FAIL_TEXT[m.code]
      if (text) game.toast(text, 'bad')
      audio.play('error')
      return
    }
    if (m.action === 'rebirth') {
      game.showBanner('REBIRTH!', `Rebirth ${m.rebirths} - your speed multiplier grew!`, '#ff7ad9')
      audio.play('rebirth')
      game.closePanel()
      return
    }
    if (m.action === 'world') {
      game.showBanner(WORLD_NAMES[useGame.getState().me?.world ?? 0] || 'New World', 'Welcome!', '#3fe8ff')
      audio.play('teleport')
      game.closePanel()
      return
    }
    if (m.action === 'buyGlow' && m.code !== 'ok') {
      game.toast(m.code === 'equipped' ? 'Glow equipped!' : 'Glow off - your board shines its own colour.', 'info')
      audio.play('click')
      return
    }
    if (m.action === 'toggleCharm') {
      game.toast(m.code === 'equipped' ? 'Charm equipped!' : 'Charm unequipped.', 'info')
      audio.play('click')
      return
    }
    const text = OK_TEXT[m.action]
    if (text) game.toast(text, 'good')
    audio.play(m.action === 'equipBoard' ? 'click' : 'buy')
    if (m.action === 'buyBoard' || m.action === 'buyTreadmill' || m.action === 'buyPremium') game.setPrompt(null)
  }
}

export const net = new Session()
