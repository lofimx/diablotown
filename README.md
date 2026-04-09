# Diablo Town

A Diablo 1-themed virtual office, similar to [Gather.town](https://gather.town). Players walk around isometric dungeon maps, interact with objects/NPCs, and connect via WebRTC video calls when in proximity.

## Tech Stack

- **Backend:** Rails 8.1.2, PostgreSQL 17, Action Cable (WebSockets)
- **Frontend:** TypeScript, Vite, HTML5 Canvas (isometric renderer)
- **Assets:** Diablo 1 / Diablo Hellfire sprite sheets from spriters-resource.com

## Setup

**First time only - pull game assets:**
```bash
git lfs install
git lfs pull
```

## Running

### 🐳 Docker

```bash
cd dev
docker compose build
./docker-start.sh
```

See [dev/README.docker.md](dev/README.docker.md).

### 💻 Local

```bash
bin/rails db:migrate db:seed
bin/vite dev &
bin/rails server
```
---
- Game: http://localhost:3000
- Map Editor: http://localhost:3000/editor
- Debug overlay: in-game Debug button → "Tile classification overlay"

## Before Committing

```bash
bin/rubocop -a              # lint + auto-fix Ruby style
bin/rails test              # unit/integration tests
bin/rails test:system       # system tests (needs browser driver)
npm audit --omit=dev        # JS vulnerability scan
```

CI runs all of these on every push and PR. Running them locally first avoids failed pipelines.

## Deploying

Deployment uses [Kamal](https://kamal-deploy.org) with Docker Hub. TypeScript is compiled by Vite during the Docker image build -- `rails assets:precompile` triggers `vite build` automatically via the `vite_rails` gem. No separate JS build step is needed.

### Secrets

Production secrets live in `.env` (git-ignored). Source it before deploying:

```bash
source .env
script/cleanup_docker_hub.sh    # optional: prune Docker Hub images older than 48h
bin/kamal deploy
```

- **`KAMAL_REGISTRY_PASSWORD`** — Docker Hub access token for the `deobald` registry account
- **`KAMAL_REGISTRY_CLEANUP_PASSWORD`** — Docker Hub PAT with delete scope (for `cleanup_docker_hub.sh`)
- **`RAILS_MASTER_KEY`** — automatically read from `config/master.key`
- **`POSTGRES_PASSWORD`** — password for the `diablo` PostgreSQL user

### Operations

```bash
bin/kamal app exec "bin/rails runner 'Rails.cache.clear'"   # clear Rails cache
```

## Tasks

### Bugs
- [ ] **BUG: East (bottom-right) z-order shows player outside of wall** — Player sprite visually escapes through E-edge wall tiles. Likely a z-ordering issue in the row-interleaved renderer rather than a collision bug.
- [ ] Minor 1px black lines between some tile columns (source tile edge artifacts)

### Architecture
- [ ] **TODO: Server-side dungeon generation** — Map generation currently runs in the TypeScript client. The first player to load a map with no `tile_data` generates the dungeon and PATCHes it back. A server-side race guard prevents overwrites, but the layout is still decided by an arbitrary client. This should move to Rails (or a background job) so the server is authoritative over map content.

### Features
- [ ] Door edge detection — corridor-to-room transitions should be identified as doors
- [ ] Map editor updates for edge-based wall system
- [ ] WebRTC proximity video chat (implemented but untested with multiple users)
- [ ] Multiple map support with map transitions
- [ ] NPC/object placement and interaction
- [ ] Account settings (export/import identity token)

### Polish
- [ ] Tile coherence — wall tiles should match their neighbors (e.g., continuous wall segments)
- [ ] Wall-only tiles for other tilesets (currently only church_dungeon)
- [ ] More character class sprite sheets (currently one per class)
- [ ] Sound effects and ambient audio
