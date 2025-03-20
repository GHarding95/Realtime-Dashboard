import React, { useState, useCallback } from 'react';
import { SessionList } from './components/SessionList';
import { ResultsView } from './components/ResultsView';
import { websocketService } from './services/websocket';
import { ErrorBoundary } from './components/ErrorBoundary';

function App() {
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);

  const handleSessionSelect = useCallback((sessionId: string, live: boolean) => {
    // Disconnect WebSocket before navigating
    websocketService.disconnect();
    
    // Set live state first
    setIsLive(live);
    
    // Use a timeout to allow the disconnect to complete
    setTimeout(() => {
      setSelectedSession(sessionId);
    }, 100);
  }, []);

  const handleBack = useCallback(() => {
    // Disconnect WebSocket before navigating back
    websocketService.disconnect();
    
    // Use a timeout to allow the disconnect to complete
    setTimeout(() => {
      setSelectedSession(null);
      setIsLive(false);
    }, 100);
  }, []);

  return (
    <ErrorBoundary>
      {selectedSession ? (
        <ResultsView 
          sessionId={selectedSession} 
          isLive={isLive} 
          onBack={handleBack}
        />
      ) : (
        <SessionList onSessionSelect={handleSessionSelect} />
      )}
    </ErrorBoundary>
  );
}

export default App; 