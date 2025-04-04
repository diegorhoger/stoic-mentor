import React, { useState, useEffect } from 'react';
import { useSessionStore } from '../../state/sessionStore';
import { useMentorCallEngine } from '../../hooks/useMentorCallEngine';
import { requestMicrophonePermission } from '../../services/whisperService';
import { checkApiHealth } from '../../services/mentorService';
import { VAD_SETTINGS } from '../../constants/audioThresholds';

const ConversationUI: React.FC = () => {
  // Global state
  const { 
    currentMentor
  } = useSessionStore();
  
  // Force re-initialize component when mentor changes
  const [mentorKey, setMentorKey] = useState(currentMentor);
  
  // Local state for call mode
  const [isCallActive, setIsCallActive] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [callDurationInterval, setCallDurationInterval] = useState<number | null>(null);
  
  // Update mentorKey when currentMentor changes
  useEffect(() => {
    if (mentorKey !== currentMentor) {
      console.log(`🔍 CONVERSATION UI - Mentor changed from ${mentorKey} to ${currentMentor}, reinitializing...`);
      setMentorKey(currentMentor);
    }
  }, [currentMentor, mentorKey]);
  
  // Mentor call engine with VAD
  const {
    userText,
    mentorText,
    isError,
    errorMessage,
    isRecording,
    isSpeaking,
    isVADActive,
    startListening,
    stopListening,
    interruptMentor,
    audioLevel
  } = useMentorCallEngine({
    enableVoiceActivity: true,
    maxSilenceMs: VAD_SETTINGS.SILENCE_TIMEOUT_MS,
    autoStart: false,
    useSocketVad: true
  });
  
  // Local state
  const [isApiAvailable, setIsApiAvailable] = useState<boolean | null>(null);
  const [micPermissionStatus, setMicPermissionStatus] = useState<string>('unknown');
  
  // Check API health on mount
  useEffect(() => {
    const checkApi = async () => {
      const isAvailable = await checkApiHealth();
      setIsApiAvailable(isAvailable);
    };
    
    checkApi();
  }, []);
  
  // Handle call start/end
  const startCall = async () => {
    setIsCallActive(true);
    
    // Start the call duration timer
    const intervalId = window.setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
    setCallDurationInterval(intervalId);
    
    // Start listening
    await startListening();
  };
  
  const endCall = () => {
    setIsCallActive(false);
    
    // Clear the call duration timer
    if (callDurationInterval) {
      window.clearInterval(callDurationInterval);
      setCallDurationInterval(null);
    }
    
    // Reset call duration
    setCallDuration(0);
    
    // Stop listening if still active
    if (isRecording) {
      stopListening();
    }
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
  
  // Helper function to get color based on audio level
  const getAudioLevelColor = () => {
    if (!isRecording) return '#6b7280'; // gray
    if (audioLevel < VAD_SETTINGS.SILENCE_THRESHOLD) return '#ef4444'; // red
    if (audioLevel < 0.2) return '#f59e0b'; // yellow
    return '#10b981'; // green
  };
  
  // Add microphone test button to UI and make the function used
  const handleTestMicrophone = async () => {
    try {
      setMicPermissionStatus('checking...');
      const result = await requestMicrophonePermission();
      setMicPermissionStatus(result ? 'granted' : 'denied');
    } catch {
      setMicPermissionStatus('error');
    }
  };

  return (
    <div style={{ width: '100%' }}>
      {/* Status bar */}
      <div style={{ 
        fontSize: '13px', 
        color: '#6b7280', 
        marginBottom: '8px',
        display: 'flex',
        justifyContent: 'space-between'
      }}>
        <span>
          Mic Status: {micPermissionStatus === 'unknown' ? 'pending' : micPermissionStatus}
          {isApiAvailable === null && ' | API: Checking...'}
          {isApiAvailable === false && ' | API: Offline'}
          {isApiAvailable === true && ' | API: Online'}
          {isCallActive && ' | Call Duration: ' + formatDuration(callDuration)}
        </span>
        <button
          onClick={handleTestMicrophone}
          style={{
            background: 'transparent',
            border: 'none',
            fontSize: '13px',
            color: '#6b7280',
            cursor: 'pointer',
            textDecoration: 'underline'
          }}
        >
          Test Mic
        </button>
      </div>
      
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        padding: '20px',
        maxWidth: '800px',
        margin: '0 auto',
        background: '#f9fafb',
        borderRadius: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)'
      }}>
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
                onClick={endCall}
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
              color: isSpeaking ? '#10b981' : isRecording ? '#f59e0b' : '#6b7280'
            }}>
              <div style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: isSpeaking ? '#10b981' : isRecording ? '#f59e0b' : '#6b7280',
                animation: (isSpeaking || isRecording) ? 'pulse 1.5s infinite' : 'none'
              }}></div>
              {isSpeaking ? 'Mentor Speaking' : isRecording ? 'Listening...' : 'Call Connected'}
            </div>
            
            {/* Audio level visualization */}
            {isRecording && (
              <div style={{
                width: '80%',
                height: '8px',
                background: '#e5e7eb',
                borderRadius: '4px',
                overflow: 'hidden',
                marginTop: '5px'
              }}>
                <div style={{
                  height: '100%',
                  width: `${Math.min(audioLevel * 100, 100)}%`,
                  background: getAudioLevelColor(),
                  transition: 'width 0.1s ease, background-color 0.1s ease'
                }}></div>
              </div>
            )}
            
            {/* VAD Status */}
            {isVADActive && isRecording && (
              <div style={{ 
                fontSize: '12px', 
                color: audioLevel < VAD_SETTINGS.SILENCE_THRESHOLD ? '#ef4444' : '#10b981',
                fontWeight: audioLevel < VAD_SETTINGS.SILENCE_THRESHOLD ? 'bold' : 'normal'
              }}>
                {audioLevel < VAD_SETTINGS.SILENCE_THRESHOLD ? '🔴 Silence Detected' : '🔊 Voice Detected'}
              </div>
            )}
          </div>
        )}

        {/* User text box */}
        <div style={{
          padding: '16px',
          borderRadius: '8px',
          background: 'white',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          minHeight: '60px'
        }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', color: '#4b5563' }}>
            You {isRecording && '(speaking...)'}
          </h3>
          <div style={{ fontSize: '16px' }}>
            {userText || <em style={{ color: '#9ca3af' }}>Your transcribed speech will appear here...</em>}
          </div>
        </div>
        
        {/* Mentor text box */}
        <div style={{
          padding: '16px',
          borderRadius: '8px',
          background: '#f0f9ff',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          minHeight: '60px'
        }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', color: '#4b5563' }}>
            {currentMentor.charAt(0).toUpperCase() + currentMentor.slice(1)} {isSpeaking && '(speaking...)'}
          </h3>
          <div style={{ fontSize: '16px' }}>
            {mentorText || <em style={{ color: '#9ca3af' }}>Mentor's response will appear here...</em>}
          </div>
        </div>
        
        {/* Error display */}
        {isError && (
          <div style={{
            padding: '12px',
            background: '#fee2e2',
            color: '#b91c1c',
            borderRadius: '4px',
            fontSize: '14px'
          }}>
            Error: {errorMessage}
          </div>
        )}
      </div>
      
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
            color: audioLevel < VAD_SETTINGS.SILENCE_THRESHOLD ? '#ef4444' : '#10b981', 
            fontWeight: 'bold' 
          }}>
            {(audioLevel * 100).toFixed(1)}%
          </span></div>
          <div>Silence Threshold: {(VAD_SETTINGS.SILENCE_THRESHOLD * 100).toFixed(1)}%</div>
          <div>Silence Timeout: {VAD_SETTINGS.SILENCE_TIMEOUT_MS}ms</div>
          <div>Is silence detected: <span style={{ 
            color: audioLevel < VAD_SETTINGS.SILENCE_THRESHOLD ? '#ef4444' : '#10b981',
            fontWeight: 'bold'
          }}>
            {audioLevel < VAD_SETTINGS.SILENCE_THRESHOLD ? 'YES' : 'No'}
          </span></div>
          <div>Recording State: {isRecording ? 'Active' : 'Inactive'}</div>
          <div>Speaking State: {isSpeaking ? 'Mentor Speaking' : 'Mentor Silent'}</div>
        </div>
      )}
      
      {/* CSS for the pulse animation */}
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.4; }
            100% { opacity: 1; }
          }
        `
      }} />
    </div>
  );
};

export default ConversationUI; 