/**
 * File Watcher — browser-side poller for the snapshot JSON file.
 *
 * Uses fetch() to GET the snapshot from the Vite dev server.
 * The S02 extension writes to .gsd/squid-state/snapshot.json every 2s,
 * so a 2s client-side poll keeps us in sync.
 */

import { parseSnapshotText } from './gds-snapshot-adapter.js';

/** @typedef {import('../render/data-model.js').SceneData} SceneData */

const DEFAULT_POLL_INTERVAL = 2000; // match the extension's write interval

/**
 * Watch a snapshot JSON file (via HTTP fetch) and call onUpdate on changes.
 *
 * @param {string} fileUrl - URL path to the snapshot (e.g. '/.gsd/squid-state/snapshot.json')
 * @param {(data: SceneData) => void} onUpdate - Called with parsed SceneData
 * @param {Object} [opts]
 * @param {number} [opts.interval] - Poll interval in ms (default: 2000)
 * @param {() => void} [opts.onMissing] - Called when fetch returns 404
 * @param {(error: string) => void} [opts.onError] - Called when snapshot parses to null (corrupt data)
 * @returns {{ destroy: () => void, forceCheck: () => void }}
 */
export function watchSnapshotFile(fileUrl, onUpdate, opts = {}) {
  const interval = opts.interval || DEFAULT_POLL_INTERVAL;
  const onMissing = opts.onMissing || (() => {});
  const onError = opts.onError || (() => {});
  let destroyed = false;
  let lastData = null;
  let timerId = null;

  async function check() {
    if (destroyed) return;

    try {
      const res = await fetch(fileUrl);

      if (res.status === 404) {
        onMissing();
        return;
      }

      if (!res.ok) {
        console.warn('[file-watcher] HTTP', res.status, 'for', fileUrl);
        return;
      }

      const raw = await res.text();
      if (!raw || raw === lastData) return; // unchanged

      lastData = raw;
      const sceneData = parseSnapshotText(raw);
      if (sceneData) {
        onUpdate(sceneData);
      } else {
        onError('Snapshot parse failed — corrupt or malformed data');
      }
    } catch (err) {
      // Network error — silent (could be offline during dev)
      console.warn('[file-watcher] Fetch failed:', err.message);
    }
  }

  timerId = setInterval(check, interval);
  check(); // immediate first check

  return {
    destroy() {
      destroyed = true;
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
      }
    },
    forceCheck() {
      check();
    },
  };
}
