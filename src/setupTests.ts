import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

// Mock WebSocket
class WebSocketMock {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState: number;
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    this.readyState = WebSocketMock.CONNECTING;
    setTimeout(() => {
      this.readyState = WebSocketMock.OPEN;
      if (this.onopen) this.onopen();
    }, 0);
  }

  send(_data: string) {
    // Mock implementation - parameter is intentionally unused
  }

  close() {
    this.readyState = WebSocketMock.CLOSED;
    if (this.onclose) this.onclose();
  }
}

global.WebSocket = WebSocketMock as any; 