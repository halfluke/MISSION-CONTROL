/**
 * Squid-Map Snapshot Writer — GSD extension.
 *
 * Periodically serializes GSD visualizer state to
 * `.gsd/squid-state/snapshot.json` atomically.
 *
 * @param {ExtensionAPI} pi - The GSD extension API instance.
 * @returns {void}
 */

import { writeFileSync, renameSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'

const projectRoot = process.cwd()

const SNAP_DIR = join(projectRoot, '.gsd', 'squid-state')
const SNAP_FILE = join(SNAP_DIR, 'snapshot.json')
const SNAP_TMP = join(SNAP_DIR, 'snapshot.json.tmp')

let _firstWriteOk = true

async function takeSnapshot () {
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

    mkdirSync(SNAP_DIR, { recursive: true })

    const json = JSON.stringify(payload, null, 2)
    writeFileSync(SNAP_TMP, json, 'utf8')
    renameSync(SNAP_TMP, SNAP_FILE)

    if (_firstWriteOk) {
      console.info('[squid-snapshot-writer] snapshot written')
      _firstWriteOk = false
    }
    return true
  } catch (err) {
    console.warn('[squid-snapshot-writer] snapshot failed:', err.message)
    return false
  }
}

export default function squidSnapshotWriter (pi) {
  console.log('[squid-snapshot-writer] extension loaded')

  takeSnapshot()

  setInterval(() => {
    takeSnapshot()
  }, 30000)
}