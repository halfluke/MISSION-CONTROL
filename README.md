# squid-viz

A visualizer for GSD (Get Shit Done) projects — renders your milestones, slices, and tasks as an organic squid visualization on an HTML5 Canvas.

![Squid-Map demo](docs/squid-viz-demo.gif)

## Quick Start (2 minutes)

**Step 1: Install the visualizer**
```bash
git clone <this-repo>
cd <repo>
npm install
npm run dev    # HTTP on 5177, WebSocket on 5178
```

**Step 2: Add the extension to each GSD project you want to visualize**
```bash
# Copy the extension into the target project's .gsd/extensions/ directory
# This creates .gsd/extensions/squid-snapshot-writer/ in the target project
cp -r .gsd/extensions/squid-snapshot-writer /path/to/other-project/.gsd/extensions/
```

**Step 3: Visualize that project**

Either `cd` into the project first:
```bash
cd /path/to/other-project

# Terminal 1: Start the visualizer (auto-discovers this project's .gsd/)
squid-viz

# Terminal 2: Start GSD with the extension (from the same project)
gsd --extension .gsd/extensions/squid-snapshot-writer/index.js
```

Or use `--gsd-dir` to specify the project without `cd`:
```bash
squid-viz --gsd-dir /path/to/other-project

# Then in another terminal (from the target project):
cd /path/to/other-project
gsd --extension .gsd/extensions/squid-snapshot-writer/index.js
```

> ⚠️ **Project matching.** `squid-viz` auto-discovers `.gsd/` from `process.cwd()` (or `--gsd-dir`). The extension also uses `process.cwd()`. The extension announces which project it's from on connect, and `squid-viz` rejects extensions that don't match its configured project.

## How It Works

- **WebSocket** on port 5178: GSD extension pushes data every 5 seconds
- **HTTP** on port 5177: Serves the Canvas UI
- **Fallback**: If no WebSocket server, extension writes to disk and browser polls (slower)

### Connection Indicator (bottom-right corner)
- 🟢 **Green**: WebSocket connected, real-time updates
- 🟡 **Yellow**: Polling fallback (squid-viz not running)
- 🔴 **Red**: Disconnected entirely

## Architecture

- **Frontend**: Native Canvas 2D API (no Pixi/D3/Three.js)
- **Data**: WebSocket streaming — GSD extension pushes directly
- **CLI**: Global `squid-viz` serves UI + WebSocket server

## Commands

```bash
squid-viz           # Default (ports 5177/5178)
squid-viz --port 3000 --ws-port 3001  # Custom ports
squid-viz --no-open  # Don't auto-open browser
```

## Development

```bash
npm run dev    # HMR + WebSocket
npm run build  # Production build
```

## Files

| Path | Purpose |
|------|---------|
| `bin/squid-viz` | CLI with WebSocket server |
| `vite.config.js` | Dev server + WebSocket plugin |
| `src/main.js` | Canvas + WebSocket client |
| `src/render/` | SquidNode, Tentacle, Scene |
| `.gsd/extensions/squid-snapshot-writer/` | GSD extension (WebSocket client) |

## Tech Stack

- Node.js 18+ • Vite • WebSocket (ws) • Native Canvas 2D