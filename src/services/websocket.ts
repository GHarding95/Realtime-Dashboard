import { WebSocketMessage, WebSocketHandler } from '../types/websocket';

export class WebSocketService {
  private ws: WebSocket | null = null;
  private messageHandlers: Map<string, (data: WebSocketMessage) => void> = new Map();
  private connectionStatusHandlers: Map<string, (message: WebSocketMessage) => void> = new Map();
  private heartbeatInterval: number | null = null;
  private connectionTimeout: number | null = null;
  private handlerIdCounter = 0;
  private connectionState = false;
  private timingServiceState = false;
  private lastConnectionStatus: 'connected' | 'disconnected' | 'error' = 'disconnected';
  private currentSessionId: string | null = null;
  private baseUrl = 'ws://localhost:8000/ws/sessions';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isConnecting = false;
  private pendingSubscriptions: Set<string> = new Set();

  constructor() {
    // Don't connect in constructor, wait for session ID
  }

  private getWebSocketUrl(sessionId: string): string {
    if (sessionId === 'global') {
      return `${this.baseUrl}`;
    }
    return `${this.baseUrl}/${sessionId}`;
  }

  private handleConnectionError(error: Event) {
    console.error('WebSocket connection error:', error);
    this.connectionState = false;
    this.timingServiceState = false;
    this.lastConnectionStatus = 'error';
    this.notifyConnectionStatus('error');
    
    // Attempt to reconnect after a delay
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff
      console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      setTimeout(() => {
        if (!this.connectionState && this.currentSessionId && !this.isConnecting) {
          this.connect();
        }
      }, delay);
    } else {
      console.error('Max reconnection attempts reached');
      this.lastConnectionStatus = 'error';
      this.notifyConnectionStatus('error');
    }
  }

  private handleClose() {
    console.log('WebSocket connection closed');
    this.connectionState = false;
    this.timingServiceState = false;
    this.lastConnectionStatus = 'disconnected';
    this.notifyConnectionStatus('disconnected');
    
    // Attempt to reconnect after a delay
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff
      console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      setTimeout(() => {
        if (!this.connectionState && this.currentSessionId && !this.isConnecting) {
          this.connect();
        }
      }, delay);
    }
  }

  private handleOpen = () => {
    console.log('WebSocket connection established');
    this.connectionState = true;
    this.reconnectAttempts = 0;
    this.lastConnectionStatus = 'connected';
    this.notifyConnectionStatus('connected');
    this.isConnecting = false;
    
    // Start heartbeat
    this.startHeartbeat();

    // Send pending subscriptions
    if (this.currentSessionId) {
      this.sendSubscription(this.currentSessionId);
    }
  }

  private sendSubscription(sessionId: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'subscribe', sessionId }));
    } else {
      this.pendingSubscriptions.add(sessionId);
    }
  }

  private startHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    this.heartbeatInterval = window.setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000); // Send heartbeat every 30 seconds
  }

  private clearIntervals() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
  }

  private connect() {
    if (this.isConnecting) {
      console.log('Already attempting to connect');
      return;
    }

    if (!this.currentSessionId) {
      console.log('No session ID available, cannot connect');
      return;
    }

    this.isConnecting = true;
    
    if (this.ws) {
      this.ws.close();
    }

    this.clearIntervals();
    this.connectionState = false;
    this.timingServiceState = false;
    this.lastConnectionStatus = 'disconnected';
    this.notifyConnectionStatus('disconnected');

    try {
      const url = this.getWebSocketUrl(this.currentSessionId);
      console.log('Creating new WebSocket connection to:', url);
      this.ws = new WebSocket(url);
      
      this.ws.onopen = () => this.handleOpen();
      this.ws.onclose = () => this.handleClose();
      this.ws.onerror = (error) => this.handleConnectionError(error);
      
      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          switch (message.type) {
            case 'pong':
              this.timingServiceState = true;
              this.lastConnectionStatus = 'connected';
              this.notifyConnectionStatus('connected');
              break;
              
            case 'error':
              this.timingServiceState = false;
              this.lastConnectionStatus = 'error';
              this.notifyConnectionStatus('error');
              break;
              
            case 'connection':
              this.timingServiceState = message.status === 'connected';
              this.lastConnectionStatus = message.status;
              this.notifyConnectionStatus(message.status);
              break;
              
            case 'result':
            case 'session_update':
              // Update timing service state when receiving valid messages
              this.timingServiceState = true;
              this.lastConnectionStatus = 'connected';
              this.notifyConnectionStatus('connected');
              
              this.messageHandlers.forEach(handler => {
                try {
                  handler(message);
                } catch (err) {
                  console.error('Error in message handler:', err);
                }
              });
              break;
          }
        } catch (err) {
          console.error('Error processing message:', err);
        }
      };
      
      // Set connection timeout
      this.connectionTimeout = window.setTimeout(() => {
        if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
          console.log('Connection timeout - closing connection');
          this.ws.close();
        }
      }, 5000);
      
    } catch (err) {
      console.error('Error creating WebSocket connection:', err);
      this.connectionState = false;
      this.timingServiceState = false;
      this.lastConnectionStatus = 'error';
      this.notifyConnectionStatus('error');
      this.isConnecting = false;
    }
  }

  public disconnect() {
    console.log('Disconnecting WebSocket...');
    this.clearIntervals();
    this.reconnectAttempts = 0;
    this.isConnecting = false;
    this.pendingSubscriptions.clear();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.connectionState = false;
    this.timingServiceState = false;
    this.lastConnectionStatus = 'disconnected';
    this.notifyConnectionStatus('disconnected');
    this.currentSessionId = null;
    this.messageHandlers.clear();
  }

  /**
   * Sends a message through the WebSocket connection
   * @param message - The message to send
   */
  public sendMessage(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  public subscribeToTiming(sessionId: string, handler: (data: WebSocketMessage) => void): string {
    const handlerId = `timing_${++this.handlerIdCounter}`;
    this.messageHandlers.set(handlerId, handler);
    
    // Only set current session ID if it's not a global subscription
    if (sessionId !== 'global') {
      this.currentSessionId = sessionId;
    }
    
    // Send subscription message if connected, otherwise queue it
    this.sendSubscription(sessionId);
    
    // Connect if not already connected
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.connect();
    }
    
    return handlerId;
  }

  public onConnectionStatus(handler: (message: WebSocketMessage) => void): string {
    const messageId = Math.random().toString(36).substring(7);
    this.connectionStatusHandlers.set(messageId, handler);
    
    // Send current status immediately
    handler({ type: 'connection', status: this.lastConnectionStatus });
    
    return messageId;
  }

  public removeHandler(messageId: string) {
    this.messageHandlers.delete(messageId);
    this.connectionStatusHandlers.delete(messageId);
  }

  public isConnected(): boolean {
    return this.connectionState && this.timingServiceState;
  }

  public isTimingServiceConnected(): boolean {
    return this.timingServiceState;
  }

  public getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  private notifyConnectionStatus(status: 'connected' | 'disconnected' | 'error') {
    if (this.connectionStatusHandlers.size > 0) {
      this.connectionStatusHandlers.forEach(handler => {
        handler({ type: 'connection', status });
      });
    }
  }
}

export const websocketService = new WebSocketService(); 