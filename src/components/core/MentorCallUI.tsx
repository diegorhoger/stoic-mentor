import React, { useState, useEffect, useRef } from 'react';
import { useSessionStore } from '../../state/sessionStore';
import { useMentorCallEngine } from '../../hooks/useMentorCallEngine';
import WaveformVisualizer from '../UI/WaveformVisualizer';
import { VAD_SETTINGS, AUDIO_LEVEL_SETTINGS } from '../../constants/audioThresholds';

const MentorCallUI: React.FC = () => {
  const { currentMentor, isSpeaking, history } = useSessionStore();
  const [error, setError] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  
  // Local state for call mode
  const [isCallActive, setIsCallActive] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [callDurationInterval, setCallDurationInterval] = useState<number | null>(null);
  
  // State for smoothed audio level
  const [smoothedAudioLevel, setSmoothedAudioLevel] = useState(0);
  const audioLevelHistoryRef = useRef<number[]>([]);
  
  // Use the mentor call engine hook with VAD enabled
  const {
    audioLevel,
    isRecording,
    isVADActive,
    isProcessing,
    startListening,
    stopListening,
    interruptMentor,
    isError,
    errorMessage,
    endCall,
    // WebSocket VAD debug info
    vadDebugState,
    isSocketVadConnected,
    isSocketVadSessionActive,
    isSocketVadDetectingSpeech
  } = useMentorCallEngine({
    enableVoiceActivity: true,
    maxSilenceMs: VAD_SETTINGS.SILENCE_TIMEOUT_MS,
    autoStart: false,
    useSocketVad: true
  });

  // Smooth audio level for display
  useEffect(() => {
    // Keep a history of audio levels for averaging
    audioLevelHistoryRef.current.push(audioLevel);
    if (audioLevelHistoryRef.current.length > AUDIO_LEVEL_SETTINGS.AUDIO_HISTORY_MAX) {
      audioLevelHistoryRef.current.shift();
    }
    
    // Calculate average audio level with decay weighting
    // More recent values have higher weight
    let weightedSum = 0;
    let weights = 0;
    
    audioLevelHistoryRef.current.forEach((level, index) => {
      const weight = index + 1; // More recent values get higher weight
      weightedSum += level * weight;
      weights += weight;
    });
    
    const avg = audioLevelHistoryRef.current.length > 0 
      ? weightedSum / weights 
      : audioLevel;
    
    setSmoothedAudioLevel(avg);
  }, [audioLevel]);

  // Handle recording state changes
  useEffect(() => {
    if (isError && errorMessage) {
      setError(errorMessage);
    } else {
      setError(null);
    }
  }, [isError, errorMessage]);
  
  // Handle call start/end
  const startCall = async () => {
    setIsCallActive(true);
    
    // Reset audio level history
    audioLevelHistoryRef.current = [];
    
    // Start the call duration timer
    const intervalId = window.setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
    setCallDurationInterval(intervalId);
    
    // Start listening
    await startListening();
  };
  
  const endCallHandler = () => {
    setIsCallActive(false);
    
    // Clear the call duration timer
    if (callDurationInterval) {
      window.clearInterval(callDurationInterval);
      setCallDurationInterval(null);
    }
    
    // Reset call duration
    setCallDuration(0);
    
    // Reset audio level history
    audioLevelHistoryRef.current = [];
    
    // Use endCall instead of stopListening to properly clean up all resources
    endCall();
  };
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (callDurationInterval) {
        window.clearInterval(callDurationInterval);
      }
    };
  }, [callDurationInterval]);
  
  // Format call duration as mm:ss
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Get a user-friendly audio level indicator
  const getAudioLevelText = () => {
    if (smoothedAudioLevel < 0.1) return 'Silent';
    if (smoothedAudioLevel < VAD_SETTINGS.SILENCE_THRESHOLD) return 'Very Quiet';
    if (smoothedAudioLevel < 0.25) return 'Quiet';
    if (smoothedAudioLevel < 0.35) return 'Moderate';
    if (smoothedAudioLevel < 0.5) return 'Medium';
    if (smoothedAudioLevel < 0.7) return 'Loud';
    return 'Very Loud';
  };
  
  // Better color gradients for audio level visualization
  const getAudioLevelColor = () => {
    if (!isRecording) return '#6b7280'; // gray
    
    // Create a color gradient from red to yellow to green
    if (smoothedAudioLevel < 0.1) {
      return '#6b7280'; // gray for minimum level
    } else if (smoothedAudioLevel < VAD_SETTINGS.SILENCE_THRESHOLD) {
      return '#ef4444'; // red for near silence
    } else if (smoothedAudioLevel < 0.25) {
      return '#f97316'; // orange for very quiet
    } else if (smoothedAudioLevel < 0.35) {
      return '#f59e0b'; // amber for quiet
    } else if (smoothedAudioLevel < 0.5) {
      return '#84cc16'; // lime for moderate
    } else {
      return '#10b981'; // emerald for loud
    }
  };
  
  // Check if current audio level is likely silence - using the updated threshold
  const isLikelySilence = smoothedAudioLevel < VAD_SETTINGS.SILENCE_THRESHOLD;

  return (
    <div className="flex flex-col items-center w-full max-w-2xl mx-auto space-y-2 p-6">
      {/* Conversation Display */}
      <div style={{ 
        border: '1px solid #e5e7eb', 
        borderRadius: '8px', 
        padding: '16px', 
        marginBottom: '8px',
        minHeight: '200px',
        backgroundColor: 'white',
        width: '100%',
        maxWidth: '600px'
      }}>
        {/* Show conversation history */}
        {history.length > 0 ? (
          // Display all messages in the history array
          history.map((message, index) => (
            <div 
              key={message.timestamp || index} 
              style={{ 
                marginBottom: '16px',
                display: 'flex',
                justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start'
              }}
            >
              <div style={{ 
                backgroundColor: message.role === 'user' ? '#e9ecef' : '#f8f9fa', 
                borderRadius: message.role === 'user' ? '12px 12px 0 12px' : '12px 12px 12px 0',
                padding: '10px 14px',
                maxWidth: '80%',
                border: message.role === 'user' ? 'none' : '1px solid #e9ecef'
              }}>
                {message.content}
              </div>
            </div>
          ))
        ) : (
          <div style={{ 
            color: '#9ca3af', 
            textAlign: 'center',
            marginTop: '40px'
          }}>
            Ask me something about stoicism...
          </div>
        )}
      </div>
      
      <div className="flex flex-col items-center w-full">
        {/* Call status indicator */}
        {isCallActive && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '5px',
            marginBottom: '10px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '14px',
              fontWeight: 'bold',
              color: isSpeaking ? '#10b981' : isProcessing ? '#6366f1' : isRecording ? '#f59e0b' : '#6b7280'
            }}>
              <div style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: isSpeaking ? '#10b981' : isProcessing ? '#6366f1' : isRecording ? '#f59e0b' : '#6b7280',
                animation: (isSpeaking || isRecording || isProcessing) ? 'pulse 1.5s infinite' : 'none'
              }}></div>
              {isSpeaking ? 'Mentor Speaking' : 
               isProcessing ? 'Processing...' : 
               isRecording ? 'Listening...' : 
               'Call Connected'}
            </div>
            
            {/* Call duration */}
            <div style={{ fontSize: '12px', color: '#4b5563' }}>
              Duration: {formatDuration(callDuration)}
            </div>
            
            {/* Live Audio Status Indicator */}
            <div style={{
              fontSize: '12px',
              color: '#10b981',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              marginTop: '4px'
            }}>
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: isRecording ? '#10b981' : '#6b7280',
                animation: isRecording ? 'pulse 1s infinite' : 'none'
              }}></span>
              <span>{isRecording ? 'Microphone Active' : 'Microphone Inactive'}</span>
            </div>
            
            {/* Audio level visualization */}
            {isRecording && (
              <>
                <WaveformVisualizer
                  audioLevel={smoothedAudioLevel}
                  isActive={isRecording || isSpeaking}
                  color={getAudioLevelColor()}
                  height={60}
                  width={300}
                />
                
                {/* Audio Level Meter with threshold indicator */}
                <div style={{
                  width: '300px',
                  marginTop: '8px',
                  position: 'relative',
                }}>
                  {/* Threshold line */}
                  <div style={{
                    position: 'absolute',
                    left: `${VAD_SETTINGS.SILENCE_THRESHOLD * 100 * 3}%`, // Scale by 3 to make the scale more visible
                    top: '0px',
                    height: '100%',
                    width: '2px',
                    background: '#6b7280',
                    zIndex: 10
                  }}></div>
                  
                  {/* Meter background */}
                  <div style={{
                    height: '12px',
                    background: '#f1f5f9',
                    borderRadius: '6px',
                    overflow: 'hidden',
                  }}>
                    {/* Meter fill */}
                    <div style={{
                      height: '100%',
                      width: `${Math.min(100, smoothedAudioLevel * 100 * 3)}%`, // Scale by 3 to make changes more visible
                      background: getAudioLevelColor(),
                      borderRadius: '6px',
                      transition: 'width 0.1s ease-out'
                    }}></div>
                  </div>
                  
                  {/* Threshold indicator */}
                  <div style={{
                    fontSize: '10px',
                    color: '#6b7280',
                    position: 'absolute',
                    left: `${VAD_SETTINGS.SILENCE_THRESHOLD * 100 * 3}%`, // Scale by 3 to match scale
                    top: '14px',
                    transform: 'translateX(-50%)'
                  }}>
                    threshold
                  </div>
                </div>
                
                {/* Audio Level Text */}
                <div style={{ 
                  fontSize: '12px', 
                  color: getAudioLevelColor(),
                  fontWeight: 'bold',
                  marginTop: '10px',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span>{getAudioLevelText()}</span>
                  <span>({(smoothedAudioLevel * 100).toFixed(1)}%)</span>
                  {/* Add visual indicator for active detection */}
                  {smoothedAudioLevel > 0.1 && (
                    <span style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      backgroundColor: smoothedAudioLevel > VAD_SETTINGS.SILENCE_THRESHOLD ? '#10b981' : '#f59e0b',
                      animation: 'pulsate 0.5s ease-out infinite',
                      display: 'inline-block',
                      marginLeft: '5px'
                    }}></span>
                  )}
                </div>
                
                {/* VAD Status with pulsing indicator */}
                {isVADActive && (
                  <div style={{ 
                    fontSize: '12px', 
                    color: isLikelySilence ? '#ef4444' : '#10b981',
                    fontWeight: isLikelySilence ? 'bold' : 'normal',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: '4px',
                    marginTop: '8px',
                    padding: '4px 8px',
                    background: isLikelySilence ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                    borderRadius: '4px',
                    width: 'fit-content',
                    margin: '8px auto 0',
                    border: isLikelySilence ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)'
                  }}>
                    <div style={{ 
                      width: '8px', 
                      height: '8px', 
                      borderRadius: '50%', 
                      background: isLikelySilence ? '#ef4444' : '#10b981',
                      animation: 'pulse 1s infinite'
                    }}></div>
                    {isLikelySilence ? 'Silence Detected' : 'Voice Detected'}
                  </div>
                )}
              </>
            )}
            
            {/* Processing indicator */}
            {isProcessing && !isRecording && !isSpeaking && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '5px',
                marginTop: '5px'
              }}>
                <div className="loading-dots">
                  <span style={{ backgroundColor: '#6366f1' }}></span>
                  <span style={{ backgroundColor: '#6366f1' }}></span>
                  <span style={{ backgroundColor: '#6366f1' }}></span>
                </div>
                <div style={{ fontSize: '12px', color: '#6366f1' }}>
                  Transcribing and thinking...
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Call control buttons */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center',
          marginBottom: '20px',
          gap: '16px'
        }}>
          {!isCallActive ? (
            <button 
              onClick={startCall}
              style={{
                padding: '12px 24px',
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '50px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                transition: 'all 0.2s ease'
              }}
            >
              <span>Call {currentMentor.charAt(0).toUpperCase() + currentMentor.slice(1)}</span>
              {/* Phone icon */}
              <svg 
                width="20" 
                height="20" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2"
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
              </svg>
            </button>
          ) : (
            <>
              <button 
                onClick={endCallHandler}
                style={{
                  padding: '12px 24px',
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '50px',
                  cursor: 'pointer',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                  transition: 'all 0.2s ease'
                }}
              >
                <span>End Call</span>
                {/* Phone icon with slash */}
                <svg 
                  width="20" 
                  height="20" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2"
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                >
                  <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path>
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                </svg>
              </button>
              
              {isSpeaking && (
                <button
                  onClick={interruptMentor}
                  style={{
                    padding: '12px 24px',
                    background: '#f97316',
                    color: 'white',
                    border: 'none',
                    borderRadius: '50px',
                    cursor: 'pointer',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <span>Interrupt</span>
                  <svg 
                    width="20" 
                    height="20" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2"
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="11" width="18" height="2" rx="1"></rect>
                  </svg>
                </button>
              )}
            </>
          )}
        </div>
      </div>
      
      {/* Error display */}
      {error && (
        <div style={{
          backgroundColor: '#fee2e2',
          border: '1px solid #fca5a5',
          color: '#b91c1c',
          padding: '12px',
          borderRadius: '8px',
          marginTop: '12px',
          fontSize: '14px',
          textAlign: 'center',
          width: '100%',
          maxWidth: '600px'
        }}>
          {error}
        </div>
      )}
      
      {/* Toggle for Debug Panel */}
      <button 
        onClick={() => setShowDebug(!showDebug)}
        style={{
          background: 'none',
          border: '1px solid #e5e7eb',
          borderRadius: '4px',
          padding: '4px 8px',
          fontSize: '12px',
          color: '#6b7280',
          marginTop: '10px',
          cursor: 'pointer'
        }}
      >
        {showDebug ? 'Hide Debug Info' : 'Show Debug Info'}
      </button>
      
      {/* WebSocket VAD Debug Panel */}
      {showDebug && (
        <div style={{
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '12px',
          marginTop: '10px',
          backgroundColor: '#f9fafb',
          width: '100%',
          maxWidth: '600px',
          fontSize: '12px'
        }}>
          <h3 style={{ fontWeight: 'bold', marginBottom: '8px' }}>WebSocket VAD Debug</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div style={{ 
              padding: '4px 8px',
              background: isSocketVadConnected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              borderRadius: '4px',
              display: 'flex',
              justifyContent: 'space-between'
            }}>
              <span>WebSocket Connected:</span>
              <span style={{ fontWeight: 'bold', color: isSocketVadConnected ? '#10b981' : '#ef4444' }}>
                {isSocketVadConnected ? 'YES' : 'NO'}
              </span>
            </div>
            
            <div style={{ 
              padding: '4px 8px',
              background: isSocketVadSessionActive ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              borderRadius: '4px',
              display: 'flex',
              justifyContent: 'space-between'
            }}>
              <span>WebSocket Session:</span>
              <span style={{ fontWeight: 'bold', color: isSocketVadSessionActive ? '#10b981' : '#ef4444' }}>
                {isSocketVadSessionActive ? 'ACTIVE' : 'INACTIVE'}
              </span>
            </div>
            
            <div style={{ 
              padding: '4px 8px',
              background: isVADActive ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              borderRadius: '4px',
              display: 'flex',
              justifyContent: 'space-between'
            }}>
              <span>VAD Active:</span>
              <span style={{ fontWeight: 'bold', color: isVADActive ? '#10b981' : '#ef4444' }}>
                {isVADActive ? 'YES' : 'NO'}
              </span>
            </div>
            
            <div style={{ 
              padding: '4px 8px',
              background: isSocketVadDetectingSpeech ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              borderRadius: '4px',
              display: 'flex',
              justifyContent: 'space-between'
            }}>
              <span>Speaking Status:</span>
              <span style={{ fontWeight: 'bold', color: isSocketVadDetectingSpeech ? '#10b981' : '#ef4444' }}>
                {isSocketVadDetectingSpeech ? 'SPEAKING' : 'SILENT'}
              </span>
            </div>
          </div>
        </div>
      )}
      
      {/* Debug Info - only show during active calls */}
      {isCallActive && (
        <div style={{
          marginTop: '20px',
          padding: '10px',
          background: '#f3f4f6',
          borderRadius: '8px',
          fontSize: '12px',
          color: '#4b5563',
          maxWidth: '800px',
          margin: '20px auto 0'
        }}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>Call Debug Info</h4>
          <div>Call Duration: {formatDuration(callDuration)}</div>
          <div>VAD Active: <span style={{ color: isVADActive ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
            {isVADActive ? 'Yes' : 'No'}
          </span></div>
          <div>Current Audio Level: <span style={{ 
            color: smoothedAudioLevel < VAD_SETTINGS.SILENCE_THRESHOLD ? '#ef4444' : '#10b981', 
            fontWeight: 'bold' 
          }}>
            {(smoothedAudioLevel * 100).toFixed(1)}%
          </span></div>
          <div>Raw Audio Level: <span style={{ 
            color: audioLevel < VAD_SETTINGS.SILENCE_THRESHOLD ? '#ef4444' : '#10b981',
            fontWeight: 'normal'
          }}>
            {(audioLevel * 100).toFixed(1)}%
          </span></div>
          <div>Smoothed Audio Level: <span style={{ 
            color: smoothedAudioLevel < VAD_SETTINGS.SILENCE_THRESHOLD ? '#ef4444' : '#10b981',
            fontWeight: 'bold'
          }}>
            {(smoothedAudioLevel * 100).toFixed(1)}%
          </span></div>
          <div>Silence Threshold: <span style={{ fontWeight: 'bold' }}>
            {(VAD_SETTINGS.SILENCE_THRESHOLD * 100).toFixed(1)}%
          </span></div>
          <div>Silence Timeout: {VAD_SETTINGS.SILENCE_TIMEOUT_MS}ms</div>
          <div>Min Speaking Time: {VAD_SETTINGS.MIN_SPEAKING_TIME_MS}ms</div>
          <div>Consecutive Silent Frames: {VAD_SETTINGS.CONSECUTIVE_SILENCE_FRAMES}</div>
          <div>Is silence detected: <span style={{ 
            color: isLikelySilence ? '#ef4444' : '#10b981',
            fontWeight: 'bold'
          }}>
            {isLikelySilence ? 'YES' : 'No'}
          </span></div>
          <div>Recording State: <span style={{ 
            color: isRecording ? '#10b981' : '#6b7280',
            fontWeight: 'bold'
          }}>
            {isRecording ? 'Active' : 'Inactive'}
          </span></div>
          <div>Speaking State: {isSpeaking ? 'Mentor Speaking' : 'Mentor Silent'}</div>
          <div>Processing State: {isProcessing ? 'Processing Audio/Generating Response' : 'Idle'}</div>
        </div>
      )}
      
      {/* CSS for the pulse animation and loading dots */}
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.4; }
            100% { opacity: 1; }
          }
          
          @keyframes pulsate {
            0% { transform: scale(0.8); opacity: 0.5; }
            50% { transform: scale(1.2); opacity: 1; }
            100% { transform: scale(0.8); opacity: 0.5; }
          }
          
          .loading-dots {
            display: flex;
            gap: 4px;
          }
          
          .loading-dots span {
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            animation: dot-pulse 1.5s infinite ease-in-out;
          }
          
          .loading-dots span:nth-child(2) {
            animation-delay: 0.2s;
          }
          
          .loading-dots span:nth-child(3) {
            animation-delay: 0.4s;
          }
          
          @keyframes dot-pulse {
            0%, 100% { transform: scale(0.8); opacity: 0.5; }
            50% { transform: scale(1.2); opacity: 1; }
          }
        `
      }} />
    </div>
  );
};

export default MentorCallUI; 