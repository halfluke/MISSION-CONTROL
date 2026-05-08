# squid-viz

A visualizer for GSD (Get Shit Done) projects — renders your milestones, slices, and tasks as an organic squid visualization on an HTML5 Canvas.

## Architecture

- **Frontend**: Native Canvas 2D API with custom bezier tentacle animations, no external rendering libraries
- **Data Bridge**: Periodic snapshot writes to `.gsd/squid-state/snapshot.json` via GSD extension
- **Visualizer**: Global npm CLI (`squid-viz`) that serves the UI and proxies snapshot data

## Quick Start

### Prerequisites

1. **Build and install squid-viz** (once):
   ```bash
   # Clone this repository
   git clone <this-repo>
   cd <repo-folder>

   # Install dependencies
   npm install

   # Build the visualizer
   npm run build

   # Link globally so you can run `squid-viz` from any folder
   npm link
   ```

2. **Copy the extension** to your global GSD extensions folder (or to each project's `.gsd/extensions/`):
   ```bash
   cp -r .gsd/extensions/squid-snapshot-writer ~/.gsd/extensions/
   ```

3. **Shell alias** — for GSD with snapshot extension
   Add to `~/.zshrc`:
   ```bash
   alias gsd-squid='gsd --extension ~/.gsd/extensions/squid-snapshot-writer/index.js'
   ```

4. **Reload shell**
   ```bash
   source ~/.zshrc
   ```

### Running

In your GSD project directory:

```bash
# Terminal 1: GSD with live snapshot writer
gsd-squid

# Terminal 2: Visualizer (auto-opens browser)
squid-viz
```

The visualizer runs at **http://127.0.0.1:5177** by default.

### Using a Different Port

```bash
squid-viz --port 5178
```

## Files

| Path | Description |
|------|-------------|
| `index.html` | Entry point |
| `src/main.js` | Canvas setup and render loop |
| `src/render/` | SquidNode, Tentacle, Scene rendering |
| `src/data/` | Snapshot adapter and file watcher |
| `.gsd/extensions/squid-snapshot-writer/` | GSD extension that writes snapshots |

## How It Works

1. **GSD extension** (`squid-snapshot-writer`) hooks into `session_start` and writes a JSON snapshot every 30 seconds using GSD's built-in `loadVisualizerData()` function
2. **Snapshot file** at `.gsd/squid-state/snapshot.json` contains milestones, slices, and tasks
3. **Squid-viz** serves the frontend and proxies the JSON file, auto-discovering it based on current working directory until the file stabilizes

## Development

```bash
# Development server with HMR
npm run dev
```

Then open http://localhost:5177 (or port from vite.config.js)

## Tech Stack

- **Runtime**: Node.js 18+
- **Build**: Vite
- **UI**: Native HTML5 Canvas (no Pixi, D3, or Three.js)
- **Shell**: zsh with custom aliases

## License

MIT