import http from 'http';
import { WebSocketServer } from 'ws';
import WebSocket from 'ws';

const server = http.createServer();
const wsServer = new WebSocketServer({ server });

// Make port configurable with a fallback
const port = process.env.PORT || 8000;

// Keep track of active connections
const activeConnections = new Map();

// Heartbeat interval (30 seconds)
const HEARTBEAT_INTERVAL = 30000;

// Mock data store
const mockSessions = [
  {
    id: '1',
    name: 'Qualifying - Round 1',
    series: 'Formula 1',
    status: 'Running',
    date: '2024-02-20',
    description: 'First qualifying session',
    type: 'Qualifying',
    startTime: new Date(Date.now()).toISOString(),
    endTime: new Date(Date.now() + 3600000).toISOString(),
    duration: '01:00:00',
    state: 'Running',
    location: 'Silverstone',
    track: 'Silverstone Circuit',
    competitors: [
      { id: '1', name: 'Lewis Hamilton', number: '44', team: 'Mercedes' },
      { id: '2', name: 'Max Verstappen', number: '1', team: 'Red Bull Racing' },
      { id: '3', name: 'Charles Leclerc', number: '16', team: 'Ferrari' }
    ],
    results: []
  },
  {
    id: '2',
    name: 'Race',
    series: 'Formula 1',
    status: 'Scheduled',
    date: '2024-02-21',
    description: 'Main race',
    type: 'Race',
    startTime: new Date(Date.now() + 86400000).toISOString(),
    endTime: new Date(Date.now() + 86400000 + 7200000).toISOString(),
    duration: '02:00:00',
    state: 'Scheduled',
    location: 'Silverstone',
    track: 'Silverstone Circuit',
    competitors: [
      { id: '1', name: 'Lewis Hamilton', number: '44', team: 'Mercedes' },
      { id: '2', name: 'Max Verstappen', number: '1', team: 'Red Bull Racing' },
      { id: '3', name: 'Charles Leclerc', number: '16', team: 'Ferrari' }
    ],
    results: []
  }
];

// Mock results data
const mockResults = {
  '1': [
    { position: 1, competitorId: '1', lapTime: '1:25.123', gap: '0.000', lastLap: '1:25.123', bestLap: '1:25.123', sector1: '28.456', sector2: '29.123', sector3: '27.544' },
    { position: 2, competitorId: '2', lapTime: '1:25.456', gap: '0.333', lastLap: '1:25.456', bestLap: '1:25.456', sector1: '28.789', sector2: '29.456', sector3: '27.211' },
    { position: 3, competitorId: '3', lapTime: '1:25.789', gap: '0.666', lastLap: '1:25.789', bestLap: '1:25.789', sector1: '29.123', sector2: '29.789', sector3: '26.877' }
  ],
  '2': []
};

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
      console.log('[Sessions] Fetching sessions from mock API...');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(mockSessions));
    } else if (req.url.startsWith('/api/sessions/')) {
      const urlParts = req.url.split('/');
      const sessionId = urlParts[3];
      const isResultsEndpoint = urlParts[4] === 'results';
      
      console.log(`[Session ${sessionId}] Processing request for session${isResultsEndpoint ? ' results' : ''}`);
      
      if (isResultsEndpoint) {
        console.log(`[Session ${sessionId}] Fetching results from mock API...`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(mockResults[sessionId] || []));
      } else {
        console.log(`[Session ${sessionId}] Fetching session data from mock API...`);
        const session = mockSessions.find(s => s.id === sessionId);
        if (session) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(session));
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Session not found' }));
        }
      }
    } else {
      console.log(`[404] Not Found: ${req.url}`);
      res.writeHead(404);
      res.end('Not Found');
    }
  } catch (error) {
    console.error(`[Error] ${req.method} ${req.url}:`, {
      message: error.message,
      code: error.code
    });
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal Server Error' }));
  }
});

// WebSocket connection handling
wsServer.on('connection', (ws, req) => {
  console.log(`[WebSocket] New connection from ${req.socket.remoteAddress}`);
  
  const sessionId = new URL(req.url, 'ws://localhost').searchParams.get('sessionId');
  if (sessionId) {
    activeConnections.set(sessionId, ws);
    console.log(`[WebSocket] Client subscribed to session ${sessionId}`);
  }

  // Send heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  }, HEARTBEAT_INTERVAL);

  ws.on('close', () => {
    console.log(`[WebSocket] Connection closed for session ${sessionId}`);
    clearInterval(heartbeat);
    if (sessionId) {
      activeConnections.delete(sessionId);
    }
  });

  ws.on('error', (error) => {
    console.error(`[WebSocket] Error for session ${sessionId}:`, error);
  });
});

// Simulate real-time updates
setInterval(() => {
  mockSessions.forEach(session => {
    if (session.state === 'Running') {
      // Update lap times randomly
      mockResults[session.id].forEach(result => {
        const baseTime = 85 + Math.random() * 2; // Base time between 1:25.000 and 1:27.000
        result.lapTime = `${Math.floor(baseTime / 60)}:${(baseTime % 60).toFixed(3)}`;
        result.lastLap = result.lapTime;
        if (!result.bestLap || parseFloat(result.lapTime) < parseFloat(result.bestLap)) {
          result.bestLap = result.lapTime;
        }
      });

      // Sort results by lap time
      mockResults[session.id].sort((a, b) => parseFloat(a.lapTime) - parseFloat(b.lapTime));

      // Update positions and gaps
      mockResults[session.id].forEach((result, index) => {
        result.position = index + 1;
        if (index === 0) {
          result.gap = '0.000';
        } else {
          const gap = parseFloat(result.lapTime) - parseFloat(mockResults[session.id][0].lapTime);
          result.gap = gap.toFixed(3);
        }
      });

      // Broadcast updates to connected clients
      const ws = activeConnections.get(session.id);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'result',
          sessionId: session.id,
          results: mockResults[session.id]
        }));
      }
    }
  });
}, 1000); // Update every second

// Error handling for the server
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`[Server Error] Port ${port} is already in use. Please try a different port by setting the PORT environment variable.`);
    process.exit(1);
  } else {
    console.error('[Server Error]', error);
  }
});

// Start the server with error handling
server.listen(port, () => {
  console.log(`[Server] Running on port ${port}`);
  console.log(`[Server] HTTP endpoints available at:`);
  console.log(`  - http://localhost:${port}/api/sessions`);
  console.log(`  - http://localhost:${port}/api/sessions/:id`);
  console.log(`  - http://localhost:${port}/api/sessions/:id/results`);
  console.log(`[Server] WebSocket endpoint available at:`);
  console.log(`  - ws://localhost:${port}/ws/sessions/:id`);
}); 