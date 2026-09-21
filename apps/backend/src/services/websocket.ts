import { WebSocket } from 'ws';

class WebSocketHub {
  private clients = new Set<WebSocket>();

  registerClient(ws: WebSocket): void {
    this.clients.add(ws);
    console.log(`[WS] Client connected. Total active clients: ${this.clients.size}`);

    ws.on('close', () => {
      this.clients.delete(ws);
      console.log(`[WS] Client disconnected. Remaining clients: ${this.clients.size}`);
    });

    ws.on('error', (err: Error) => {
      console.warn('[WS] Socket error:', err.message);
      this.clients.delete(ws);
    });

    // Send immediate welcome / ack message
    this.send(ws, {
      type: 'CONNECTED',
      payload: { timestamp: new Date().toISOString() }
    });
  }

  broadcast(type: string, payload: any): void {
    const message = JSON.stringify({ type, payload });
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
        } catch (err) {
          console.warn('[WS] Broadcast send failed:', err);
        }
      }
    }
  }

  private send(ws: WebSocket, data: { type: string; payload: any }): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(data));
      } catch (err) {
        console.warn('[WS] Send failed:', err);
      }
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }
}

export const wsHub = new WebSocketHub();
