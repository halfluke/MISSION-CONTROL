/**
 * WebSocket Bridge — client-side real-time transport for snapshot updates.
 *
 * Two-layer fix:
 * 1. Initial delay before first connect so the extension is ready first.
 * 2. Robust reconnection with forced re-render on reconnection.
 */

import { parseSnapshotText } from './gds-snapshot-adapter.js';

const INITIAL_CONNECT_DELAY = 500; // 0.5s — extension sends on 'browser-connected' signal

/**
 * Create a WebSocket bridge that receives real-time snapshot updates.
 *
 * @param {string} url - WebSocket URL (e.g., 'ws://127.0.0.1:5178')
 * @param {(data: import('../render/data-model.js').SceneData) => void} onUpdate - Called with parsed SceneData
 * @param {() => void} [onDisconnect] - Called when WebSocket disconnects
 * @returns {{ destroy: () => void, isConnected: () => boolean }}
 */
export function createWsBridge(url, onUpdate, onDisconnect) {
  let ws = null;
  let reconnectDelay = 1000;
  const MAX_DELAY = 8000;
  let reconnectAttempts = 0;
  let destroyed = false;
  let hasConnected = false;
  let hasRendered = false; // track if we ever rendered live data
  let lastRenderedVersion = 0; // track latest snapshot version to detect fresh data

  function connect() {
    if (destroyed) return;
    try {
      ws = new WebSocket(url);

      ws.onopen = () => {
        reconnectDelay = 1000;
        reconnectAttempts = 0;
        hasConnected = true;
        console.log('[ws-bridge] connected');
      };

      ws.onmessage = (event) => {
        const sceneData = parseSnapshotText(event.data);
        if (sceneData) {
          // Track version to detect new data (_version is set by the adapter)
          if (sceneData._version > lastRenderedVersion) {
            lastRenderedVersion = sceneData._version;
          }
          // Always call onUpdate to force re-render with latest data
          onUpdate(sceneData);
          if (!hasRendered) {
            hasRendered = true;
            console.log('[ws-bridge] first live data received');
          }
        } else {
          console.warn('[ws-bridge] Parse failed for ws message');
        }
      };

      ws.onclose = (event) => {
        if (hasConnected) {
          console.log(`[ws-bridge] disconnected (code: ${event.code})`);
          hasConnected = false;
        }
        if (onDisconnect) onDisconnect();
        scheduleReconnect();
      };

      ws.onerror = () => {
        // error fires before close — don't log separately;
        // the failure is caught by onclose below.
      };
    } catch (err) {
      console.error('[ws-bridge] connection failed:', err.message);
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    if (destroyed) return;
    reconnectAttempts++;
    // Only log on first attempt or when reaching max delay —
    // suppress the mid-range retries to avoid log spam.
    if (reconnectAttempts === 1 || reconnectDelay >= MAX_DELAY) {
      if (hasConnected) {
        console.warn(`[ws-bridge] server unavailable, reconnecting in ${reconnectDelay}ms (attempt ${reconnectAttempts})`);
      } else {
        console.warn(`[ws-bridge] squid-viz not running, will retry in ${reconnectDelay}ms`);
      }
    }
    setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_DELAY);
      connect();
    }, reconnectDelay);
  }

  // Initial delay: wait for the extension to be ready before connecting
  setTimeout(() => {
    if (!destroyed) {
      console.log('[ws-bridge] starting connection...');
      connect();
    }
  }, INITIAL_CONNECT_DELAY);

  return {
    destroy() {
      destroyed = true;
      if (ws) ws.close();
    },
    isConnected() {
      return ws && ws.readyState === WebSocket.OPEN;
    }
  };
}