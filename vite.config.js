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

      wss.on('connection', (ws, req) => {
        // Browser client (connects without the extension path)
        if (!req.url.includes('extension')) {
          browserClients.add(ws);
          console.log('[dev-ws] browser connected');
          
          // Send latest snapshot if available
          if (latestSnapshot) {
            ws.send(latestSnapshot);
          }
          
          ws.on('close', () => {
            browserClients.delete(ws);
            console.log('[dev-ws] browser disconnected');
          });
        } else {
          // Extension client
          extensionClients.add(ws);
          console.log('[dev-ws] extension connected');
          
          ws.on('message', (msg) => {
            try {
              const data = msg.toString();
              JSON.parse(data); // Validate
              latestSnapshot = data;
              // Broadcast to browsers
              browserClients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                  client.send(data);
                }
              });
            } catch (e) {}
          });
          
          ws.on('close', () => {
            extensionClients.delete(ws);
            console.log('[dev-ws] extension disconnected');
          });
        }
      });

      console.log('[dev-ws] WebSocket server running at ws://127.0.0.1:5178');
    },
    closeBundle() {
      if (wss) {
        wss.close();
      }
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