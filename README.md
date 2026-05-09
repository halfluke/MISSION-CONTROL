# squid-viz

A visualizer for GSD (Get Shit Done) projects — renders your milestones, slices, and tasks as an organic squid visualization on an HTML5 Canvas.

![Squid-Map demo](docs/squid-viz-demo.gif)

## Usage

Install globally:

```bash
npm install -g squid-viz
```

Copy the extension into a GSD project (one-time per project):

```bash
cp -r .gsd/extensions/squid-snapshot-writer /path/to/project/.gsd/extensions/
```

Run it from the project:

```bash
cd /path/to/project
squid-viz
```

Or from anywhere with `--gsd-dir`:

```bash
squid-viz --gsd-dir /path/to/project
```

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
- **Fallback**: If no WebSocket server, extension writes to disk and browser polls (slower)

### Connection Indicator (bottom-right corner)
- 🟢 **Green**: WebSocket connected, real-time updates
- 🟡 **Yellow**: Polling fallback (squid-viz not running)
- 🔴 **Red**: Disconnected entirely

## Architecture

- **Frontend**: Native Canvas 2D API (no Pixi/D3/Three.js)
- **Data**: WebSocket streaming — GSD extension pushes directly
- **CLI**: Global `squid-viz` serves UI + WebSocket server

## Development

```bash
git clone <this-repo>
cd squid-viz
npm install
npm run dev    # HMR dev server
npm run build  # Production static files
```

To publish updates:

```bash
npm publish
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