import React, { useState, useEffect } from 'react';
import { useSessionStore } from '../../state/sessionStore';
import { useMentorCallEngine } from '../../hooks/useMentorCallEngine';
import WaveformVisualizer from '../UI/WaveformVisualizer';

const MentorCallUI: React.FC = () => {
  const { isSpeaking, history } = useSessionStore();
  const [error, setError] = useState<string | null>(null);
  
  // Use the mentor call engine hook instead of direct API calls
  const {
    audioLevel,
    isRecording,
    toggleListening,
    isError,
    errorMessage
  } = useMentorCallEngine();

  // Handle recording state changes
  useEffect(() => {
    if (isError && errorMessage) {
      setError(errorMessage);
    } else {
      setError(null);
    }
  }, [isError, errorMessage]);

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
        <WaveformVisualizer
          audioLevel={audioLevel}
          isActive={isRecording || isSpeaking}
          color={isRecording ? '#EF4444' : '#4F46E5'}
          height={80}
          width={300}
        />
        
        <button
          onClick={toggleListening}
          disabled={isSpeaking}
          style={{
            padding: '12px 24px',
            backgroundColor: isRecording ? '#EF4444' : '#4F46E5',
            color: 'white',
            borderRadius: '24px',
            fontWeight: 'bold',
            border: 'none',
            cursor: isSpeaking ? 'not-allowed' : 'pointer',
            opacity: isSpeaking ? 0.7 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            margin: '10px auto'
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12 14C13.66 14 15 12.66 15 11V5C15 3.34 13.66 2 12 2C10.34 2 9 3.34 9 5V11C9 12.66 10.34 14 12 14Z"
              fill="currentColor"
            />
            <path
              d="M17 11C17 13.76 14.76 16 12 16C9.24 16 7 13.76 7 11H5C5 14.53 7.61 17.43 11 17.92V21H13V17.92C16.39 17.43 19 14.53 19 11H17Z"
              fill="currentColor"
            />
          </svg>
          {isRecording ? 'Stop Recording' : isSpeaking ? 'Wait for Response...' : 'Ask a question'}
        </button>
      </div>
      
      {error && (
        <div className="text-red-500 text-center mt-4">
          {error}
        </div>
      )}
    </div>
  );
};

export default MentorCallUI; 