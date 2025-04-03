import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSessionStore } from '../../state/sessionStore';
import { useMicStream } from '../../hooks/useMicStream';
import { transcribeAudio, requestMicrophonePermission } from '../../services/whisperService';
import { generateSpeech, playAudio, blobToBase64 } from '../../services/ttsService';
import { checkApiHealth } from '../../services/mentorService';
import { generateResponse } from '../../services/api';
import { sanitizeResponse } from '../../services/openaiService';
import { Mentor } from '../../types';

const ConversationUI: React.FC = () => {
  // Global state
  const { 
    currentMentor, 
    isSpeaking, 
    setIsSpeaking, 
    setIsListening, 
    addMessage, 
    history 
  } = useSessionStore();
  
  // Force re-initialize component when mentor changes
  const [mentorKey, setMentorKey] = useState(currentMentor);
  
  // Update mentorKey when currentMentor changes
  useEffect(() => {
    if (mentorKey !== currentMentor) {
      console.log(`🔍 CONVERSATION UI - Mentor changed from ${mentorKey} to ${currentMentor}, reinitializing...`);
      setMentorKey(currentMentor);
      
      // Reset conversation state
      setUserText('');
      setMentorText('');
      setError(null);
      setIsProcessing(false);
    }
  }, [currentMentor]);
  
  // Local state
  const { isRecording, startRecording, stopRecording, getAudioBlob } = useMicStream();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isApiAvailable, setIsApiAvailable] = useState<boolean | null>(null);
  const [userText, setUserText] = useState('');
  const [mentorText, setMentorText] = useState('');
  const [shouldProcessAudio, setShouldProcessAudio] = useState(false);
  const [micPermissionStatus, setMicPermissionStatus] = useState<string>('unknown');
  const wasRecording = useRef(false);
  
  // Check API health on mount
  useEffect(() => {
    const checkApi = async () => {
      const isAvailable = await checkApiHealth();
      setIsApiAvailable(isAvailable);
    };
    
    checkApi();
  }, []);
  
  // Process audio when recording stops
  useEffect(() => {
    if (!isRecording && wasRecording.current) {
      setTimeout(() => {
        setShouldProcessAudio(true);
      }, 500);
      wasRecording.current = false;
    } else if (isRecording) {
      wasRecording.current = true;
    }
  }, [isRecording]);
  
  // Handle recording state changes
  useEffect(() => {
    if (isRecording) {
      setIsListening(true);
    } else {
      setIsListening(false);
    }
  }, [isRecording, setIsListening]);
  
  // Process audio when recording stops
  const processAudio = useCallback(async () => {
    if (isProcessing) return;
    
    if (!isApiAvailable) {
      const isAvailableNow = await checkApiHealth();
      
      if (!isAvailableNow) {
        return;
      } else {
        setIsApiAvailable(true);
      }
    }
    
    setIsProcessing(true);
    setError(null);
    setShouldProcessAudio(false);
    
    try {
      // Get recorded audio
      const audioBlob = await getAudioBlob();
      if (!audioBlob) {
        throw new Error('No audio recorded');
      }
      
      // Transcribe audio to text
      const transcriptionOptions = {
        language: 'en',
        prompt: 'This is a conversation about Stoic philosophy and philosophical guidance.',
        temperature: 0.2
      };
      
      const transcription = await transcribeAudio(audioBlob, transcriptionOptions);
      setUserText(transcription);
      
      // Add user message to history
      addMessage({
        role: 'user',
        content: transcription,
        timestamp: Date.now(),
      });
      
      // Get the current mentor from the store to ensure we have the latest value
      const currentState = useSessionStore.getState();
      const latestMentor = currentState.currentMentor;
      console.log(`🔍 CONVERSATION UI - Processing audio for mentor: ${latestMentor} (verifying it matches UI state: ${currentMentor})`);
      
      // If there's a mismatch, log it but continue with the store value
      if (latestMentor !== currentMentor) {
        console.warn(`🔍 CONVERSATION UI - WARNING: Current mentor in UI (${currentMentor}) does not match store (${latestMentor})`);
      }
      
      // Convert previous responses to context
      const context = await Promise.all(
        history
          .filter(msg => msg.role === 'mentor')
          .slice(-3)
          .map(async (msg) => {
            return {
              text: msg.content,
              speaker: latestMentor === 'marcus' ? 0 : latestMentor === 'seneca' ? 1 : 2,
              audio: 'base64audio'
            };
          })
      );
      
      // Generate mentor response
      setIsSpeaking(true);
      
      // Call the actual LLM through our API instead of using a hardcoded response
      console.log('🔍 Generating actual response using API with text:', transcription);
      
      try {
        // Convert mentor name to proper format for API
        const mentorName = latestMentor.charAt(0).toUpperCase() + latestMentor.slice(1);
        const mentorObj = { name: mentorName } as Mentor;
        
        // Call the proper API function to get the mentor's response
        const rawResponse = await generateResponse(transcription, mentorObj);
        
        // Sanitize the response to remove acknowledgment phrases
        const response = sanitizeResponse(rawResponse);
        
        console.log('🔍 Received response from API:', response.substring(0, 100) + '...');
        
        setMentorText(response);
        
        // Add mentor message to history
        addMessage({
          role: 'mentor',
          content: response,
          timestamp: Date.now(),
        });
        
        // Generate and play audio
        const speakerId = latestMentor === 'marcus' ? 0 : latestMentor === 'seneca' ? 1 : 2;
        console.log(`🔍 CONVERSATION UI - Using speaker ID: ${speakerId} for mentor: ${latestMentor}`);
        const audioResponse = await generateSpeech(response, speakerId, context);
        
        // Convert to base64 for future use
        await blobToBase64(audioResponse);
        
        // Play the audio
        await playAudio(audioResponse);
        setIsSpeaking(false);
      } catch (err) {
        console.error('Error generating mentor response:', err);
        setError(`Failed to generate response: ${err instanceof Error ? err.message : 'Unknown error'}`);
        setIsSpeaking(false);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Error: ${errorMessage}`);
      setIsSpeaking(false);
    } finally {
      setIsProcessing(false);
    }
  }, [
    isProcessing, 
    isApiAvailable, 
    getAudioBlob, 
    addMessage, 
    history, 
    currentMentor, 
    setIsSpeaking,
    setUserText,
    setMentorText
  ]);
  
  // Process audio when flag is set
  useEffect(() => {
    if (shouldProcessAudio && !isProcessing) {
      processAudio();
    }
  }, [shouldProcessAudio, isProcessing, processAudio]);
  
  // Toggle recording
  const handleToggleRecording = async () => {
    try {
      if (isRecording) {
        stopRecording();
      } else {
        setUserText('');
        setMentorText('');
        await startRecording();
      }
    } catch {
      setError(`Failed to access microphone. Please check permissions.`);
    }
  };
  
  // Test microphone permissions
  const testMicrophonePermission = async () => {
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
      <div style={{ 
        fontSize: '13px', 
        color: '#6b7280', 
        marginBottom: '8px' 
      }}>
        Mic Status: {micPermissionStatus === 'unknown' ? 'pending' : micPermissionStatus}
      </div>
      
      <div style={{ 
        border: '1px solid #e5e7eb', 
        borderRadius: '8px', 
        padding: '16px', 
        marginBottom: '20px',
        minHeight: '200px',
        backgroundColor: 'white'
      }}>
        {userText && (
          <div style={{ 
            marginBottom: '16px',
            display: 'flex',
            justifyContent: 'flex-end'
          }}>
            <div style={{ 
              backgroundColor: '#e9ecef', 
              borderRadius: '12px 12px 0 12px',
              padding: '10px 14px',
              maxWidth: '80%'
            }}>
              {userText}
            </div>
          </div>
        )}
        
        {!userText && !mentorText && (
          <div style={{ 
            color: '#9ca3af', 
            textAlign: 'center',
            marginTop: '40px'
          }}>
            Ask me something about stoicism...
          </div>
        )}
        
        {mentorText && (
          <div style={{ 
            marginBottom: '16px',
            display: 'flex',
            justifyContent: 'flex-start'
          }}>
            <div style={{ 
              backgroundColor: '#f8f9fa', 
              borderRadius: '12px 12px 12px 0',
              padding: '10px 14px',
              maxWidth: '80%',
              border: '1px solid #e9ecef'
            }}>
              {mentorText}
            </div>
          </div>
        )}
      </div>
      
      <div style={{ 
        display: 'flex',
        justifyContent: 'center',
        marginBottom: '20px' 
      }}>
        <button
          onClick={handleToggleRecording}
          disabled={isProcessing || isSpeaking}
          style={{
            backgroundColor: '#f8f9fa',
            border: '1px solid #e9ecef',
            borderRadius: '24px',
            padding: '12px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: (isProcessing || isSpeaking) ? 'not-allowed' : 'pointer',
            opacity: (isProcessing || isSpeaking) ? 0.7 : 1,
            transition: 'all 0.2s ease',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)'
          }}
        >
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            style={{ 
              width: '20px',
              height: '20px',
              marginRight: '8px',
              color: isRecording ? '#e53e3e' : '#4b5563'
            }}
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" 
            />
          </svg>
          <span style={{ fontSize: '14px', fontWeight: 500 }}>
            {isRecording ? 'Stop Recording' : isProcessing ? 'Processing...' : isSpeaking ? 'Listening...' : 'Click to Speak'}
          </span>
        </button>
      </div>
      
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <button 
          onClick={testMicrophonePermission} 
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            fontSize: '13px',
            color: '#6b7280',
            cursor: 'pointer',
            padding: '4px 8px'
          }}
        >
          Test Microphone
        </button>
      </div>
      
      {error && (
        <div style={{
          color: '#e53e3e',
          marginTop: '12px',
          fontSize: '13px',
          textAlign: 'center'
        }}>
          {error}
        </div>
      )}
    </div>
  );
};

export default ConversationUI; 