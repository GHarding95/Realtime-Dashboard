import axios, { AxiosError } from 'axios';
import { Session } from '../types/session';
import { RawResult } from '../types/result';

// Use the Node.js server URL
const API_BASE_URL = 'http://localhost:8000/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000, // Increase timeout to 15 seconds
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
});

// Add request interceptor for debugging
apiClient.interceptors.request.use(
  (config) => {
    console.log(`[API Request] ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('[API Request Error]', error);
    return Promise.reject(error);
  }
);

// Add response interceptor for debugging
apiClient.interceptors.response.use(
  (response) => {
    console.log(`[API Response] ${response.config.method?.toUpperCase()} ${response.config.url}`, response.data);
    return response;
  },
  (error: AxiosError) => {
    console.error('[API Error]', {
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
      data: error.response?.data,
      message: error.message,
      code: error.code
    });
    return Promise.reject(error);
  }
);

// Retry with exponential backoff
const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelay = 1000
): Promise<T> => {
  let lastError: Error | null = null;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        console.log(`[Retry] Attempt ${i + 1}/${maxRetries} in ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
};

export const apiService = {
  // Get all sessions
  async getSessions(): Promise<Session[]> {
    console.log('[Sessions] Fetching sessions...');
    return retryWithBackoff(async () => {
      try {
        const response = await apiClient.get('/sessions');
        console.log('[Sessions] Successfully fetched sessions');
        return response.data;
      } catch (error) {
        console.error('[Sessions] Failed to fetch sessions:', error);
        throw error;
      }
    });
  },

  // Get final results for a completed session
  async getFinalResults(sessionId: string): Promise<RawResult[]> {
    console.log(`[Results] Fetching final results for session ${sessionId}...`);
    return retryWithBackoff(async () => {
      try {
        const response = await apiClient.get(`/sessions/${sessionId}/results`);
        console.log(`[Results] Successfully fetched results for session ${sessionId}`);
        return response.data;
      } catch (error) {
        console.error(`[Results] Failed to fetch results for session ${sessionId}:`, error);
        throw error;
      }
    });
  },

  // Get session data
  async getSession(sessionId: string): Promise<Session> {
    console.log(`[Session] Fetching session ${sessionId}...`);
    return retryWithBackoff(async () => {
      try {
        const response = await apiClient.get(`/sessions/${sessionId}`);
        console.log(`[Session] Successfully fetched session ${sessionId}`);
        return response.data;
      } catch (error) {
        console.error(`[Session] Failed to fetch session ${sessionId}:`, error);
        throw error;
      }
    });
  },
};

export const api = apiService; 