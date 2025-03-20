import React, { useEffect, useState, useRef, useCallback, memo, useMemo } from 'react';
import { apiService } from '../services/api';
import { websocketService } from '../services/websocket';
import { Session, SessionState } from '../types/session';
import { Result } from '../types/result';
import { WebSocketMessage } from '../types/websocket';
import { isLiveSession, isCompletedSession } from '../utils/sessionUtils';

/**
 * Props for the ResultsView component
 */
interface ResultsViewProps {
  sessionId: string;
  isLive: boolean;
  onBack: () => void;
}

/**
 * ResultsView Component
 * Displays real-time or completed session results with timing information
 * Handles WebSocket connections for live updates and polling for data freshness
 */
export const ResultsView: React.FC<ResultsViewProps> = memo(({ sessionId, isLive, onBack }) => {
  // State management for session data and UI
  const [session, setSession] = useState<Session | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>('00:00');
  const [currentLapTimes, setCurrentLapTimes] = useState<Record<string, string>>({});
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  
  // Refs to track component state and prevent memory leaks
  const isMountedRef = useRef(true);
  const timerIntervalRef = useRef<number | null>(null);
  const updateIntervalRef = useRef<number | null>(null);
  const messageHandlerIdRef = useRef<string | null>(null);
  const updateTimeoutRef = useRef<number | null>(null);
  const loadingTimeoutRef = useRef<number | null>(null);
  const isFetchingRef = useRef(false);

  // Memoize sorted results to prevent unnecessary re-renders
  const sortedResults = useMemo(() => {
    return [...results].sort((a, b) => {
      const posA = parseInt(a.rank) || parseInt(a.bib);
      const posB = parseInt(b.rank) || parseInt(b.bib);
      return posA - posB;
    });
  }, [results]);

  /**
   * Handles cleanup when navigating back
   * Clears all intervals, timeouts, and WebSocket connections
   */
  const handleBack = useCallback(() => {
    // Clear all intervals and timeouts
    if (timerIntervalRef.current) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    
    if (updateIntervalRef.current) {
      window.clearInterval(updateIntervalRef.current);
      updateIntervalRef.current = null;
    }
    
    if (updateTimeoutRef.current) {
      window.clearTimeout(updateTimeoutRef.current);
      updateTimeoutRef.current = null;
    }
    
    if (loadingTimeoutRef.current) {
      window.clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }

    // Remove WebSocket handlers
    if (messageHandlerIdRef.current) {
      websocketService.removeHandler(messageHandlerIdRef.current);
    }

    // Disconnect WebSocket
    websocketService.disconnect();

    // Call the parent's onBack handler
    onBack();
  }, [onBack]);

  /**
   * Helper function to parse duration string to milliseconds
   */
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

  /**
   * Updates the time remaining display
   * Handles session completion when time runs out
   */
  const updateTimeRemaining = useCallback(() => {
    if (!session || !isMountedRef.current) return;

    const now = new Date().getTime();
    const startTime = new Date(session.startTime).getTime();
    const durationMs = parseDurationToMs(session.duration);
    const endTime = startTime + durationMs;
    const remainingMs = Math.max(0, endTime - now);

    if (remainingMs === 0 && session.state !== 'Finished') {
      // When time runs out, update session state to Finished
      setSession(prev => prev ? { ...prev, state: 'Finished' as SessionState } : null);
      // Emit session update to notify other components
      websocketService.sendMessage({
        type: 'session_update',
        sessionId: sessionId,
        state: 'Finished',
        timeRemaining: '00:00'
      });
      // Disconnect WebSocket for finished sessions
      if (messageHandlerIdRef.current) {
        websocketService.removeHandler(messageHandlerIdRef.current);
        messageHandlerIdRef.current = null;
      }
    }

    const minutes = Math.floor(remainingMs / 60000);
    const seconds = Math.floor((remainingMs % 60000) / 1000);
    const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    if (isMountedRef.current) {
      setTimeRemaining(timeString);
    }
  }, [session, sessionId]);

  /**
   * Updates current lap times based on sector times
   * Calculates total lap time from individual sector times
   */
  const updateCurrentLapTimes = useCallback(() => {
    if (!session || !isMountedRef.current) return;

    try {
      const newLapTimes: Record<string, string> = {};

      session.competitors.forEach(competitor => {
        if (competitor.currentLapSectorTimes) {
          const sector1 = competitor.currentLapSectorTimes["1"]?.rawMs || 0;
          const sector2 = competitor.currentLapSectorTimes["2"]?.rawMs || 0;
          const sector3 = competitor.currentLapSectorTimes["3"]?.rawMs || 0;
          
          // Add up sector times (they are in microseconds)
          const totalMicros = sector1 + sector2 + sector3;
          
          // Convert to minutes, seconds, and milliseconds
          const minutes = Math.floor(totalMicros / 60000000);
          const seconds = Math.floor((totalMicros % 60000000) / 1000000);
          const milliseconds = Math.floor((totalMicros % 1000000) / 1000);
          
          // Format as M:SS.mmm
          newLapTimes[competitor.id] = `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
        }
      });

      if (isMountedRef.current) {
        setCurrentLapTimes(newLapTimes);
      }
    } catch (err) {
      console.error('Error updating lap times:', err);
    }
  }, [session]);

  /**
   * Fetches session data from the API
   * Handles both live and completed session data
   * @param isRefreshOperation - Whether this is a refresh operation
   */
  const fetchSession = useCallback(async (isRefreshOperation = false) => {
    if (!isMountedRef.current) return;

    try {
      const sessionData = await apiService.getSession(sessionId);
      
      if (!isMountedRef.current) return;
      
      // Check if session should be finished based on time
      const now = new Date().getTime();
      const startTime = new Date(sessionData.startTime).getTime();
      const durationMs = parseDurationToMs(sessionData.duration);
      const endTime = startTime + durationMs;
      const remainingMs = Math.max(0, endTime - now);

      if (remainingMs === 0 && sessionData.state !== 'Finished') {
        sessionData.state = 'Finished';
        // Emit session update to notify other components
        websocketService.sendMessage({
          type: 'session_update',
          sessionId: sessionId,
          state: 'Finished',
          timeRemaining: '00:00'
        });
      }
      
      setSession(sessionData);
      
      let initialResults: Result[] = [];
      
      if (!isLive && sessionData.results) {
        // For completed sessions, use the final results
        initialResults = sessionData.results.map(result => ({
          bib: result.driverNumber,
          name: result.driverName,
          teamName: result.team || '',
          className: '',
          rank: result.position.toString(),
          laps: result.laps || 0,
          lastLapTime: { display: result.bestLapTime || '-', rawMs: 0 },
          fastestLapTime: { display: result.bestLapTime || '-', rawMs: 0 },
          currentLapSectorTimes: {},
          finished: true
        }));
      } else if (sessionData.competitors) {
        // For live sessions, use competitor data with current timing
        initialResults = sessionData.competitors.map(competitor => ({
          bib: competitor.startNumber,
          name: competitor.name,
          teamName: competitor.teamName,
          className: competitor.className,
          rank: competitor.result?.position?.toString() || '-',
          laps: competitor.result?.laps || 0,
          lastLapTime: competitor.result?.lastLapTime || { display: '-', rawMs: 0 },
          fastestLapTime: competitor.result?.fastestLapTime || { display: '-', rawMs: 0 },
          currentLapSectorTimes: competitor.currentLapSectorTimes || {},
          finished: competitor.result?.finished || false
        }));
      }

      // Sort results by position
      const sortedResults = initialResults.sort((a, b) => {
        const posA = parseInt(a.rank) || parseInt(a.bib);
        const posB = parseInt(b.rank) || parseInt(b.bib);
        return posA - posB;
      });
      
      if (isMountedRef.current) {
        setResults(sortedResults);
      }

      // Initial update of time remaining and lap times
      updateTimeRemaining();
      updateCurrentLapTimes();

      // Mark initial load as complete and clear loading state
      if (!isRefreshOperation && isMountedRef.current) {
        console.log('Setting initialLoadComplete to true');
        setInitialLoadComplete(true);
        setLoading(false);
      }
    } catch (err) {
      console.error('Error fetching session:', err);
      if (isMountedRef.current) {
        setError('Failed to load session data. Please try again later.');
        if (!isRefreshOperation) {
          setLoading(false);
        }
      }
      throw err;
    }
  }, [sessionId, isLive, updateTimeRemaining, updateCurrentLapTimes]);

  /**
   * Effect for initial data load and cleanup
   */
  useEffect(() => {
    isMountedRef.current = true;
    
    const loadInitialData = async () => {
      try {
        setLoading(true);
        setInitialLoadComplete(false);
        await fetchSession(false);
        if (isMountedRef.current) {
          console.log('Setting initialLoadComplete to true');
          setInitialLoadComplete(true);
          setLoading(false);
        }
      } catch (error) {
        console.error('Error loading initial data:', error);
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    };

    loadInitialData();
    
    return () => {
      isMountedRef.current = false;
      
      // Run cleanup
      if (timerIntervalRef.current) {
        window.clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      
      if (updateIntervalRef.current) {
        window.clearInterval(updateIntervalRef.current);
        updateIntervalRef.current = null;
      }
      
      if (updateTimeoutRef.current) {
        window.clearTimeout(updateTimeoutRef.current);
        updateTimeoutRef.current = null;
      }

      if (loadingTimeoutRef.current) {
        window.clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
      
      if (messageHandlerIdRef.current) {
        websocketService.removeHandler(messageHandlerIdRef.current);
        messageHandlerIdRef.current = null;
      }
      
      // Ensure WebSocket is disconnected
      websocketService.disconnect();
    };
  }, [sessionId]);

  /**
   * Effect for WebSocket connection and real-time updates
   * Sets up WebSocket handlers and polling intervals
   */
  useEffect(() => {
    if (!sessionId || !isLive) return;

    // Set up WebSocket connection
    const setupWebSocket = async () => {
      if (!initialLoadComplete || !session || !isMountedRef.current) {
        console.log('WebSocket subscription conditions not met:', {
          initialLoadComplete,
          hasSession: !!session,
          isLive,
          isMounted: isMountedRef.current,
          sessionId,
          sessionState: session?.state
        });
        return;
      }

      // Check if session should be finished based on time
      const now = new Date().getTime();
      const startTime = new Date(session.startTime).getTime();
      const durationMs = parseDurationToMs(session.duration);
      const endTime = startTime + durationMs;
      const remainingMs = Math.max(0, endTime - now);

      if (remainingMs === 0) {
        console.log('Session should be finished, not setting up WebSocket');
        return;
      }

      // Clean up previous subscriptions if they exist
      if (messageHandlerIdRef.current) {
        websocketService.removeHandler(messageHandlerIdRef.current);
        messageHandlerIdRef.current = null;
      }

      // Subscribe to timing updates
      const messageId = websocketService.subscribeToTiming(sessionId, (data: WebSocketMessage) => {
        if (!isMountedRef.current) return;

        // Handle session updates
        if (data.type === 'session_update') {
          setSession(prevSession => {
            if (!prevSession) return null;
            return {
              ...prevSession,
              timeRemaining: data.timeRemaining,
              state: (data.state as SessionState) || prevSession.state
            };
          });
          
          // Update time remaining immediately when we receive new data
          if (data.timeRemaining) {
            setTimeRemaining(data.timeRemaining);
          }
        }

        // Handle result updates
        if (data.type === 'result' && data.bib) {
          console.log('Received WebSocket message:', data);
          setResults(prevResults => {
            console.log('Previous results:', prevResults);
            const updatedResults = [...prevResults];
            const index = updatedResults.findIndex(r => r.bib === data.bib);
            console.log('Found index:', index, 'for bib:', data.bib);
            
            if (index !== -1) {
              console.log('Updating result at index:', index);
              // Update existing result with all new timing data immediately
              updatedResults[index] = {
                ...updatedResults[index],
                bib: data.bib || updatedResults[index].bib,
                name: data.name || updatedResults[index].name,
                teamName: data.teamName || updatedResults[index].teamName,
                className: data.className || updatedResults[index].className,
                rank: data.rank || updatedResults[index].rank,
                laps: data.laps !== undefined ? data.laps : updatedResults[index].laps,
                lastLapTime: data.lastLapTime || updatedResults[index].lastLapTime,
                fastestLapTime: data.fastestLapTime || updatedResults[index].fastestLapTime,
                currentLapSectorTimes: data.currentLapSectorTimes || updatedResults[index].currentLapSectorTimes,
                finished: data.finished ?? updatedResults[index].finished
              };
              console.log('Updated result:', updatedResults[index]);

              // Immediately update current lap time if we have sector times
              if (data.currentLapSectorTimes) {
                const sector1 = data.currentLapSectorTimes["1"]?.rawMs || 0;
                const sector2 = data.currentLapSectorTimes["2"]?.rawMs || 0;
                const sector3 = data.currentLapSectorTimes["3"]?.rawMs || 0;
                
                const totalMicros = sector1 + sector2 + sector3;
                const minutes = Math.floor(totalMicros / 60000000);
                const seconds = Math.floor((totalMicros % 60000000) / 1000000);
                const milliseconds = Math.floor((totalMicros % 1000000) / 1000);
                
                const bibKey = data.bib || updatedResults[index].bib;
                setCurrentLapTimes(prev => ({
                  ...prev,
                  [bibKey]: `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`
                }));
              }
            }
            
            // Sort results by position
            return updatedResults.sort((a, b) => {
              const posA = parseInt(a.rank || a.bib || '0');
              const posB = parseInt(b.rank || b.bib || '0');
              return posA - posB;
            });
          });
        }
      });
      messageHandlerIdRef.current = messageId;

      // Set up intervals for real-time updates
      timerIntervalRef.current = window.setInterval(updateTimeRemaining, 1000);
      
      // Add polling interval for live data updates
      updateIntervalRef.current = window.setInterval(async () => {
        if (!isFetchingRef.current) {
          isFetchingRef.current = true;
          try {
            await fetchSession(true);
          } catch (error) {
            console.error('Error during polling update:', error);
          } finally {
            isFetchingRef.current = false;
          }
        }
      }, 2000); // Poll every 2 seconds for live sessions
    };

    // Initial setup
    setupWebSocket();

    return () => {
      // Only clean up handlers and intervals, don't disconnect WebSocket
      if (messageHandlerIdRef.current) {
        websocketService.removeHandler(messageHandlerIdRef.current);
        messageHandlerIdRef.current = null;
      }
      
      if (timerIntervalRef.current) {
        window.clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }

      if (updateIntervalRef.current) {
        window.clearInterval(updateIntervalRef.current);
        updateIntervalRef.current = null;
      }
    };
  }, [sessionId, isLive, initialLoadComplete, session, updateTimeRemaining, fetchSession]);

  // Handle WebSocket connection cleanup on unmount
  useEffect(() => {
    return () => {
      // Disconnect WebSocket only when component is unmounting
      websocketService.disconnect();
    };
  }, []);

  // Only show loading screen during initial load
  if (!initialLoadComplete && loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex flex-col items-center justify-center">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-gray-700 border-t-gray-300 rounded-full animate-spin"></div>
        </div>
        <div className="mt-8 text-xl font-medium text-white">Loading session data...</div>
        <div className="mt-2 text-gray-400">Preparing real-time updates</div>
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
            onClick={handleBack}
            className="w-full bg-red-600 hover:bg-red-700 text-white border-none shadow-lg transition-all duration-300"
          >
            Back to Sessions
          </button>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex flex-col items-center justify-center p-6">
        <div className="bg-gray-800 rounded-xl shadow-2xl p-8 max-w-md w-full border border-yellow-500/20">
          <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 rounded-full bg-yellow-600/10">
            <svg className="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-white text-center mb-2">No Data Available</h3>
          <p className="text-gray-400 text-center mb-6">No session data was found.</p>
          <button 
            onClick={handleBack}
            className="w-full bg-yellow-600 hover:bg-yellow-700 text-white border-none shadow-lg transition-all duration-300"
          >
            Back to Sessions
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <div className="p-6">
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 mb-6">
          <button 
            onClick={handleBack} 
            className="bg-gray-800 hover:bg-gray-700 text-white border-none shadow-lg transition-all duration-300 flex items-center gap-2 px-4 py-2 rounded-lg"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
            Back to Sessions
          </button>
        </div>

        {session && (
          <div className="bg-gray-800 rounded-xl shadow-2xl p-8 mb-8 border border-gray-700">
            <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-6 mb-8">
              <div>
                <div className="inline-flex flex-col bg-red-600 rounded-xl shadow-lg p-4 mb-2">
                  <h2 className="text-3xl font-bold text-white">{session.name}</h2>
                  <p className="text-red-100 text-lg mt-1">{session.series}</p>
                </div>
              </div>
              <div className="bg-gray-900 rounded-xl p-6 shadow-lg min-w-[200px] text-center">
                <p className="text-sm text-gray-400 mb-1">Time Remaining</p>
                <p className="font-bold text-3xl text-white tracking-wider font-mono">{timeRemaining}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="bg-gray-900 rounded-xl p-4 shadow-lg">
                <p className="text-sm text-gray-400 mb-1">Track</p>
                <p className="font-medium text-white">{session.track}</p>
              </div>
              <div className="bg-gray-900 rounded-xl p-4 shadow-lg">
                <p className="text-sm text-gray-400 mb-1">Start Time</p>
                <p className="font-medium text-white">
                  {new Date(session.startTime).toLocaleString()}
                </p>
              </div>
              <div className="bg-gray-900 rounded-xl p-4 shadow-lg">
                <p className="text-sm text-gray-400 mb-1">Duration</p>
                <p className="font-medium text-white">{session.duration}</p>
              </div>
              <div className="bg-gray-900 rounded-xl p-4 shadow-lg">
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
          </div>
        )}

        <div className="bg-gray-800 rounded-xl shadow-2xl overflow-hidden border border-gray-700">
          {(() => {
            return Array.isArray(sortedResults) && sortedResults.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-400">
                  <thead>
                    <tr>
                      <th className="bg-red-600 text-white font-bold px-4 py-2">Pos</th>
                      <th className="bg-red-600 text-white font-bold px-4 py-2">No.</th>
                      <th className="bg-red-600 text-white font-bold px-4 py-2">Driver</th>
                      <th className="bg-red-600 text-white font-bold px-4 py-2">Team</th>
                      <th className="bg-red-600 text-white font-bold px-4 py-2">Class</th>
                      <th className="bg-red-600 text-white font-bold px-4 py-2">Laps</th>
                      <th className="bg-red-600 text-white font-bold px-4 py-2">Last Lap</th>
                      <th className="bg-red-600 text-white font-bold px-4 py-2">Best Lap</th>
                      {isLive && session.state !== 'Finished' && (
                        <>
                          <th className="bg-red-600 text-white font-bold px-4 py-2">Current Lap</th>
                          <th className="bg-red-600 text-white font-bold px-4 py-2">Sector 1</th>
                          <th className="bg-red-600 text-white font-bold px-4 py-2">Sector 2</th>
                          <th className="bg-red-600 text-white font-bold px-4 py-2">Sector 3</th>
                        </>
                      )}
                      <th className="bg-red-600 text-white font-bold px-4 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {sortedResults.map((result) => (
                      <tr 
                        key={result.bib} 
                        className="bg-gray-800 hover:bg-gray-700 transition-colors duration-150"
                      >
                        <td role="cell" className="text-white font-medium px-4 py-2">{result.rank || '-'}</td>
                        <td role="cell" className="text-white px-4 py-2">{result.bib || '-'}</td>
                        <td role="cell" className="text-white font-medium px-4 py-2">{result.name || '-'}</td>
                        <td role="cell" className="text-gray-300 px-4 py-2">{result.teamName || '-'}</td>
                        <td role="cell" className="text-gray-300 px-4 py-2">{result.className || '-'}</td>
                        <td role="cell" className="text-white px-4 py-2">{result.laps ?? '-'}</td>
                        <td role="cell" className="text-white px-4 py-2">{result.lastLapTime?.display || '-'}</td>
                        <td role="cell" className="text-white font-medium px-4 py-2">{result.fastestLapTime?.display || '-'}</td>
                        {isLive && session.state !== 'Finished' && (
                          <>
                            <td role="cell" className="text-white px-4 py-2">
                              {(() => {
                                const sector1Ms = result.currentLapSectorTimes?.["1"]?.rawMs || 0;
                                const sector2Ms = result.currentLapSectorTimes?.["2"]?.rawMs || 0;
                                const sector3Ms = result.currentLapSectorTimes?.["3"]?.rawMs || 0;
                                
                                const totalMs = sector1Ms + sector2Ms + sector3Ms;
                                
                                if (totalMs === 0) return '0:00.000';
                                
                                const minutes = Math.floor(totalMs / 60000000);
                                const seconds = Math.floor((totalMs % 60000000) / 1000000);
                                const milliseconds = Math.floor((totalMs % 1000000) / 1000);
                                
                                return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
                              })()}
                            </td>
                            <td role="cell" className="px-4 py-2">
                              <span className={result.currentLapSectorTimes?.["1"]?.display ? 'text-green-400 font-medium' : 'text-gray-500'}>
                                {result.currentLapSectorTimes?.["1"]?.display || '0:00.000'}
                              </span>
                            </td>
                            <td role="cell" className="px-4 py-2">
                              <span className={result.currentLapSectorTimes?.["2"]?.display ? 'text-green-400 font-medium' : 'text-gray-500'}>
                                {result.currentLapSectorTimes?.["2"]?.display || '0:00.000'}
                              </span>
                            </td>
                            <td role="cell" className="px-4 py-2">
                              <span className={result.currentLapSectorTimes?.["3"]?.display ? 'text-green-400 font-medium' : 'text-gray-500'}>
                                {result.currentLapSectorTimes?.["3"]?.display || '0:00.000'}
                              </span>
                            </td>
                          </>
                        )}
                        <td role="cell" className="px-4 py-2">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            isCompletedSession(session.state)
                              ? 'bg-yellow-900 text-yellow-300' 
                              : isLiveSession(session.state)
                              ? 'bg-green-900 text-green-300 animate-pulse'
                              : 'bg-blue-900 text-blue-300'
                          }`}>
                            {session.state}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center">
                <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 rounded-full bg-yellow-600/10">
                  <svg className="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">No Results Available</h3>
                <p className="text-gray-400">
                  {isLive && session.state !== 'Finished'
                    ? "Waiting for timing data... Results will appear as soon as they're available."
                    : "No results have been recorded for this session yet."}
                </p>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}); 