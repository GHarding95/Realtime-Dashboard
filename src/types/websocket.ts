import { RawResult } from './result';

export type WebSocketMessageType = 'result' | 'session_update' | 'ping' | 'pong' | 'error' | 'connection';

export type WebSocketMessage = {
  type: WebSocketMessageType;
  status?: 'connected' | 'disconnected' | 'error';
  sessionId?: string;
  timeRemaining?: string;
  state?: string;
} & Partial<RawResult>;

export type WebSocketHandler = (message: WebSocketMessage) => void; 