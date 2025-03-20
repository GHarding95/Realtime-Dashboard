import http from 'http';
import { WebSocketServer } from 'ws';
import axios from 'axios';
import WebSocket from 'ws';

const server = http.createServer();
const wsServer = new WebSocketServer({ server });
const port = 8000;

// Keep track of active connections
const activeConnections = new Map();

// Heartbeat interval (30 seconds)
const HEARTBEAT_INTERVAL = 30000;

// Log all incoming requests
server.on('request', (req, res) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
});

// Handle HTTP requests
server.on('request', async (req, res) => {
  console.log(`[${new Date().toISOString()}] Processing request: ${req.method} ${req.url}`);
  
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS request');
    res.writeHead(200);
    res.end();
    return;
  }

  try {
    if (req.url === '/api/sessions') {
      console.log('[Sessions] Fetching sessions from TSL API...');
      const response = await axios.get('http://dev-sample-api.tsl-timing.com/sessions', {
        timeout: 15000,
        headers: {
          'Accept': 'application/json'
        }
      });
      console.log('[Sessions] Successfully fetched sessions:', JSON.stringify(response.data, null, 2));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response.data));
    } else if (req.url.startsWith('/api/sessions/')) {
      const urlParts = req.url.split('/');
      const sessionId = urlParts[3];
      const isResultsEndpoint = urlParts[4] === 'results';
      
      console.log(`[Session ${sessionId}] Processing request for session${isResultsEndpoint ? ' results' : ''}`);
      
      if (isResultsEndpoint) {
        console.log(`[Session ${sessionId}] Fetching results from TSL API...`);
        const response = await axios.get(`http://dev-sample-api.tsl-timing.com/sessions/${sessionId}/results`, {
          timeout: 15000,
          headers: {
            'Accept': 'application/json'
          }
        });
        console.log(`[Session ${sessionId}] Successfully fetched results`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response.data));
      } else {
        console.log(`[Session ${sessionId}] Fetching session data from TSL API...`);
        const response = await axios.get(`http://dev-sample-api.tsl-timing.com/sessions/${sessionId}`, {
          timeout: 15000,
          headers: {
            'Accept': 'application/json'
          }
        });
        console.log(`[Session ${sessionId}] Successfully fetched session data`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response.data));
      }
    } else {
      console.log(`[404] Not Found: ${req.url}`);
      res.writeHead(404);
      res.end('Not Found');
    }
  } catch (error) {
    console.error(`[Error] ${req.method} ${req.url}:`, {
      message: error.message,
      code: error.code,
      response: error.response?.data,
      status: error.response?.status
    });

    if (error.code === 'ECONNABORTED') {
      console.error('[Timeout] Request timed out');
      res.writeHead(504, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Gateway Timeout' }));
    } else if (error.response) {
      console.error('[API Error] Response from TSL API:', error.response.status, error.response.data);
      res.writeHead(error.response.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(error.response.data));
    } else if (error.request) {
      console.error('[Network Error] No response received from TSL API');
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Service Unavailable' }));
    } else {
      console.error('[Server Error] Internal error:', error.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal Server Error' }));
    }
  }
});

// Handle WebSocket connections
wsServer.on('connection', (ws, req) => {
  console.log(`[WebSocket] New client connection attempt from ${req.socket.remoteAddress}`);
  console.log(`[WebSocket] Request URL: ${req.url}`);
  
  // Extract session ID from URL
  const sessionId = req.url.split('/').pop();
  if (!sessionId) {
    console.error('[WebSocket] No session ID provided in URL');
    ws.send(JSON.stringify({ type: 'error', message: 'No session ID provided' }));
    ws.close();
    return;
  }
  
  console.log(`[WebSocket] Client connected for session: ${sessionId}`);
  
  // Store connection info
  const connectionInfo = {
    ws,
    sessionId,
    tslWs: null,
    heartbeatInterval: null,
    lastPing: Date.now(),
    reconnectAttempts: 0,
    maxReconnectAttempts: 5
  };
  
  activeConnections.set(ws, connectionInfo);
  
  // Set up heartbeat
  connectionInfo.heartbeatInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ping' }));
      connectionInfo.lastPing = Date.now();
    }
  }, HEARTBEAT_INTERVAL);
  
  // Connect to the TSL timing WebSocket
  const tslWsUrl = `ws://dev-sample-api.tsl-timing.com/sessions/${sessionId}`;
  console.log(`[WebSocket] Attempting to connect to TSL WebSocket: ${tslWsUrl}`);
  
  const tslWs = new WebSocket(tslWsUrl);
  connectionInfo.tslWs = tslWs;
  
  tslWs.on('open', () => {
    console.log(`[WebSocket] Successfully connected to TSL timing WebSocket for session: ${sessionId}`);
    console.log(`[WebSocket] TSL WebSocket readyState: ${tslWs.readyState}`);
    connectionInfo.reconnectAttempts = 0;
    ws.send(JSON.stringify({ 
      type: 'connection', 
      status: 'connected',
      sessionId: sessionId,
      timestamp: new Date().toISOString()
    }));
  });
  
  tslWs.on('message', (data) => {
    try {
      const message = data.toString();
      console.log(`[WebSocket] Received data from TSL for session ${sessionId}:`, message);
      
      // Log message type and size
      console.log(`[WebSocket] Message size: ${message.length} bytes`);
      
      // Forward the message to the client
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
        console.log(`[WebSocket] Forwarded message to client for session ${sessionId}`);
      }
    } catch (error) {
      console.error(`[WebSocket] Error handling TSL message for session ${sessionId}:`, error);
      console.error(`[WebSocket] Error details:`, {
        message: error.message,
        stack: error.stack,
        data: data.toString()
      });
      ws.send(JSON.stringify({ 
        type: 'error', 
        message: 'Error processing timing data',
        timestamp: new Date().toISOString()
      }));
    }
  });
  
  tslWs.on('error', (error) => {
    console.error(`[WebSocket] TSL WebSocket error for session ${sessionId}:`, error);
    console.error(`[WebSocket] Error details:`, {
      message: error.message,
      code: error.code,
      type: error.type
    });
    
    // Attempt to reconnect to TSL if we haven't exceeded max attempts
    if (connectionInfo.reconnectAttempts < connectionInfo.maxReconnectAttempts) {
      connectionInfo.reconnectAttempts++;
      console.log(`[WebSocket] Attempting to reconnect to TSL (attempt ${connectionInfo.reconnectAttempts}/${connectionInfo.maxReconnectAttempts})...`);
      
      // Exponential backoff for reconnect delay
      const reconnectDelay = Math.min(1000 * Math.pow(2, connectionInfo.reconnectAttempts - 1), 30000);
      setTimeout(() => {
        if (connectionInfo.tslWs) {
          connectionInfo.tslWs.close();
        }
        connectionInfo.tslWs = new WebSocket(tslWsUrl);
        setupTslWebSocketHandlers(connectionInfo);
      }, reconnectDelay);
    } else {
      ws.send(JSON.stringify({ 
        type: 'error', 
        message: 'Lost connection to timing service',
        error: error.message,
        timestamp: new Date().toISOString()
      }));
      ws.close();
    }
  });
  
  tslWs.on('close', (code, reason) => {
    console.log(`[WebSocket] TSL WebSocket closed for session ${sessionId}:`, {
      code: code,
      reason: reason.toString(),
      timestamp: new Date().toISOString()
    });
    
    // Only close client connection if we've exceeded max reconnection attempts
    if (connectionInfo.reconnectAttempts >= connectionInfo.maxReconnectAttempts) {
      ws.send(JSON.stringify({ 
        type: 'connection', 
        status: 'disconnected',
        code: code,
        reason: reason.toString(),
        timestamp: new Date().toISOString()
      }));
      ws.close();
    }
  });
  
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log(`[WebSocket] Received message from client for session ${sessionId}:`, message);
      
      // Handle pong messages
      if (message.type === 'pong') {
        connectionInfo.lastPing = Date.now();
      }
    } catch (error) {
      console.error(`[WebSocket] Error processing client message:`, error);
    }
  });
  
  ws.on('error', (error) => {
    console.error(`[WebSocket] Client WebSocket error for session ${sessionId}:`, error);
    console.error(`[WebSocket] Error details:`, {
      message: error.message,
      code: error.code,
      type: error.type
    });
    if (connectionInfo.tslWs && connectionInfo.tslWs.readyState === WebSocket.OPEN) {
      connectionInfo.tslWs.close();
    }
  });
  
  ws.on('close', (code, reason) => {
    console.log(`[WebSocket] Client disconnected for session ${sessionId}:`, {
      code: code,
      reason: reason.toString(),
      timestamp: new Date().toISOString()
    });
    
    // Clean up connection resources
    if (connectionInfo.heartbeatInterval) {
      clearInterval(connectionInfo.heartbeatInterval);
    }
    if (connectionInfo.tslWs && connectionInfo.tslWs.readyState === WebSocket.OPEN) {
      connectionInfo.tslWs.close();
    }
    activeConnections.delete(ws);
  });
});

// Helper function to set up TSL WebSocket handlers
function setupTslWebSocketHandlers(connectionInfo) {
  const { tslWs, sessionId, ws } = connectionInfo;
  
  tslWs.on('open', () => {
    console.log(`[WebSocket] Successfully reconnected to TSL timing WebSocket for session: ${sessionId}`);
    connectionInfo.reconnectAttempts = 0;
    ws.send(JSON.stringify({ 
      type: 'connection', 
      status: 'connected',
      sessionId: sessionId,
      timestamp: new Date().toISOString()
    }));
  });
  
  tslWs.on('message', (data) => {
    try {
      const message = data.toString();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    } catch (error) {
      console.error(`[WebSocket] Error handling TSL message during reconnection:`, error);
    }
  });
  
  tslWs.on('error', (error) => {
    console.error(`[WebSocket] TSL WebSocket error during reconnection:`, error);
  });
  
  tslWs.on('close', (code, reason) => {
    console.log(`[WebSocket] TSL WebSocket closed during reconnection:`, { code, reason: reason.toString() });
  });
}

// Error handling for the server
server.on('error', (error) => {
  console.error('[Server Error]', error);
});

server.listen(port, () => {
  console.log(`[Server] Running on port ${port}`);
  console.log(`[Server] HTTP endpoints available at:`);
  console.log(`  - http://localhost:${port}/api/sessions`);
  console.log(`  - http://localhost:${port}/api/sessions/:id`);
  console.log(`  - http://localhost:${port}/api/sessions/:id/results`);
  console.log(`[Server] WebSocket endpoint available at:`);
  console.log(`  - ws://localhost:${port}/ws/sessions/:id`);
}); 