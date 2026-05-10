# squid-viz

A visualizer for GSD (Get Shit Done) projects — renders your milestones, slices, and tasks as an organic squid visualization on an HTML5 Canvas.

![Squid-Map demo](docs/squid-viz-demo.gif)

## Setup

```bash
git clone <this-repo>
cd MISSION-CONTROL
npm run build
npm install -g .
```

`npm install -g .` handles dependencies and installs the CLI globally — no separate install needed.

## Use on a GSD project

Copy the extension into a project (one-time per project):

```bash
cp -r .gsd/extensions/squid-snapshot-writer /path/to/project/.gsd/extensions/
```

Run it:

```bash
cd /path/to/project
squid-viz
```

Or from anywhere:

```bash
squid-viz --gsd-dir /path/to/project
```

> ⚠️ `squid-viz` looks for `.gsd/` in your current directory (or the `--gsd-dir` path).

## Preview a project without GSD running

`squid-preview` loads a snapshot directly from the project's `.gsd/` database and opens it in the browser — no GSD process needed. Useful for inspecting a project's current state at any time.

```bash
# preview a specific project
squid-preview /path/to/project

# preview the current directory
cd /path/to/project
squid-preview
```

Close the browser tab when done — squid-viz shuts down automatically.

## CLI Options

```bash
squid-viz           # Default (ports 5177/5178, auto-opens browser)
squid-viz --port 3000 --ws-port 3001  # Custom ports
squid-viz --no-open  # Don't auto-open browser
squid-viz --gsd-dir /path/to/project  # Specify project from anywhere
```

## How It Works

- **WebSocket** on port 5178: GSD extension pushes data every 5 seconds
- **HTTP** on port 5177: Serves the Canvas UI

### Connection Indicator (bottom-right corner)
- 🟢 **Green**: WebSocket connected, real-time updates
- 🟡 **Yellow**: Connecting to GSD extension
- 🔴 **Red**: Disconnected

## Architecture

- **Frontend**: Native Canvas 2D API (no Pixi/D3/Three.js)
- **Data**: WebSocket streaming — GSD extension pushes directly
- **CLI**: Global `squid-viz` serves UI + WebSocket server

## Files

| Path | Purpose |
|------|---------|
| `bin/squid-viz` | CLI — WebSocket server + HTTP static server |
| `bin/squid-preview` | CLI — preview any project without GSD running |
| `vite.config.js` | Dev server + WebSocket plugin |
| `src/main.js` | Canvas + WebSocket client |
| `src/render/` | SquidNode, Tentacle, Scene |
| `.gsd/extensions/squid-snapshot-writer/` | GSD extension (WebSocket client) |

## Tech Stack

- Node.js 18+ • Vite • WebSocket (ws) • Native Canvas 2D
