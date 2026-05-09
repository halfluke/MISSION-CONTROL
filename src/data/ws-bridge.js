/**
 * WebSocket Bridge — client-side real-time transport for snapshot updates.
 *
 * Replaces polling with WebSocket push. Falls back to polling on disconnect.
 * Handles reconnection with exponential backoff.
 */

import { parseSnapshotText } from './gds-snapshot-adapter.js';

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
          onUpdate(sceneData);
        } else {
          console.warn('[ws-bridge] Parse failed for ws message');
        }
      };

      ws.onclose = () => {
        if (hasConnected) {
          console.log('[ws-bridge] disconnected');
          hasConnected = false; // only log disconnect once per connection cycle
        }
        if (onDisconnect) onDisconnect();
        scheduleReconnect();
      };

      ws.onerror = () => {
        // error event fires before close — don't log separately,
        // the connection failure will be caught by onclose/onerror below.
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

  connect();

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