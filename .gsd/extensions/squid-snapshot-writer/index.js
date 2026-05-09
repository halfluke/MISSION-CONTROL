/**
 * Squid-Map Real-Time Writer — GSD extension.
 *
 * Connects to squid-viz WebSocket server and pushes data directly.
 * Falls back to file writes if WebSocket unavailable.
 *
 * @param {ExtensionAPI} pi - The GSD extension API instance.
 * @returns {void}
 */

import { writeFileSync, renameSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { WebSocket } from 'ws'

const projectRoot = process.cwd()

const WS_URL = 'ws://127.0.0.1:5178'
const SNAP_DIR = join(projectRoot, '.gsd', 'squid-state')
const SNAP_FILE = join(SNAP_DIR, 'snapshot.json')
const SNAP_TMP = join(SNAP_DIR, 'snapshot.json.tmp')

let ws = null
let reconnectTimeout = null
let useWs = true // true = WS mode, false = file mode

async function takeSnapshot() {
  try {
    const homeDir = homedir()
    const vdataPath = join(homeDir, '.gsd', 'agent', 'extensions', 'gsd', 'visualizer-data.js')
    const { isDbAvailable, openDatabase } = await import(`file://${join(dirname(vdataPath), 'gsd-db.js')}`)
    if (!isDbAvailable()) {
      try { openDatabase(join(projectRoot, '.gsd', 'gsd.db')) } catch { /* fall back to file-based */ }
    }
    const { loadVisualizerData } = await import(`file://${vdataPath}`)

    const data = await loadVisualizerData(projectRoot)

    const payload = {
      version: 1,
      ...data
    }

    const json = JSON.stringify(payload, null, 2)

    // Send via WebSocket if connected
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(json)
      return true
    }

    // Fallback: write to disk
    return writeSnapshotToDisk(json)
  } catch (err) {
    console.warn('[squid-snapshot-writer] snapshot failed:', err.message)
    return false
  }
}

function writeSnapshotToDisk(json) {
  try {
    mkdirSync(SNAP_DIR, { recursive: true })
    writeFileSync(SNAP_TMP, json, 'utf8')
    renameSync(SNAP_TMP, SNAP_FILE)
    return true
  } catch (err) {
    console.warn('[squid-snapshot-writer] disk write failed:', err.message)
    return false
  }
}

function connectWebSocket() {
  if (ws) {
    ws.close()
  }

  try {
    ws = new WebSocket(WS_URL)

    ws.on('open', () => {
      useWs = true
      console.log('[squid-snapshot-writer] connected to squid-viz')
      takeSnapshot() // Send initial data
    })

    ws.on('close', () => {
      useWs = false
      console.log('[squid-snapshot-writer] disconnected from squid-viz')
      scheduleReconnect()
    })

    ws.on('error', (err) => {
      useWs = false
      console.log('[squid-snapshot-writer] WebSocket error:', err.message)
    })
  } catch (err) {
    console.log('[squid-snapshot-writer] could not connect to squid-viz, using file mode')
    useWs = false
    scheduleReconnect()
  }
}

let reconnectDelay = 1000
const MAX_RECONNECT_DELAY = 8000

function scheduleReconnect() {
  if (reconnectTimeout) clearTimeout(reconnectTimeout)
  reconnectTimeout = setTimeout(() => {
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY)
    console.log(`[squid-snapshot-writer] reconnecting in ${reconnectDelay}ms`)
    connectWebSocket()
  }, reconnectDelay)
}

export default function squidSnapshotWriter(pi) {
  console.log('[squid-snapshot-writer] extension loaded')

  // Try WebSocket first
  connectWebSocket()

  // Also write snapshots periodically (for WS to send, or fallback disk)
  setInterval(() => {
    takeSnapshot()
  }, 5000) // Send every 5 seconds (not 30s - more real-time)
}