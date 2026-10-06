/**
 * Everything heavy (three.js, physics, 3D text): loaded as a separate chunk, so
 * the loading screen and the server connection can start before it has finished
 * downloading.
 */
import { preloadFont } from 'troika-three-text'

import GameScene from './GameScene'
import { initRapier } from './physics'
import { FONT_URL } from './World'

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-.:!?/() ,\'x'

/** Loads the sign font up front so text doesn't pop in later (capped at 2.5 s). */
export function preloadText() {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 2500)
    try {
      preloadFont({ font: FONT_URL, characters: GLYPHS }, () => {
        clearTimeout(timer)
        resolve()
      })
    } catch {
      clearTimeout(timer)
      resolve()
    }
  })
}

export { GameScene, initRapier }
