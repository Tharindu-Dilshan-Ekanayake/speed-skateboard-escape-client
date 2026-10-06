# +1 Speed Skateboard Escape — client

Web client for **+1 Speed Skateboard Escape**: React + React Three Fiber, Rapier
physics, Colyseus multiplayer, Bloxity login/avatars. The server lives in
`../speed-skateboard-escape-server`.

## Run locally

```bash
# terminal 1 - game server (http://localhost:2567)
cd ../speed-skateboard-escape-server
npm install
npm run dev

# terminal 2 - client (http://localhost:5173)
cd speed-skateboard-escape-client
npm install
npm run dev
```

To see multiplayer, open the game in a second **browser or private window** (two
tabs of the same browser share one guest account, and the newest tab takes over).
Without `MONGODB_URI` the server saves progress to `.data/dev-db.json`.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Skate | W A S D / arrows | left joystick |
| Jump / kickflip / pop off a rail | Space | JUMP button |
| Look around | drag the mouse | drag the screen |
| Zoom | mouse wheel | pinch |

## How the game works

- **Speed** is earned every half-second while you ride or stand on a treadmill:
  `(1 + board bonus) × treadmill × rebirth × trail × charms × boosts × squad`.
- **Level** (0–25) comes from your speed. Each level raises your top riding speed,
  which is what lets you jump the wider **speed gaps** in later stages.
- **20 stages** (10 per world). Each ends with a speed gap, then two win pads
  (*Return* teleports you to the lobby, *Continue* lets you keep going through the
  gate) and two free treadmills.
- **Wins** buy everything: skateboards, treadmills, trails, charms, speed packs and
  boosts. No real-money purchases.
- **Rebirth** at level 25: speed resets, but every future speed and win gain is
  multiplied. **World 2 (Neon City)** unlocks at 3 rebirths.
- Daily streak, playtime gifts and a quest chain keep players coming back.

## Project layout

```
src/
  shared/      config.js + layout.js - copied from the server (npm run sync-shared)
  net/         auth, matchmaker, Colyseus room, server messages
  state/       zustand UI store + per-frame shared data
  game/        scene, physics, skate controller, riders, world, obstacles, audio
  ui/          HUD, panels, loading screen, touch controls
```

The server's `src/shared/` is the source of truth for game data. After editing it,
run `npm run sync-shared` here.

## Environment

`.env.development` (local), `.env.production` (prod channel) and `.env.dev`
(dev channel) are committed; none of them hold secrets. See `.env.example`.

## Deploy (Bloxity Legion)

Pushing to `main` builds with `.env.production` and uploads to the **prod**
channel; pushing to `dev` uses `.env.dev` and the **dev** channel
(`.github/workflows/deploy.yml`). Add the `LEGION_DEPLOY_TOKEN` repository secret
first.

Manual upload instead:

```powershell
npm run build              # or: npm run build:dev
Compress-Archive -Path dist\* -DestinationPath build.zip -Force
```

then drag `build.zip` onto the channel on **My Games**.

- prod: https://speed-skateboard-escape.play.bloxity.io
- dev: https://speed-skateboard-escape.dev.play.bloxity.io
