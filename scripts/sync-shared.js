/**
 * Copies the shared game data (config + map generator) from the server repo,
 * which is the source of truth, into src/shared/. Run after editing either file.
 *   npm run sync-shared
 */
import { copyFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const from = resolve(here, '../../speed-skateboard-escape-server/src/shared')
const to = resolve(here, '../src/shared')

if (!existsSync(from)) {
  console.error(`Server repo not found at ${from}`)
  process.exit(1)
}
for (const file of ['config.js', 'layout.js']) {
  copyFileSync(resolve(from, file), resolve(to, file))
  console.log(`synced ${file}`)
}
