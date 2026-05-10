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
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFileSync, writeFileSync } from 'node:fs'
import { WebSocket } from 'ws'

const projectRoot = process.cwd()
const WS_URL = 'ws://127.0.0.1:5178?project=' + encodeURIComponent(projectRoot)
const TASK_CACHE_PATH = join(projectRoot, '.gsd', 'squid-viz-task-cache.json')

let ws = null
let reconnectTimeout = null
let reconnectDelay = 1000
const MAX_RECONNECT_DELAY = 8000
const execFileAsync = promisify(execFile)
let snapshotInFlight = false
let hasConnected = false     // ever successfully opened
let warnedNoServer = false   // suppress repeated "not reachable" logs

// In-memory task cache: { "M001/S01": [{ id, title, done, active }] }
// Populated as slices go active, persisted to disk when they complete.
const taskCache = loadTaskCache()

function loadTaskCache() {
  try {
    return JSON.parse(readFileSync(TASK_CACHE_PATH, 'utf-8'))
  } catch {
    return {}
  }
}

function persistTaskCache() {
  try {
    writeFileSync(TASK_CACHE_PATH, JSON.stringify(taskCache, null, 2), 'utf-8')
  } catch (err) {
    console.warn('[squid-snapshot-writer] could not write task cache:', err.message)
  }
}

/**
 * Update the task cache from a fresh snapshot.
 * - If a slice is active and has tasks → store them (overwrite with latest state).
 * - If a slice just became done but its tasks are now empty → the cache already
 *   holds the last seen task list; nothing to update (it was written on previous tick).
 * Persists to disk whenever a slice transitions to done for the first time.
 */
function updateTaskCache(data) {
  let dirty = false
  for (const milestone of data.milestones) {
    if (!milestone.slices) continue
    for (const slice of milestone.slices) {
      const key = `${milestone.id}/${slice.id}`
      if (slice.tasks && slice.tasks.length > 0) {
        // Slice is active — keep the cache fresh
        taskCache[key] = slice.tasks.map(t => ({ id: t.id, title: t.title, done: t.done, active: t.active }))
        dirty = true
      } else if (slice.done && !taskCache[key]) {
        // Slice is done but we never saw its tasks — nothing we can do
      }
    }
  }
  if (dirty) persistTaskCache()
}

/**
 * Get running task unit_ids from unit_dispatches via the sqlite3 CLI.
 * Returns a Set of canonical strings like "M001/S01/T03".
 *
 * GSD stores two task unit types — never the bare string "task":
 *   "execute-task"     → unitId = "M001/S01/T03"   (sequential)
 *   "reactive-execute" → unitId = "M001/S01/reactive+T02,T03"  (batch/parallel)
 *
 * Uses the sqlite3 CLI to avoid contending with GSD's better-sqlite3 handle.
 */
async function getRunningTaskUnitIds(dbPath) {
  try {
    const { stdout } = await execFileAsync('sqlite3', [
      dbPath,
      "SELECT unit_id, unit_type FROM unit_dispatches WHERE status IN ('claimed','running') AND unit_type IN ('execute-task','reactive-execute');"
    ], { timeout: 3000 })

    const ids = new Set()
    for (const line of stdout.trim().split('\n').filter(Boolean)) {
      const pipeIdx = line.indexOf('|')
      const unitId = line.slice(0, pipeIdx)
      const unitType = line.slice(pipeIdx + 1)
      if (unitType === 'reactive-execute') {
        // "M001/S01/reactive+T02,T03" → expand to "M001/S01/T02", "M001/S01/T03"
        const slashIdx = unitId.lastIndexOf('/')
        const prefix = unitId.slice(0, slashIdx)          // "M001/S01"
        const taskPart = unitId.slice(slashIdx + 1).replace(/^reactive\+/, '')
        for (const tid of taskPart.split(',').filter(Boolean)) {
          ids.add(`${prefix}/${tid}`)
        }
      } else {
        ids.add(unitId)
      }
    }
    return ids
  } catch {
    return new Set()
  }
}

/**
 * Patch task "active" field using live unit_dispatches data.
 *
 * loadVisualizerData() sets active: state.activeTask?.id === t.id, but
 * state.activeTask goes null during evaluating-gates, replanning-slice, and
 * other GSD phases even while a task is genuinely claimed/running.  Querying
 * unit_dispatches directly gives us ground truth regardless of phase.
 */
function patchTaskActiveState(data, runningTasks) {
  for (const milestone of data.milestones) {
    if (!milestone.slices) continue
    for (const slice of milestone.slices) {
      if (!slice.tasks) continue
      for (const task of slice.tasks) {
        const unitId = `${milestone.id}/${slice.id}/${task.id}`
        if (runningTasks.has(unitId)) {
          task.active = true
        }
      }
    }
  }
  return data
}

async function takeSnapshot() {
  if (snapshotInFlight) return
  snapshotInFlight = true
  try {
    const homeDir = homedir()
    const vdataPath = join(homeDir, '.gsd', 'agent', 'extensions', 'gsd', 'visualizer-data.js')
    const { isDbAvailable, openDatabase } = await import(`file://${join(dirname(vdataPath), 'gsd-db.js')}`)
    if (!isDbAvailable()) {
      try { openDatabase(join(projectRoot, '.gsd', 'gsd.db')) } catch { /* fall back to file-based */ }
    }
    const { loadVisualizerData } = await import(`file://${vdataPath}`)

    const data = await loadVisualizerData(projectRoot)

    // Patch task running state from unit_dispatches — ground truth regardless
    // of which GSD phase is active (evaluating-gates, replanning, etc.)
    try {
      const dbPath = join(projectRoot, '.gsd', 'gsd.db')
      const runningTasks = await getRunningTaskUnitIds(dbPath)
      patchTaskActiveState(data, runningTasks)
    } catch (err) {
      console.warn('[squid-snapshot-writer] task-active patch failed:', err.message)
    }

    // Update the on-disk task cache so completed tasks survive slice transitions.
    updateTaskCache(data)

    const payload = {
      version: 1,
      ...data
    }

    const json = JSON.stringify(payload, null, 2)

    if (ws && ws.readyState === 1 /* WebSocket.OPEN */) {
      ws.send(json)
    }
  } catch (err) {
    console.warn('[squid-snapshot-writer] snapshot failed:', err.message)
  } finally {
    snapshotInFlight = false
  }
}

function connectWebSocket() {
  if (ws) {
    try { ws.close() } catch {}
  }

  try {
    ws = new WebSocket(WS_URL)

    ws.on('open', () => {
      reconnectDelay = 1000
      if (!hasConnected) {
        console.log('[squid-snapshot-writer] connected to squid-viz')
      } else {
        console.log('[squid-snapshot-writer] reconnected to squid-viz')
      }
      hasConnected = true
      warnedNoServer = false
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
      if (!warnedNoServer) {
        if (hasConnected) {
          console.log('[squid-snapshot-writer] disconnected from squid-viz — retrying in background...')
        } else {
          console.log('[squid-snapshot-writer] squid-viz not reachable — retrying in background...')
        }
        warnedNoServer = true
      }
      scheduleReconnect()
    })

    ws.on('error', (err) => {
      // Log once — close will follow, but terminate() from the server can
      // fire error without a clean close frame so we must handle it here too.
      if (!warnedNoServer) {
        if (hasConnected) {
          console.log('[squid-snapshot-writer] disconnected from squid-viz — retrying in background...')
        } else {
          console.log('[squid-snapshot-writer] squid-viz not reachable — retrying in background...')
        }
        warnedNoServer = true
      }
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
