import { create } from 'zustand'

/**
 * UI-facing game state. Anything read every frame by the 3D loop lives in
 * `live` (below) instead, so the render loop never triggers React re-renders.
 */

const SETTINGS_KEY = 'sse_settings_v1'

function loadSettings() {
  const defaults = { music: true, sfx: true, quality: 'high', customSpeed: 0, style: 0 }
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults
  } catch {
    return defaults
  }
}

let toastId = 0

export const useGame = create((set, get) => ({
  /** boot -> loading -> connecting -> playing ; 'kicked' when opened elsewhere */
  phase: 'boot',
  progress: 0,
  loadingText: 'Starting…',
  reconnecting: false,

  sessionId: null,
  /** Private profile from the server ("me" message). */
  me: null,
  /** Public stats of the local player, mirrored from room state. */
  stats: { speed: 0, wins: 0, level: 0, rebirths: 0, world: 0 },
  /** Riders in this lobby, for the player list. */
  players: [],
  lb: { speed: [], wins: [], rebirths: [] },

  panel: null,
  prompt: null,
  toasts: [],
  popups: [],
  banner: null,
  bigWins: null,
  showPlayers: true,

  settings: loadSettings(),

  setPhase: (phase) => set({ phase }),
  setLoading: (progress, loadingText) => set((s) => ({ progress: Math.max(s.progress, progress), loadingText })),
  openPanel: (panel) => set((s) => ({ panel: s.panel === panel ? null : panel, prompt: null })),
  closePanel: () => set({ panel: null }),
  setPrompt: (prompt) => set({ prompt }),

  toast: (text, kind = 'info') => {
    const id = (toastId += 1)
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 2600)
  },

  popup: (n) => {
    const id = (toastId += 1)
    set((s) => ({ popups: [...s.popups.slice(-10), { id, n, x: Math.random() }] }))
    setTimeout(() => set((s) => ({ popups: s.popups.filter((p) => p.id !== id) })), 1100)
  },

  showBanner: (text, sub = '', color = '#ffe14d') => {
    const id = (toastId += 1)
    set({ banner: { id, text, sub, color } })
    setTimeout(() => {
      if (get().banner?.id === id) set({ banner: null })
    }, 2600)
  },

  showBigWins: (n) => {
    const id = (toastId += 1)
    set({ bigWins: { id, n } })
    setTimeout(() => {
      if (get().bigWins?.id === id) set({ bigWins: null })
    }, 2200)
  },

  updateSettings: (patch) => {
    const settings = { ...get().settings, ...patch }
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    } catch {
      /* private mode */
    }
    set({ settings })
  },
}))

/**
 * Mutable per-frame data shared between the network layer and the render loop.
 */
export const live = {
  /** Local rider, written by LocalPlayer each frame. */
  local: {
    x: 0,
    y: 0,
    z: 0,
    ry: Math.PI,
    speed: 0,
    anim: 1,
    flip: 0,
    seq: 0,
    world: 0,
    stage: 0,
    checkpoint: 0,
  },
  /** Pending server teleport, consumed by LocalPlayer. */
  teleport: null,
  /** sessionId -> remote rider record (see net/session.js). */
  remotes: new Map(),
  /** serverTime - localTime, in ms. */
  serverOffset: 0,
}

export const serverNow = () => Date.now() + live.serverOffset
export const serverSeconds = () => serverNow() / 1000
