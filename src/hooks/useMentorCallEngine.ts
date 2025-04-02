import { useState, useCallback, useRef, useEffect } from 'react';
import { useMicStream } from './useMicStream';
import { useSessionStore } from '../state/sessionStore';
import { transcribeAudio } from '../services/whisperService';
import { 
  createSystemPrompt, 
  generateChatCompletion, 
  streamChatCompletionWithOpenAI, 
  useDirectOpenAI,
  ChatMessage
} from '../services/openaiService';
import { 
  generateSpeech, 
  playAudio
} from '../services/ttsService';
import { MENTOR_PERSONALITIES } from '../constants/app';
import { MentorKey } from '../types';

export interface MentorCallOptions {
  enableVoiceActivity?: boolean;    // Enable voice activity detection for interruptions
  autoStart?: boolean;              // Auto start listening when hook mounts
  maxSilenceMs?: number;            // Maximum silence before considering the user done speaking
  immediateTranscription?: boolean; // Transcribe immediately as user speaks
  historyWindowSize?: number;       // Number of previous exchanges to keep in context
}

export interface MentorCallState {
  userText: string;             // Current user transcription
  mentorText: string;           // Current mentor response
  isProcessing: boolean;        // Whether audio is being processed
  isError: boolean;             // Whether an error occurred
  errorMessage: string | null;  // Error message if any
}

/**
 * A hook that orchestrates the complete mentor call flow:
 * 1. Record user audio via microphone
 * 2. Transcribe audio to text using Whisper
 * 3. Generate mentor response using GPT
 * 4. Synthesize and play audio response
 */
export function useMentorCallEngine(options: MentorCallOptions = {}) {
  // Default options
  const defaultOptions: Required<MentorCallOptions> = {
    enableVoiceActivity: true,
    autoStart: false,
    maxSilenceMs: 1500,
    immediateTranscription: false,
    historyWindowSize: 3,
  };
  
  const opts = { ...defaultOptions, ...options };
  
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
  
  // Audio recording
  const { 
    isRecording, 
    audioLevel, 
    startRecording, 
    stopRecording, 
    getAudioBlob 
  } = useMicStream();
  
  // Local state
  const [state, setState] = useState<MentorCallState>({
    userText: '',
    mentorText: '',
    isProcessing: false,
    isError: false,
    errorMessage: null,
  });
  
  // Check if we should use direct OpenAI integration or backend API
  const shouldUseDirectApi = useDirectOpenAI();
  
  // Refs to maintain state between renders
  const abortControllerRef = useRef<AbortController | null>(null);
  const silenceTimeoutRef = useRef<number | null>(null);
  const responseTimeoutRef = useRef<number | null>(null);
  const isGeneratingResponseRef = useRef(false);
  const isStreamingTTSRef = useRef(false);
  
  // Cleanup function
  const cleanupResources = useCallback(() => {
    // Clear timeouts
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    
    if (responseTimeoutRef.current) {
      clearTimeout(responseTimeoutRef.current);
      responseTimeoutRef.current = null;
    }
    
    // Abort any ongoing requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);
  
  // Update listening state based on recording state
  useEffect(() => {
    setIsListening(isRecording);
  }, [isRecording, setIsListening]);
  
  // Start listening for audio
  const startListening = useCallback(async () => {
    try {
      // Reset state
      setState(prev => ({
        ...prev,
        userText: '',
        isError: false,
        errorMessage: null,
      }));
      
      // Create a new abort controller
      abortControllerRef.current = new AbortController();
      
      // Start recording
      await startRecording();
    } catch (error) {
      console.error('Error starting listening:', error);
      setState(prev => ({
        ...prev,
        isError: true,
        errorMessage: error instanceof Error 
          ? error.message 
          : 'Failed to access microphone',
      }));
    }
  }, [startRecording]);
  
  // Stop listening and process audio
  const stopListening = useCallback(async () => {
    try {
      // Stop recording
      stopRecording();
      
      // Start processing
      setState(prev => ({ ...prev, isProcessing: true }));
      
      // Get the recorded audio
      const audioBlob = await getAudioBlob();
      
      if (!audioBlob) {
        throw new Error('No audio recorded');
      }
      
      // Process the audio
      await processAudio(audioBlob);
    } catch (error) {
      console.error('Error stopping listening:', error);
      setState(prev => ({
        ...prev,
        isProcessing: false,
        isError: true,
        errorMessage: error instanceof Error 
          ? error.message 
          : 'Failed to process audio',
      }));
    }
  }, [stopRecording, getAudioBlob]);
  
  // Process audio: transcribe, generate response, and play
  const processAudio = useCallback(async (audioBlob: Blob) => {
    try {
      // Create an abort controller for this operation
      abortControllerRef.current = new AbortController();
      
      // Transcribe audio to text
      console.log('Transcribing audio...');
      const transcriptionOptions = {
        language: 'en',
        prompt: 'This is a conversation about Stoic philosophy and philosophical guidance.',
        temperature: 0.2,
      };
      
      const transcription = await transcribeAudio(audioBlob, transcriptionOptions);
      console.log('Transcription received:', transcription);
      
      // Update state with transcription
      setState(prev => ({ ...prev, userText: transcription }));
      
      // Add user message to history
      addMessage({
        role: 'user',
        content: transcription,
        timestamp: Date.now(),
      });
      
      // Generate mentor response
      await generateMentorResponse(transcription);
    } catch (error) {
      console.error('Error processing audio:', error);
      setState(prev => ({
        ...prev,
        isProcessing: false,
        isError: true,
        errorMessage: error instanceof Error 
          ? error.message 
          : 'Failed to process audio',
      }));
    }
  }, [addMessage]);
  
  // Generate mentor response
  const generateMentorResponse = useCallback(async (userText: string) => {
    try {
      // Don't generate a response if user text is empty
      if (!userText.trim()) {
        setState(prev => ({ ...prev, isProcessing: false }));
        return;
      }
      
      // Set flag to indicate we're generating a response
      isGeneratingResponseRef.current = true;
      
      // Get mentor persona details
      const mentorKey = currentMentor as MentorKey;
      const mentorPrompt = MENTOR_PERSONALITIES[mentorKey].prompt;
      const speakerId = mentorKey === 'marcus' ? 0 : mentorKey === 'seneca' ? 1 : 2;
      
      // Create conversation history for context
      const lastMessages = history
        .slice(-opts.historyWindowSize * 2) // Get the last n exchanges (2 messages per exchange)
        .map(msg => ({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
        })) as ChatMessage[];
      
      // Create system prompt
      const systemPrompt = createSystemPrompt(mentorPrompt);
      
      // Prepare messages for OpenAI
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...lastMessages,
        { role: 'user', content: userText }
      ];
      
      let mentorResponse = '';
      setIsSpeaking(true);
      
      if (shouldUseDirectApi) {
        // Use streaming API
        const stream = streamChatCompletionWithOpenAI(messages, {
          temperature: 0.7,
          model: 'gpt-4',
        });
        
        // Process the stream
        for await (const chunk of stream) {
          // Check if the user has interrupted
          if (abortControllerRef.current?.signal.aborted) {
            console.log('Response generation aborted by user');
            break;
          }
          
          // Append chunk to response
          mentorResponse += chunk;
          
          // Update state with partial response
          setState(prev => ({ ...prev, mentorText: mentorResponse }));
        }
      } else {
        // Use backend API (non-streaming)
        mentorResponse = await generateChatCompletion(messages);
        setState(prev => ({ ...prev, mentorText: mentorResponse }));
      }
      
      // Add mentor message to history
      addMessage({
        role: 'mentor',
        content: mentorResponse,
        timestamp: Date.now(),
      });
      
      // Generate and play audio
      await generateAndPlayAudio(mentorResponse, speakerId);
      
      // Reset flag
      isGeneratingResponseRef.current = false;
      setState(prev => ({ ...prev, isProcessing: false }));
    } catch (error) {
      console.error('Error generating mentor response:', error);
      setState(prev => ({
        ...prev,
        isProcessing: false,
        isError: true,
        errorMessage: error instanceof Error 
          ? error.message 
          : 'Failed to generate mentor response',
      }));
      
      // Reset flags
      isGeneratingResponseRef.current = false;
      setIsSpeaking(false);
    }
  }, [currentMentor, history, addMessage, setIsSpeaking, opts.historyWindowSize, shouldUseDirectApi]);
  
  // Generate and play audio response
  const generateAndPlayAudio = useCallback(async (text: string, speakerId: number) => {
    try {
      // Set flag to indicate we're streaming TTS
      isStreamingTTSRef.current = true;
      
      // Prepare context for continuity of voice
      const context = await Promise.all(
        history
          .filter(msg => msg.role === 'mentor')
          .slice(-3) // Only use last 3 mentor messages for context
          .map(async (msg) => {
            // In a real implementation, we'd have the audio data stored with the message
            // For now, we'll use placeholder base64 data
            return {
              text: msg.content,
              speaker: speakerId,
              audio: 'placeholder-base64-audio' // This would be real audio data in production
            };
          })
      );
      
      // Generate speech audio
      const audioBlob = await generateSpeech(text, speakerId, context);
      
      // Play the audio
      await playAudio(audioBlob);
      
      // Reset speaking state when audio finishes
      setIsSpeaking(false);
      
      // Reset flag
      isStreamingTTSRef.current = false;
    } catch (error) {
      console.error('Error generating and playing audio:', error);
      setIsSpeaking(false);
      
      // Reset flag
      isStreamingTTSRef.current = false;
      
      // Only report the error if we're not aborting intentionally
      if (!abortControllerRef.current?.signal.aborted) {
        setState(prev => ({
          ...prev,
          isError: true,
          errorMessage: error instanceof Error 
            ? error.message 
            : 'Failed to generate speech',
        }));
      }
    }
  }, [history, setIsSpeaking]);
  
  // Toggle listening (start/stop)
  const toggleListening = useCallback(async () => {
    if (isRecording) {
      await stopListening();
    } else {
      await startListening();
    }
  }, [isRecording, startListening, stopListening]);
  
  // Interrupt the current mentor response
  const interruptMentor = useCallback(() => {
    // Only interrupt if mentor is speaking
    if (!isSpeaking) return;
    
    console.log('Interrupting mentor response');
    
    // Abort current operations
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Reset speaking state
    setIsSpeaking(false);
    
    // Reset flags
    isGeneratingResponseRef.current = false;
    isStreamingTTSRef.current = false;
    
    // Clean up
    cleanupResources();
  }, [isSpeaking, setIsSpeaking, cleanupResources]);
  
  // Auto-start if enabled
  useEffect(() => {
    if (opts.autoStart) {
      startListening();
    }
    
    return cleanupResources;
  }, [opts.autoStart, startListening, cleanupResources]);
  
  // Return the API
  return {
    ...state,
    audioLevel,
    isRecording,
    isSpeaking,
    isListening,
    startListening,
    stopListening,
    toggleListening,
    interruptMentor,
  };
} 