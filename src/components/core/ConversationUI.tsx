import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSessionStore } from '../../state/sessionStore';
import { useMicStream } from '../../hooks/useMicStream';
import WaveformVisualizer from '../UI/WaveformVisualizer';
import VoiceButton from '../UI/VoiceButton';
import TranscriptBox from './TranscriptBox';
import { transcribeAudio, requestMicrophonePermission } from '../../services/whisperService';
import { generateSpeech, playAudio, blobToBase64 } from '../../services/ttsService';
import { checkApiHealth } from '../../services/mentorService';
import { MENTOR_PERSONALITIES, API_ENDPOINTS } from '../../constants/app';
import { MentorKey } from '../../types';

const ConversationUI: React.FC = () => {
  // Global state
  const { 
    currentMentor, 
    isSpeaking, 
    isListening, 
    setIsSpeaking, 
    setIsListening, 
    addMessage, 
    history 
  } = useSessionStore();
  
  // Local state
  const { isRecording, audioLevel, startRecording, stopRecording, getAudioBlob } = useMicStream();
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
      console.log("Checking API health...");
      const isAvailable = await checkApiHealth();
      console.log("API available:", isAvailable);
      setIsApiAvailable(isAvailable);
    };
    
    checkApi();
  }, []);
  
  // Process audio when recording stops
  useEffect(() => {
    // Add a state change listener to handle recording stop
    if (!isRecording && wasRecording.current) {
      console.log("Recording stopped, calling processAudio after delay");
      // Small delay to allow audio chunks to be processed
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
      console.log("Recording started, setting isListening to true");
      setIsListening(true);
    } else {
      console.log("Recording stopped, setting isListening to false");
      setIsListening(false);
    }
  }, [isRecording, setIsListening]);
  
  // Process audio when recording stops
  const processAudio = useCallback(async () => {
    console.log("processAudio called with states:", { isProcessing, isApiAvailable });
    if (isProcessing || !isApiAvailable) {
      console.log("Exiting processAudio early - processing:", isProcessing, "API available:", isApiAvailable);
      return;
    }
    
    setIsProcessing(true);
    setError(null);
    setShouldProcessAudio(false);
    
    try {
      console.log("Getting recorded audio blob...");
      // Get recorded audio
      const audioBlob = await getAudioBlob();
      if (!audioBlob) {
        console.error("No audio blob received from recording");
        throw new Error('No audio recorded');
      }
      console.log("Audio blob received, size:", audioBlob.size, "bytes");
      
      // Transcribe audio to text
      console.log("Sending audio for transcription...");
      
      // Create whisper options with prompt to help guide transcription
      const transcriptionOptions = {
        language: 'en',
        prompt: 'This is a conversation about Stoic philosophy and philosophical guidance.',
        temperature: 0.2 // Lower temperature for more accurate transcription
      };
      
      const transcription = await transcribeAudio(audioBlob, transcriptionOptions);
      console.log("Received transcription:", transcription);
      setUserText(transcription);
      
      // Add user message to history
      console.log("Adding user message to history");
      addMessage({
        role: 'user',
        content: transcription,
        timestamp: Date.now(),
      });
      
      // Convert previous responses to context
      console.log("Processing context from previous messages");
      const context = await Promise.all(
        history
          .filter(msg => msg.role === 'mentor')
          .slice(-3) // Only use last 3 mentor messages for context
          .map(async (msg) => {
            // Placeholder - in a real app, you'd have the audio data stored
            // For now, we'll generate fake base64 audio
            return {
              text: msg.content,
              speaker: currentMentor === 'marcus' ? 0 : currentMentor === 'seneca' ? 1 : 2,
              audio: 'base64audio' // This would be real base64 audio data in production
            };
          })
      );
      console.log("Context processed, entries:", context.length);
      
      // Generate mentor response
      console.log("Starting mentor response generation");
      setIsSpeaking(true);
      
      // In a real implementation, we would call an LLM here
      // For now, we'll use a placeholder response
      const response = `I understand what you're saying about "${transcription}". Let me think about that from a Stoic perspective...`;
      console.log("Mentor response generated:", response);
      setMentorText(response);
      
      // Add mentor message to history
      console.log("Adding mentor message to history");
      addMessage({
        role: 'mentor',
        content: response,
        timestamp: Date.now(),
      });
      
      // Generate and play audio
      const speakerId = currentMentor === 'marcus' ? 0 : currentMentor === 'seneca' ? 1 : 2;
      console.log("Generating speech with speaker ID:", speakerId);
      const audioResponse = await generateSpeech(response, speakerId, context);
      console.log("Speech audio received, size:", audioResponse.size, "bytes");
      
      // Convert to base64 for future use
      console.log("Converting audio to base64");
      const audioBase64 = await blobToBase64(audioResponse);
      console.log('Audio generated with base64 length:', audioBase64.length);
      
      // Play the audio
      console.log("Playing audio response");
      await playAudio(audioResponse);
      console.log("Audio playback complete");
      setIsSpeaking(false);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error("Error in processAudio:", errorMessage);
      setError(`Error: ${errorMessage}`);
      console.error(err);
      setIsSpeaking(false);
    } finally {
      console.log("Completing audio processing");
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
    console.log("Processing effect triggered with shouldProcessAudio:", shouldProcessAudio);
    
    if (shouldProcessAudio && !isProcessing) {
      console.log("Calling processAudio from effect");
      processAudio();
    }
  }, [shouldProcessAudio, isProcessing, processAudio]);
  
  // Toggle recording
  const handleToggleRecording = async () => {
    try {
      if (isRecording) {
        console.log("Stop recording button pressed");
        stopRecording();
      } else {
        console.log("Start recording button pressed");
        setUserText('');
        setMentorText('');
        await startRecording();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error("Error in handleToggleRecording:", errorMessage);
      setError(`Failed to access microphone. Please check permissions.`);
      console.error(err);
    }
  };
  
  // Test microphone permissions
  const testMicrophonePermission = async () => {
    try {
      console.log("Testing microphone permissions...");
      setMicPermissionStatus('checking...');
      const result = await requestMicrophonePermission();
      console.log("Microphone permission test result:", result);
      setMicPermissionStatus(result ? 'granted' : 'denied');
      
      if (!result) {
        setError('Microphone access denied. Please check your browser settings.');
      } else {
        setError(null);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error("Error testing microphone:", errorMessage);
      setMicPermissionStatus('error');
      setError(`Error testing microphone: ${errorMessage}`);
    }
  };
  
  // Test direct API connection
  const testDirectApiConnection = async () => {
    try {
      console.log("Testing direct API connection...");
      const response = await fetch(`${API_ENDPOINTS.baseUrl}/api/health`, {
        method: 'GET',
      });
      
      const data = await response.json();
      console.log("Direct API connection test result:", data);
      
      if (data.status === 'ok') {
        setError(null);
        alert('API connection successful! Status: ' + data.status);
      } else {
        setError('API connection failed.');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error("Error testing API connection:", errorMessage);
      setError(`API connection error: ${errorMessage}`);
    }
  };
  
  return (
    <div className="flex flex-col items-center space-y-6 p-6">
      {!isApiAvailable && isApiAvailable !== null && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <p className="font-bold">API Not Available</p>
          <p className="text-sm">Please make sure the backend API is running.</p>
        </div>
      )}
      
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">
          {MENTOR_PERSONALITIES[currentMentor as MentorKey].name}
        </h2>
        <p className="text-gray-600">
          {isListening ? 'Listening...' : isSpeaking ? 'Speaking...' : 'Click to speak'}
        </p>
        <p className="text-xs text-gray-500">
          Mic Status: {micPermissionStatus}
        </p>
      </div>
      
      <div className="grid grid-cols-1 gap-4 w-full max-w-2xl">
        <TranscriptBox 
          text={userText}
          isUser={true}
          isActive={isListening}
        />
        
        <TranscriptBox 
          text={mentorText}
          isUser={false}
          isActive={isSpeaking}
        />
      </div>
      
      <WaveformVisualizer
        audioLevel={audioLevel}
        isActive={isRecording || isSpeaking}
        color={isRecording ? '#EF4444' : '#4F46E5'}
        height={100}
        width={300}
      />
      
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <VoiceButton
          isRecording={isRecording}
          isProcessing={isProcessing}
          isSpeaking={isSpeaking}
          onToggleRecording={handleToggleRecording}
          size="lg"
          className="my-4"
        />
        
        <div className="flex flex-row gap-2">
          <button
            onClick={testMicrophonePermission}
            className="px-4 py-2 rounded-full font-medium text-white bg-gray-500 hover:bg-gray-600"
          >
            Test Microphone
          </button>
          
          <button
            onClick={testDirectApiConnection}
            className="px-4 py-2 rounded-full font-medium text-white bg-green-500 hover:bg-green-600"
          >
            Test API
          </button>
        </div>
      </div>
      
      {error && (
        <div className="text-red-500 text-center mt-4">
          {error}
        </div>
      )}
    </div>
  );
};

export default ConversationUI; 