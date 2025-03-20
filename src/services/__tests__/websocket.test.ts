import { WebSocketService } from '../websocket';
import { WebSocketMessage } from '../../types/websocket';

describe('WebSocketService', () => {
  let service: WebSocketService;
  let ws: any;
  let mockHandler: jest.Mock;
  let mockConnectionHandler: jest.Mock;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Create mock WebSocket
    ws = {
      send: jest.fn(),
      close: jest.fn(),
      readyState: WebSocket.CONNECTING,
      CONNECTING: WebSocket.CONNECTING,
      OPEN: WebSocket.OPEN,
      CLOSING: WebSocket.CLOSING,
      CLOSED: WebSocket.CLOSED,
      onopen: null,
      onclose: null,
      onerror: null,
      onmessage: null
    };

    // Mock global WebSocket
    (global as any).WebSocket = jest.fn(() => ws);

    // Mock window.location
    (global as any).window = {
      location: {
        hostname: 'localhost',
        protocol: 'http:'
      }
    };

    service = new WebSocketService();
    mockHandler = jest.fn();
    mockConnectionHandler = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
    service.disconnect();
  });

  it('subscribes to timing updates and sends subscription message', () => {
    const sessionId = 'test-session';
    const handlerId = service.subscribeToTiming(sessionId, mockHandler);

    // Set WebSocket to OPEN state
    ws.readyState = WebSocket.OPEN;

    // Simulate connection opening
    ws.onopen();

    // Simulate pong message to confirm connection
    ws.onmessage({ data: JSON.stringify({ type: 'pong' }) });

    // Verify subscription message was sent
    expect(global.WebSocket).toHaveBeenCalledWith(expect.stringContaining(sessionId));
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'subscribe', sessionId })
    );
    expect(handlerId).toBeDefined();
  });

  it('handles incoming messages', () => {
    const sessionId = 'test-session';
    const handlerId = service.subscribeToTiming(sessionId, mockHandler);

    // Set WebSocket to OPEN state
    ws.readyState = WebSocket.OPEN;

    // Simulate connection opening
    ws.onopen();

    // Simulate pong message to confirm connection
    ws.onmessage({ data: JSON.stringify({ type: 'pong' }) });

    // Simulate incoming message
    const message: WebSocketMessage = {
      type: 'result',
      sessionId,
      state: 'running'
    };
    ws.onmessage({ data: JSON.stringify(message) });

    expect(mockHandler).toHaveBeenCalledWith(message);
  });

  it('updates connection status', () => {
    const sessionId = 'test-session';
    const connectionHandlerId = service.onConnectionStatus(mockConnectionHandler);
    service.subscribeToTiming(sessionId, mockHandler);

    // Initial status should be sent immediately
    expect(mockConnectionHandler).toHaveBeenCalledWith({
      type: 'connection',
      status: 'disconnected'
    });

    // Set WebSocket to OPEN state
    ws.readyState = WebSocket.OPEN;

    // Simulate connection opening
    ws.onopen();

    // Simulate pong message to confirm connection
    ws.onmessage({ data: JSON.stringify({ type: 'pong' }) });

    expect(mockConnectionHandler).toHaveBeenCalledWith({
      type: 'connection',
      status: 'connected'
    });

    // Simulate connection closing
    ws.onclose();
    expect(mockConnectionHandler).toHaveBeenCalledWith({
      type: 'connection',
      status: 'disconnected'
    });

    expect(connectionHandlerId).toBeDefined();
  });

  it('attempts reconnection on connection failure', () => {
    const sessionId = 'test-session';
    service.subscribeToTiming(sessionId, mockHandler);

    // Set WebSocket to OPEN state
    ws.readyState = WebSocket.OPEN;

    // Simulate connection opening
    ws.onopen();

    // Simulate pong message to confirm connection
    ws.onmessage({ data: JSON.stringify({ type: 'pong' }) });

    // Simulate connection error
    ws.onerror(new Event('error'));

    // Fast-forward timers to trigger reconnection
    jest.advanceTimersByTime(1000);

    // Create a new WebSocket instance for reconnection
    const ws2 = {
      send: jest.fn(),
      close: jest.fn(),
      readyState: WebSocket.OPEN,
      CONNECTING: WebSocket.CONNECTING,
      OPEN: WebSocket.OPEN,
      CLOSING: WebSocket.CLOSING,
      CLOSED: WebSocket.CLOSED,
      onopen: null,
      onclose: null,
      onerror: null,
      onmessage: null
    };
    (global as any).WebSocket.mockImplementationOnce(() => ws2);

    // Fast-forward timers again to trigger the actual reconnection
    jest.advanceTimersByTime(1000);

    // Verify reconnection attempt
    expect(global.WebSocket).toHaveBeenCalledTimes(2);
  });

  it('cleans up on disconnect', () => {
    const sessionId = 'test-session';
    service.subscribeToTiming(sessionId, mockHandler);

    // Set WebSocket to OPEN state
    ws.readyState = WebSocket.OPEN;

    // Simulate connection opening
    ws.onopen();

    // Simulate pong message to confirm connection
    ws.onmessage({ data: JSON.stringify({ type: 'pong' }) });

    // Disconnect
    service.disconnect();

    expect(ws.close).toHaveBeenCalled();
  });
}); 