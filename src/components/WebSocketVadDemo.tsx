import React, { useState, useEffect } from 'react';
import { useSocketVad } from '../hooks/useSocketVad';

/**
 * Demo component to demonstrate WebSocket VAD integration
 */
const WebSocketVadDemo: React.FC = () => {
  const [sensitivity, setSensitivity] = useState(1.5);
  const [aggressiveness, setAggressiveness] = useState(2);
  const [showDebug, setShowDebug] = useState(false);
  
  // Initialize the WebSocket VAD hook
  const {
    isConnected,
    isSessionActive,
    isSpeaking,
    audioLevel,
    threshold,
    sessionId,
    noiseProfile,
    connect,
    disconnect,
    initVad,
    startAudioProcessing,
    stopAudioProcessing,
    forceRecalibration,
    updateConfig
  } = useSocketVad({
    autoConnect: false,
    autoInit: false,
    debug: true,
    onSpeakingChange: (speaking) => {
      console.log('Speaking state changed:', speaking);
    }
  });
  
  // Track if audio processing is active
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  
  // Update VAD configuration when sensitivity changes
  useEffect(() => {
    if (isSessionActive) {
      updateConfig({
        rms_vad_config: {
          initial_sensitivity_factor: sensitivity
        }
      });
    }
  }, [sensitivity, isSessionActive, updateConfig]);
  
  // Update VAD configuration when aggressiveness changes
  useEffect(() => {
    if (isSessionActive) {
      updateConfig({
        aggressiveness
      });
    }
  }, [aggressiveness, isSessionActive, updateConfig]);
  
  // Handle connection
  const handleConnect = async () => {
    const connected = await connect();
    if (connected) {
      await initVad();
    }
  };
  
  // Handle starting audio processing
  const handleStartAudio = async () => {
    const started = await startAudioProcessing();
    if (started) {
      setIsProcessingAudio(true);
    }
  };
  
  // Handle stopping audio processing
  const handleStopAudio = () => {
    stopAudioProcessing();
    setIsProcessingAudio(false);
  };
  
  // Format threshold as percentage
  const formatPercentage = (value: number) => {
    return `${Math.round(value * 100)}%`;
  };

  return (
    <div className="vad-demo p-4 max-w-lg mx-auto">
      <h2 className="text-2xl font-bold mb-4">WebSocket VAD Demo</h2>
      
      <div className="connection-status mb-4 p-3 rounded border">
        <div className="flex justify-between items-center mb-2">
          <span className="font-medium">Connection Status:</span>
          <span className={`px-2 py-1 rounded text-sm ${isConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        
        <div className="flex justify-between items-center mb-2">
          <span className="font-medium">Session Status:</span>
          <span className={`px-2 py-1 rounded text-sm ${isSessionActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
            {isSessionActive ? 'Active' : 'Inactive'}
          </span>
        </div>
        
        {sessionId && (
          <div className="flex justify-between items-center mb-2">
            <span className="font-medium">Session ID:</span>
            <span className="text-sm text-gray-700">{sessionId.substring(0, 8)}...</span>
          </div>
        )}
      </div>
      
      <div className="controls mb-4 flex flex-wrap gap-2">
        <button
          onClick={handleConnect}
          disabled={isConnected}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
        >
          Connect
        </button>
        
        <button
          onClick={disconnect}
          disabled={!isConnected}
          className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-400"
        >
          Disconnect
        </button>
        
        <button
          onClick={handleStartAudio}
          disabled={!isSessionActive || isProcessingAudio}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400"
        >
          Start Audio
        </button>
        
        <button
          onClick={handleStopAudio}
          disabled={!isSessionActive}
          className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:bg-gray-400"
        >
          Stop Audio
        </button>
        
        <button
          onClick={forceRecalibration}
          disabled={!isSessionActive}
          className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:bg-gray-400"
        >
          Recalibrate
        </button>
      </div>
      
      <div className="speaking-status mb-4">
        <div className={`p-3 rounded border ${isSpeaking ? 'bg-green-100 border-green-300' : 'bg-red-100 border-red-300'}`}>
          <span className="font-medium">Speaking Status:</span>
          <span className="ml-2 font-bold">
            {isSpeaking ? 'SPEAKING' : 'SILENT'}
          </span>
        </div>
      </div>
      
      <div className="audio-levels mb-4">
        <h3 className="font-medium mb-2">Audio Levels</h3>
        
        <div className="mb-2">
          <div className="flex justify-between mb-1">
            <span className="text-sm">Audio Level: {formatPercentage(audioLevel)}</span>
            <span className="text-sm">Threshold: {formatPercentage(threshold)}</span>
          </div>
          
          <div className="h-5 bg-gray-200 rounded overflow-hidden relative">
            <div 
              className="h-full bg-blue-500 absolute top-0 left-0 transition-all duration-100"
              style={{ width: `${audioLevel * 100}%` }}
            />
            <div 
              className="h-full w-1 bg-red-500 absolute top-0 transition-all duration-300"
              style={{ left: `${threshold * 100}%` }}
            />
          </div>
        </div>
      </div>
      
      <div className="config-options mb-4">
        <h3 className="font-medium mb-2">Configuration</h3>
        
        <div className="mb-3">
          <label htmlFor="sensitivity-slider" className="flex justify-between mb-1">
            <span>Sensitivity: {sensitivity.toFixed(1)}</span>
          </label>
          <input 
            id="sensitivity-slider"
            type="range" 
            min="0.5" 
            max="3.0" 
            step="0.1" 
            value={sensitivity}
            onChange={(e) => setSensitivity(parseFloat(e.target.value))}
            className="w-full"
            aria-valuetext={`Sensitivity: ${sensitivity.toFixed(1)}`}
          />
          <p className="text-xs text-gray-500 mt-1">Higher values make the VAD more sensitive to quieter sounds</p>
        </div>
        
        <div className="mb-3">
          <label htmlFor="aggressiveness-select" className="flex justify-between mb-1">
            <span>WebRTC VAD Aggressiveness: {aggressiveness}</span>
          </label>
          <select 
            id="aggressiveness-select"
            value={aggressiveness}
            onChange={(e) => setAggressiveness(parseInt(e.target.value))}
            className="w-full p-2 border rounded"
            aria-label="WebRTC VAD Aggressiveness"
          >
            <option value="0">0 (Least Aggressive)</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3 (Most Aggressive)</option>
          </select>
          <p className="text-xs text-gray-500 mt-1">Higher values filter out more non-speech</p>
        </div>
      </div>
      
      <div className="debug-section">
        <button
          onClick={() => setShowDebug(!showDebug)}
          className="px-3 py-1 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 mb-2"
        >
          {showDebug ? 'Hide Debug Info' : 'Show Debug Info'}
        </button>
        
        {showDebug && (
          <div className="p-3 border rounded bg-gray-50">
            <h3 className="font-medium mb-2">Debug Information</h3>
            
            <details open>
              <summary className="cursor-pointer mb-2 font-medium">Noise Profile</summary>
              <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-40">
                {noiseProfile ? JSON.stringify(noiseProfile, null, 2) : 'No noise profile available'}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
};

export default WebSocketVadDemo; 