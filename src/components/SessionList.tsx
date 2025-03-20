import React, { useEffect, useState } from 'react';
import { apiService } from '../services/api';
import { Session, SessionState } from '../types/session';
import { websocketService } from '../services/websocket';
import { WebSocketMessage } from '../types/websocket';
import { isLiveSession, isCompletedSession } from '../utils/sessionUtils';

interface SessionListProps {
  onSessionSelect: (sessionId: string, isLive: boolean) => void;
}

// Helper function to parse duration string to milliseconds
const parseDurationToMs = (duration: string): number => {
  const durationParts = duration.split(':').map(Number);
  if (durationParts.length === 3) {
    // HH:MM:SS format
    return (durationParts[0] * 3600 + durationParts[1] * 60 + durationParts[2]) * 1000;
  } else if (durationParts.length === 2) {
    // MM:SS format
    return (durationParts[0] * 60 + durationParts[1]) * 1000;
  }
  console.error('Invalid duration format:', duration);
  return 0;
};

export const SessionList: React.FC<SessionListProps> = ({ onSessionSelect }) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

  const fetchSessions = async () => {
    try {
      setError(null);
      const data = await apiService.getSessions();
      
      // Map sessions to ensure they have an id field and check time remaining
      const mappedSessions = data.map(session => {
        const now = new Date().getTime();
        const startTime = new Date(session.startTime).getTime();
        const durationMs = parseDurationToMs(session.duration);
        const endTime = startTime + durationMs;
        const remainingMs = Math.max(0, endTime - now);

        // If time has run out and session is still running, update to Finished
        if (remainingMs === 0 && isLiveSession(session.state)) {
          websocketService.sendMessage({
            type: 'session_update',
            sessionId: session.id || session.sessionId,
            state: 'Finished',
            timeRemaining: '00:00'
          });
          return {
            ...session,
            id: session.id || session.sessionId,
            state: 'Finished' as SessionState
          };
        }

        return {
          ...session,
          id: session.id || session.sessionId
        };
      });

      // Filter out sessions without IDs and duplicates
      const validSessions = mappedSessions.filter(session => {
        if (!session.id) {
          console.warn('Found session without ID:', session);
          return false;
        }
        return true;
      });

      const uniqueSessions = validSessions.reduce((acc, current) => {
        const isDuplicate = acc.some(session => 
          session.id === current.id
        );
        if (!isDuplicate) {
          acc.push(current);
        }
        return acc;
      }, [] as Session[]);

      // Sort sessions by start time (most recent first)
      const sortedSessions = uniqueSessions.sort((a, b) => 
        new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
      );

      setSessions(sortedSessions);
    } catch (err) {
      console.error('Error fetching sessions:', err);
      setError('Failed to load sessions. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
    
    // Poll more frequently (every 5 seconds)
    const pollInterval = setInterval(fetchSessions, 5000);

    // Subscribe to session updates via WebSocket
    const sessionUpdateHandler = websocketService.subscribeToTiming('global', (data: WebSocketMessage) => {
      if (data.type === 'session_update' || data.type === 'result') {
        console.log('🔵 [SessionList] Received update:', {
          type: data.type,
          timestamp: new Date().toISOString(),
          data: JSON.stringify(data, null, 2)
        });
        // Update session state immediately if it's a state update
        if (data.type === 'session_update' && data.state) {
          setSessions(prevSessions => {
            return prevSessions.map(session => {
              // Match on both id and sessionId to ensure we catch all cases
              if (session.id === data.sessionId || session.sessionId === data.sessionId) {
                return {
                  ...session,
                  state: data.state as SessionState
                };
              }
              return session;
            });
          });
          // Trigger a fresh fetch to ensure we have the latest data
          fetchSessions();
        }
      }
    });

    return () => {
      clearInterval(pollInterval);
      if (sessionUpdateHandler) {
        websocketService.removeHandler(sessionUpdateHandler);
      }
    };
  }, []);

  const handleViewDetails = (session: Session) => {
    setSelectedSession(session);
  };

  const handleCloseDetails = () => {
    setSelectedSession(null);
  };

  const handleViewResults = (session: Session) => {
    if (!session.id) {
      console.error('Session ID is missing:', session);
      return;
    }
    // A session is live if it's Running or under any flag condition
    const isLive = ['Running', 'Red Flag', 'Yellow Flag', 'Safety Car', 'Virtual Safety Car'].includes(session.state);
    onSessionSelect(session.id, isLive);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex flex-col items-center justify-center">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-gray-700 border-t-gray-300 rounded-full animate-spin"></div>
        </div>
        <div className="mt-8 text-xl font-medium text-white">Loading sessions...</div>
        <div className="mt-2 text-gray-400">Please wait</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex flex-col items-center justify-center p-6">
        <div className="bg-gray-800 rounded-xl shadow-2xl p-8 max-w-md w-full border border-red-500/20">
          <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 rounded-full bg-red-600/10">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-white text-center mb-2">Connection Error</h3>
          <p className="text-gray-400 text-center mb-6">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full bg-red-600 hover:bg-red-700 text-white border-none shadow-lg transition-all duration-300 rounded-lg hover:shadow-red-600/20 px-4 py-2 font-medium"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">Race Sessions</h1>
          <p className="text-gray-400 text-lg">Select a session to view real-time race data and timing information</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="bg-gray-800 rounded-xl shadow-2xl overflow-hidden border border-gray-700 hover:border-red-500/50 transition-all duration-300 group"
            >
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-t from-gray-900 to-transparent"></div>
                <div className="h-32 bg-gradient-to-r from-red-600 to-red-800"></div>
                <div className="absolute bottom-4 left-4">
                  <p className="text-xs text-gray-400 mb-1">{session.series}</p>
                  <h2 className="text-xl font-bold text-white">{session.name}</h2>
                </div>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <p className="text-sm text-gray-400 mb-1">Track</p>
                    <p className="font-medium text-white">{session.track}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400 mb-1">Duration</p>
                    <p className="font-medium text-white">{session.duration}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400 mb-1">Start Time</p>
                    <p className="font-medium text-white">
                      {new Date(session.startTime).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400 mb-1">Status</p>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      isCompletedSession(session.state)
                        ? 'bg-yellow-900 text-yellow-300' 
                        : isLiveSession(session.state)
                        ? 'bg-green-900 text-green-300 animate-pulse'
                        : 'bg-blue-900 text-blue-300'
                    }`}>
                      {session.state}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => onSessionSelect(session.id || '', isLiveSession(session.state))}
                  className="w-full bg-red-600 hover:bg-red-700 text-white border-none shadow-lg transition-all duration-300 rounded-lg px-4 py-3 font-medium flex items-center justify-center gap-2 group-hover:shadow-red-600/20"
                >
                  {isLiveSession(session.state) ? (
                    <>
                      <span>View Live Session</span>
                      <svg className="w-5 h-5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </>
                  ) : (
                    <>
                      <span>View Results</span>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}; 