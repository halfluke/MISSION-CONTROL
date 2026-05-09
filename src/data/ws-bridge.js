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

  function connect() {
    if (destroyed) return;
    try {
      ws = new WebSocket(url);

      ws.onopen = () => {
        reconnectDelay = 1000;
        reconnectAttempts = 0;
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
        console.log('[ws-bridge] disconnected');
        if (onDisconnect) onDisconnect();
        scheduleReconnect();
      };

      ws.onerror = (err) => {
        console.warn('[ws-bridge] error:', err.message);
      };
    } catch (err) {
      console.warn('[ws-bridge] connection failed:', err.message);
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    if (destroyed) return;
    reconnectAttempts++;
    console.log(`[ws-bridge] reconnecting in ${reconnectDelay}ms (attempt ${reconnectAttempts})`);
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