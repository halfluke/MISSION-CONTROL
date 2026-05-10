import { defineConfig } from 'vite';
import { resolve } from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';

// Custom plugin to add WebSocket server to Vite dev
function webSocketServer() {
  let wss = null;
  let browserClients = new Set();
  let latestSnapshot = null;
  let extensionClients = new Set();

  return {
    name: 'squid-viz-ws',
    configureServer(server) {
      // Create separate WebSocket server on port 5178 (like CLI)
      wss = new WebSocketServer({ host: '127.0.0.1', port: 5178 });

      // Heartbeat — mirrors production squid-viz behaviour
      const HEARTBEAT_INTERVAL = 30_000;
      const heartbeat = setInterval(() => {
        wss.clients.forEach((ws) => {
          if (!ws.isAlive) { ws.terminate(); return; }
          ws.isAlive = false;
          ws.ping();
        });
      }, HEARTBEAT_INTERVAL);

      wss.on('connection', (ws, req) => {
        // Match production: ?client=browser identifies browser clients
        const url = new URL(req.url, 'http://localhost');
        const isBrowser = url.searchParams.get('client') === 'browser';

        ws.isAlive = true;
        ws.on('pong', () => { ws.isAlive = true; });

        if (isBrowser) {
          browserClients.add(ws);
          console.log('[dev-ws] browser connected');

          // Send latest snapshot if available
          if (latestSnapshot) ws.send(latestSnapshot);

          // Signal extensions to push fresh data immediately
          extensionClients.forEach(ext => {
            if (ext.readyState === WebSocket.OPEN) ext.send('browser-connected');
          });

          ws.on('close', () => {
            browserClients.delete(ws);
            console.log('[dev-ws] browser disconnected');
          });
        } else {
          // Extension client
          extensionClients.add(ws);
          console.log('[dev-ws] extension connected');

          // If browsers already waiting, ask for an immediate push
          if (browserClients.size > 0 && !latestSnapshot) ws.send('browser-connected');

          ws.on('message', (msg) => {
            try {
              const data = msg.toString();
              JSON.parse(data); // Validate
              latestSnapshot = data;
              browserClients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) client.send(data);
              });
            } catch (e) {}
          });

          ws.on('close', () => {
            extensionClients.delete(ws);
            console.log('[dev-ws] extension disconnected');
          });
        }

        ws.on('error', () => {});
      });

      wss.on('close', () => clearInterval(heartbeat));

      console.log('[dev-ws] WebSocket server running at ws://127.0.0.1:5178');
    },
    closeBundle() {
      if (wss) wss.close();
    }
  };
}

export default defineConfig({
  root: '.',
  plugins: [webSocketServer()],
  server: {
    port: 5177,
    strictPort: true,
    host: '127.0.0.1',
    fs: {
      allow: ['.', resolve('.gsd')],
    },
  },
  build: {
    outDir: 'dist',
  },
});