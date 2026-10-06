/**
 * Procedural sound: every effect and the music loop are synthesised with
 * WebAudio, so there are no audio files to download or fail to load.
 *
 * Browsers only allow audio after a user gesture, so nothing is created until
 * `unlock()` runs from the first click / key press.
 */

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12)

class AudioEngine {
  ctx = null
  master = null
  sfxGain = null
  musicGain = null
  noise = null
  sfxOn = true
  musicOn = true
  roll = null
  grind = null
  musicTimer = null
  nextBeat = 0
  beat = 0

  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return
      try {
        this.ctx = new Ctx()
      } catch {
        return
      }
      const ctx = this.ctx
      this.master = ctx.createGain()
      this.master.gain.value = 0.9
      this.master.connect(ctx.destination)
      this.sfxGain = ctx.createGain()
      this.sfxGain.gain.value = this.sfxOn ? 0.8 : 0
      this.sfxGain.connect(this.master)
      this.musicGain = ctx.createGain()
      this.musicGain.gain.value = this.musicOn ? 0.16 : 0
      this.musicGain.connect(this.master)

      const len = ctx.sampleRate * 2
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate)
      const data = this.noise.getChannelData(0)
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1

      // Urethane wheels on concrete: a growl that flutters at the rate the
      // wheels spin ("brrrrr"), over a soft low rumble from the ground.
      this.wheel = this.makeWheel()
      this.rumble = this.makeLoop(110, 0.7, 'lowpass')
      this.nextJoint = 0
      this.jointFlip = 0
      this.grind = this.makeLoop(3200, 6, 'bandpass')
      this.scrub = this.makeLoop(1400, 1.4, 'bandpass')
      this.startMusic()
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {})
  }

  setSfx(on) {
    this.sfxOn = on
    if (this.sfxGain) this.sfxGain.gain.setTargetAtTime(on ? 0.8 : 0, this.ctx.currentTime, 0.05)
  }

  setMusic(on) {
    this.musicOn = on
    if (this.musicGain) this.musicGain.gain.setTargetAtTime(on ? 0.16 : 0, this.ctx.currentTime, 0.2)
  }

  /* ------------------------------------------------------------ building */

  /**
   * Rolling-wheel voice: looping noise shaped like a skate wheel's growl, whose
   * loudness flutters (tremolo) at the wheel's spin rate. Faster riding = faster
   * flutter + higher pitch, which is what makes it read as wheels, not wind.
   */
  makeWheel() {
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.loop = true
    const body = ctx.createBiquadFilter()
    body.type = 'bandpass'
    body.frequency.value = 320
    body.Q.value = 0.7
    const low = ctx.createBiquadFilter()
    low.type = 'lowpass'
    low.frequency.value = 900
    low.Q.value = 0.5
    // The flutter: a gentle tremolo (about +-15%), so it hums instead of buzzing.
    const trem = ctx.createGain()
    trem.gain.value = 0.82
    const lfo = ctx.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = 12
    const depth = ctx.createGain()
    depth.gain.value = 0.15
    lfo.connect(depth).connect(trem.gain)
    const out = ctx.createGain()
    out.gain.value = 0
    src.connect(body).connect(low).connect(trem).connect(out).connect(this.sfxGain)
    src.start()
    lfo.start()
    return { body, lfo, out }
  }

  makeLoop(freq, q, type) {
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.loop = true
    const filter = ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.value = freq
    filter.Q.value = q
    const gain = ctx.createGain()
    gain.gain.value = 0
    src.connect(filter).connect(gain).connect(this.sfxGain)
    src.start()
    return { filter, gain }
  }

  tone(freq, start, dur, { type = 'sine', vol = 0.2, to = null, attack = 0.005, dest = this.sfxGain } = {}) {
    const ctx = this.ctx
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, start)
    if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + dur)
    g.gain.setValueAtTime(0.0001, start)
    g.gain.exponentialRampToValueAtTime(vol, start + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
    osc.connect(g).connect(dest)
    osc.start(start)
    osc.stop(start + dur + 0.05)
  }

  burst(start, dur, { freq = 2000, type = 'bandpass', q = 1, vol = 0.3, to = null, dest = this.sfxGain } = {}) {
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const filter = ctx.createBiquadFilter()
    filter.type = type
    filter.Q.value = q
    filter.frequency.setValueAtTime(freq, start)
    if (to) filter.frequency.exponentialRampToValueAtTime(to, start + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(vol, start)
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
    src.connect(filter).connect(g).connect(dest)
    src.start(start, Math.random() * 1.5)
    src.stop(start + dur + 0.05)
  }

  /* ------------------------------------------------------------- effects */

  play(name) {
    if (!this.ctx || !this.sfxOn || this.ctx.state !== 'running') return
    const t = this.ctx.currentTime + 0.005
    switch (name) {
      case 'tick':
        this.tone(1400, t, 0.05, { vol: 0.025, to: 2000 })
        break
      case 'jump':
        this.burst(t, 0.06, { freq: 2600, q: 0.8, vol: 0.35 })
        this.tone(190, t, 0.09, { vol: 0.25, to: 90 })
        break
      case 'creak':
        // Wooden plank giving way.
        this.tone(140, t, 0.35, { type: 'sawtooth', vol: 0.06, to: 70 })
        this.burst(t + 0.05, 0.25, { freq: 700, q: 3, vol: 0.12, to: 300 })
        break
      case 'brake':
        // Kick into a powerslide: quick scuff + thump.
        this.burst(t, 0.12, { freq: 1800, q: 1, vol: 0.3, to: 700 })
        this.tone(110, t, 0.08, { vol: 0.12, to: 70 })
        break
      case 'push':
        // Shoe scuffing the ground.
        this.burst(t, 0.16, { freq: 900, type: 'bandpass', q: 0.9, vol: 0.22, to: 400 })
        this.tone(90, t, 0.06, { vol: 0.08, to: 60 })
        break
      case 'land':
        this.burst(t, 0.09, { freq: 500, type: 'lowpass', vol: 0.45 })
        this.tone(120, t, 0.08, { vol: 0.2, to: 60 })
        break
      case 'flip':
        this.burst(t, 0.18, { freq: 1200, q: 2, vol: 0.12, to: 3000 })
        break
      case 'win':
        ;[72, 76, 79, 84, 88].forEach((n, i) => this.tone(NOTE(n), t + i * 0.07, 0.25, { type: 'triangle', vol: 0.18 }))
        this.burst(t + 0.3, 0.4, { freq: 6000, q: 0.5, vol: 0.08 })
        break
      case 'levelup':
        ;[60, 64, 67, 72, 76, 79].forEach((n, i) => this.tone(NOTE(n), t + i * 0.06, 0.18, { type: 'square', vol: 0.07 }))
        ;[72, 76, 79, 84].forEach((n) => this.tone(NOTE(n), t + 0.4, 0.6, { type: 'triangle', vol: 0.09 }))
        break
      case 'unlock':
        ;[67, 71, 74, 79].forEach((n, i) => this.tone(NOTE(n), t + i * 0.08, 0.3, { type: 'triangle', vol: 0.15 }))
        break
      case 'quest':
        ;[76, 83].forEach((n, i) => this.tone(NOTE(n), t + i * 0.1, 0.3, { type: 'triangle', vol: 0.16 }))
        break
      case 'buy':
        this.tone(988, t, 0.08, { type: 'square', vol: 0.08 })
        this.tone(1319, t + 0.08, 0.3, { type: 'square', vol: 0.08 })
        break
      case 'error':
        this.tone(170, t, 0.14, { type: 'sawtooth', vol: 0.09 })
        this.tone(125, t + 0.12, 0.18, { type: 'sawtooth', vol: 0.09 })
        break
      case 'click':
        this.tone(660, t, 0.04, { vol: 0.08, to: 880 })
        break
      case 'splash':
        this.burst(t, 0.6, { freq: 3000, type: 'lowpass', vol: 0.5, to: 250 })
        this.tone(400, t, 0.3, { vol: 0.1, to: 120 })
        break
      case 'bonk':
        this.tone(320, t, 0.18, { type: 'square', vol: 0.12, to: 70 })
        this.burst(t, 0.12, { freq: 800, type: 'lowpass', vol: 0.4 })
        break
      case 'teleport':
        this.tone(300, t, 0.4, { type: 'sine', vol: 0.14, to: 1400 })
        this.tone(450, t + 0.05, 0.35, { type: 'triangle', vol: 0.06, to: 1800 })
        break
      case 'rebirth':
        ;[48, 55, 60, 64, 67, 72, 76, 79, 84].forEach((n, i) => this.tone(NOTE(n), t + i * 0.05, 0.9, { type: 'triangle', vol: 0.08 }))
        this.burst(t, 1.2, { freq: 300, q: 0.7, vol: 0.12, to: 8000 })
        break
      default:
        break
    }
  }

  /** Continuous rolling / grinding noise, driven each frame by the local rider. */
  setMotion(speed01, grounded, grinding, braking = false) {
    if (!this.ctx || this.ctx.state !== 'running') return
    const t = this.ctx.currentTime
    const rolling = grounded && !grinding && !braking && speed01 > 0.03
    // Wheel growl: spins faster (flutter 9 -> 55 Hz) and brighter with speed.
    const wheel = this.wheel
    // Slow time constants everywhere so speed changes glide instead of jumping.
    wheel.out.gain.setTargetAtTime(rolling ? Math.min(1.5, 0.3 + speed01 * 1.3) : 0, t, rolling ? 0.22 : 0.12)
    wheel.lfo.frequency.setTargetAtTime(6 + speed01 * 20, t, 0.3)
    wheel.body.frequency.setTargetAtTime(260 + speed01 * 340, t, 0.3)
    this.rumble.gain.gain.setTargetAtTime(rolling ? Math.min(0.7, 0.14 + speed01 * 0.5) : 0, t, 0.25)
    this.rumble.filter.frequency.setTargetAtTime(90 + speed01 * 100, t, 0.3)
    // "tak-tak": a click each time the wheels cross a seam in the ground. The
    // faster you ride the faster they come, so speed is something you can hear.
    if (rolling && this.sfxOn) {
      const metersPerSecond = speed01 * 22
      const interval = Math.min(0.8, Math.max(0.14, 2.2 / Math.max(1, metersPerSecond)))
      if (t >= this.nextJoint) {
        if (this.nextJoint > 0 && t - this.nextJoint < 0.3) {
          const flip = (this.jointFlip = 1 - this.jointFlip)
          // A soft, rounded "tok": low thump with only a little click on top.
          const vol = 0.03 + speed01 * 0.05
          this.burst(t, 0.05, { freq: flip ? 800 : 650, q: 0.9, vol: vol * 0.6, to: 350, type: 'lowpass' })
          this.tone(flip ? 90 : 75, t, 0.09, { vol, to: 52, attack: 0.012 })
        }
        this.nextJoint = t + interval
      }
    } else {
      this.nextJoint = 0
    }
    this.grind.gain.gain.setTargetAtTime(grinding ? 0.22 : 0, t, 0.04)
    // Powerslide: wheels scrubbing sideways across the ground.
    this.scrub.gain.gain.setTargetAtTime(braking ? 0.1 + speed01 * 0.35 : 0, t, braking ? 0.03 : 0.08)
    this.scrub.filter.frequency.setTargetAtTime(900 + speed01 * 1600, t, 0.05)
  }

  /* --------------------------------------------------------------- music */

  startMusic() {
    this.nextBeat = this.ctx.currentTime + 0.3
    this.beat = 0
    clearInterval(this.musicTimer)
    this.musicTimer = setInterval(() => this.scheduleMusic(), 60)
  }

  scheduleMusic() {
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running') return
    const spb = 60 / 116 / 2 // eighth notes
    const dest = this.musicGain
    // C - Am - F - G, two bars each.
    const roots = [48, 45, 41, 43]
    const chords = [
      [60, 64, 67],
      [57, 60, 64],
      [53, 57, 60],
      [55, 59, 62],
    ]
    const melody = [72, 74, 76, 79, 76, 74, 72, 67, 69, 72, 74, 72, 76, 74, 71, 67]
    while (this.nextBeat < ctx.currentTime + 0.25) {
      const t = this.nextBeat
      const step = this.beat % 64
      const bar = Math.floor(step / 16)
      const inBar = step % 16
      if (inBar % 4 === 0) this.tone(NOTE(roots[bar] - 12), t, spb * 1.8, { type: 'triangle', vol: 0.5, dest })
      if (inBar % 4 === 2) this.tone(NOTE(roots[bar]), t, spb * 0.9, { type: 'triangle', vol: 0.3, dest })
      if (inBar % 8 === 0) this.tone(110, t, 0.12, { vol: 0.55, to: 45, dest })
      if (inBar % 8 === 4) this.burst(t, 0.1, { freq: 1800, q: 0.7, vol: 0.18, dest })
      this.burst(t, 0.03, { freq: 8000, type: 'highpass', vol: inBar % 2 ? 0.05 : 0.08, dest })
      if (inBar % 4 === 2) chords[bar].forEach((n) => this.tone(NOTE(n), t, spb * 0.8, { type: 'square', vol: 0.03, dest }))
      if (this.beat % 128 >= 64 && inBar % 2 === 0) {
        const n = melody[(inBar / 2 + bar * 4) % melody.length]
        this.tone(NOTE(n), t, spb * 1.6, { type: 'triangle', vol: 0.12, dest })
      }
      this.nextBeat += spb
      this.beat += 1
    }
  }
}

export const audio = new AudioEngine()
