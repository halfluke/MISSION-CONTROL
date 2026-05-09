/**
 * Squid-Map Real-Time Writer — GSD extension.
 *
 * Connects to squid-viz WebSocket server and pushes data directly.
 * WS-only — no disk fallback.
 *
 * @param {ExtensionAPI} pi - The GSD extension API instance.
 * @returns {void}
 */

import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { WebSocket } from 'ws'

const projectRoot = process.cwd()
const WS_URL = 'ws://127.0.0.1:5178?project=' + encodeURIComponent(projectRoot)

let ws = null
let reconnectTimeout = null
let reconnectDelay = 1000
const MAX_RECONNECT_DELAY = 8000

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

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(json)
    }
  } catch (err) {
    console.warn('[squid-snapshot-writer] snapshot failed:', err.message)
  }
}

function connectWebSocket() {
  if (ws) {
    try { ws.close() } catch {}
  }

  try {
    ws = new WebSocket(WS_URL)

    let hasConnected = false

    ws.on('open', () => {
      reconnectDelay = 1000
      hasConnected = true
      // Send data immediately on (re)connect — critical for race with browser
      takeSnapshot()
    })

    ws.on('message', (msg) => {
      // squid-viz sends 'browser-connected' when a new browser client arrives.
      // This is our signal to push a fresh snapshot so the browser doesn't wait.
      const text = msg.toString().trim()
      if (text === 'browser-connected') {
        takeSnapshot()
      }
    })

    ws.on('close', () => {
      hasConnected = false
      scheduleReconnect()
    })

    ws.on('error', () => {
      // error fires before close — cleanup handled in close handler
    })
  } catch (err) {
    scheduleReconnect()
  }
}

function scheduleReconnect() {
  if (reconnectTimeout) clearTimeout(reconnectTimeout)
  reconnectTimeout = setTimeout(() => {
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY)
    connectWebSocket()
  }, reconnectDelay)
}

export default function squidSnapshotWriter(pi) {
  console.log('[squid-snapshot-writer] extension loaded')

  connectWebSocket()

  setInterval(() => {
    takeSnapshot()
  }, 5000) // Push every 5 seconds
}
