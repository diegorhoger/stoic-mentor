import { useState, useCallback, useRef, useEffect } from 'react';
import { useMicStream } from './useMicStream';
import { useSocketVad } from './useSocketVad';
import { useSessionStore } from '../state/sessionStore';
import { transcribeAudio } from '../services/whisperService';
import { 
  createSystemPrompt, 
  streamChatCompletionWithOpenAI, 
  sanitizeResponse,
  ChatMessage
} from '../services/openaiService';
import { 
  generateSpeech,
  playAudio
} from '../services/ttsService';
import { MentorKey, Mentor } from '../types';
import { generateResponse } from '../services/api';
import { MENTOR_PERSONALITIES } from '../constants/app';

export interface MentorCallOptions {
  enableVoiceActivity?: boolean;    // Enable voice activity detection for interruptions
  autoStart?: boolean;              // Auto start listening when hook mounts
  maxSilenceMs?: number;            // Maximum silence before considering the user done speaking
  immediateTranscription?: boolean; // Transcribe immediately as user speaks
  historyWindowSize?: number;       // Number of previous exchanges to keep in context
  useSocketVad?: boolean;           // Whether to use WebSocket-based VAD instead of local processing
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
 * 
 */
export function useMentorCallEngine(options: MentorCallOptions = {}) {
  
  // Default options
  const defaultOptions: Required<MentorCallOptions> = {
    enableVoiceActivity: true,
    autoStart: false,
    maxSilenceMs: 1500,
    immediateTranscription: false,
    historyWindowSize: 3,
    useSocketVad: true,         // Default to using WebSocket VAD
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
    audioLevel: micAudioLevel, 
    startRecording, 
    stopRecording, 
    getAudioBlob 
  } = useMicStream();
  
  // Initialize the useSocketVad hook with our settings
  const {
    isConnected: isSocketVadConnected,
    isSessionActive: isSocketVadSessionActive,
    isSpeaking: isSocketVadDetectingSpeech,
    audioLevel: socketVadAudioLevel,
    threshold: socketVadThreshold,
    connect: connectSocketVad,
    startAudioProcessing: startSocketVadProcessing,
    stopAudioProcessing: stopSocketVadProcessing,
    forceRecalibration: recalibrateSocketVad,
    disconnect: disconnectSocketVad
  } = useSocketVad({
    autoConnect: false,  // We'll manage the connection ourselves
    autoInit: false,     // We'll initialize when needed
    debug: true,
    onSpeakingChange: (isSpeaking) => {
      console.log(`[VAD] Speech state changed: ${isSpeaking ? 'SPEAKING' : 'SILENT'}`);
    }
  });
  
  // Combine audio levels
  const audioLevel = opts.useSocketVad ? socketVadAudioLevel : micAudioLevel;
  
  // Track VAD state
  const [isVADActive, setIsVADActive] = useState(false);
  
  // Debug state
  const [debugState, setDebugState] = useState({
    vadConnectionStatus: false,
    vadSessionStatus: false,
    vadActive: false,
    vadSpeakingStatus: false,
  });
  
  // Local state
  const [state, setState] = useState<MentorCallState>({
    userText: '',
    mentorText: '',
    isProcessing: false,
    isError: false,
    errorMessage: null,
  });
  
  // Check if we should use direct OpenAI integration or backend API
  // Force direct API usage regardless of environment variable
  const shouldUseDirectApi = true; // useDirectOpenAI();
  console.log('🔍 Direct API check in useMentorCallEngine:');
  console.log('🔍 shouldUseDirectApi:', shouldUseDirectApi);
  console.log('🔍 Environment var:', import.meta.env.VITE_USE_DIRECT_OPENAI);
  console.log('🔍 Environment var type:', typeof import.meta.env.VITE_USE_DIRECT_OPENAI);
  
  // Refs to maintain state between renders
  const abortControllerRef = useRef<AbortController | null>(null);
  const silenceTimeoutRef = useRef<number | null>(null);
  const responseTimeoutRef = useRef<number | null>(null);
  const isGeneratingResponseRef = useRef(false);
  const isStreamingTTSRef = useRef(false);
  const previousSilenceStateRef = useRef(false);
  
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
    
    // Stop VAD processing if using socket VAD
    if (opts.useSocketVad) {
      stopSocketVadProcessing();
    }
  }, [opts.useSocketVad, stopSocketVadProcessing]);
  
  // Function to end a call completely
  const endCall = useCallback(() => {
    stopRecording();
    cleanupResources();
    
    // If using socket VAD, disconnect it
    if (opts.useSocketVad) {
      disconnectSocketVad();
    }
    
    setIsVADActive(false);
    setIsListening(false);
    setIsSpeaking(false);
  }, [cleanupResources, disconnectSocketVad, opts.useSocketVad, setIsListening, setIsSpeaking, stopRecording]);
  
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
      
      // Connect and initialize VAD if using WebSocket VAD
      if (opts.useSocketVad) {
        console.log('[useMentorCallEngine] Connecting to WebSocket VAD');
        const connected = await connectSocketVad();
        if (!connected) {
          throw new Error("Failed to connect to WebSocket VAD service");
        }
        
        // Start audio processing with the WebSocket VAD
        console.log('[useMentorCallEngine] Starting WebSocket VAD audio processing');
        const started = await startSocketVadProcessing();
        if (!started) {
          throw new Error("Failed to start microphone recording for WebSocket VAD");
        }
        
        setIsVADActive(true);
      }
      
      // Start recording
      const success = await startRecording();
      if (!success) {
        // Handle microphone permission errors
        if (navigator.permissions) {
          const micPermission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          if (micPermission.state === 'denied') {
            throw new Error("Microphone access was denied. Please allow microphone access in your browser settings.");
          }
        }
        
        // Generic microphone error
        throw new Error("Could not start microphone. It may be in use by another application.");
      }
    } catch (error) {
      console.error('Error starting listening:', error);
      setState(prev => ({
        ...prev,
        isError: true,
        errorMessage: error instanceof Error 
          ? error.message 
          : 'Failed to access microphone',
      }));
      
      // Clean up if there was an error
      cleanupResources();
    }
  }, [startRecording, connectSocketVad, startSocketVadProcessing, opts.useSocketVad, cleanupResources]);
  
  // Stop listening and process audio
  const stopListening = useCallback(async () => {
    try {
      // Stop recording
      stopRecording();
      
      // Also stop socket VAD processing if using it
      if (opts.useSocketVad) {
        console.log('[useMentorCallEngine] Stopping WebSocket VAD audio processing');
        stopSocketVadProcessing();
        setIsVADActive(false);
      }
      
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
  }, [stopRecording, getAudioBlob, opts.useSocketVad, stopSocketVadProcessing]);
  
  // Process audio: transcribe, generate response, and play
  const processAudio = useCallback(async (audioBlob: Blob) => {
    try {
      // Create an abort controller for this operation
      abortControllerRef.current = new AbortController();
      
      console.log('🔎 PROCESS AUDIO DEBUGGING - Starting processAudio function with blob size:', audioBlob.size);
      
      // Transcribe audio to text
      console.log('🔎 PROCESS AUDIO DEBUGGING - About to call transcribeAudio function');
      const transcriptionOptions = {
        language: 'en',
        prompt: 'This is a conversation about Stoic philosophy and philosophical guidance.',
        temperature: 0.2,
      };
      
      let transcription = '';
      
      try {
        transcription = await transcribeAudio(audioBlob, transcriptionOptions);
        console.log('🔎 PROCESS AUDIO DEBUGGING - Transcription successful:', transcription);
        console.log('🔎 PROCESS AUDIO DEBUGGING - Transcription length:', transcription.length);
      } catch (error) {
        console.error('🔎 PROCESS AUDIO DEBUGGING - Transcription failed, using fallback method:', error);
        // Fallback - if no transcription, use a default message
        // This ensures the conversation can continue even if transcription fails
        transcription = "I'd like to discuss Stoic philosophy.";
        console.log('🔎 PROCESS AUDIO DEBUGGING - Using fallback transcription');
      }
      
      // Update state with transcription
      setState(prev => ({ ...prev, userText: transcription }));
      console.log('🔎 PROCESS AUDIO DEBUGGING - Updated state with user text');
      
      // Add user message to history
      addMessage({
        role: 'user',
        content: transcription,
        timestamp: Date.now(),
      });
      console.log('🔎 PROCESS AUDIO DEBUGGING - Added user message to history');
      
      console.log('🔎 PROCESS AUDIO DEBUGGING - *** CRITICAL HANDOFF POINT ***');
      console.log('🔎 PROCESS AUDIO DEBUGGING - About to call generateMentorResponse with text:', transcription);
      
      // Generate mentor response
      console.log('🔎 PROCESS AUDIO DEBUGGING - Calling generateMentorResponse now');
      
      // INLINE DEFINITION OF generateMentorResponse - This ensures we always use the current value of currentMentor
      // ============================================================================================
      // Get the latest mentor information directly from the store
      const sessionState = useSessionStore.getState(); 
      const mentorKey = sessionState.currentMentor as MentorKey;
      console.log(`🔍 CRITICAL DEBUG - Using mentor key from store: ${mentorKey}`);
      
      if (!transcription) {
        console.log(`🔍 FLOW TRACE [generateMentorResponse] - Empty text, skipping`);
        return;
      }

      if (isGeneratingResponseRef.current) {
        console.log(`🔍 FLOW TRACE [generateMentorResponse] - Already generating, skipping`);
        return;
      }

      try {
        isGeneratingResponseRef.current = true;
        console.log(`🔍 FLOW TRACE [generateMentorResponse] - Set isGeneratingResponse = true`);
        
        // Force checking current mentor from the store again
        const freshSessionState = useSessionStore.getState();
        const freshMentorKey = freshSessionState.currentMentor as MentorKey;
        console.log(`🔍 CRITICAL DEBUG - Double-checked mentor key: ${freshMentorKey}`);
        
        // Get the full mentor name and details from the constants
        const mentorDetails = MENTOR_PERSONALITIES[freshMentorKey];
        if (!mentorDetails) {
          console.error(`🔍 FLOW TRACE [generateMentorResponse] - Invalid mentor key: ${freshMentorKey}`);
          return;
        }
        
        const mentorName = mentorDetails.name; // This will be the full name like "Marcus Aurelius"
        console.log(`🔍 FLOW TRACE [generateMentorResponse] - Selected mentor key: ${freshMentorKey}, full name: ${mentorName}`);

        if (!freshMentorKey) {
          console.error(`🔍 FLOW TRACE [generateMentorResponse] - No mentor selected!`);
          return;
        }

        setIsSpeaking(true);
        console.log(`🔍 FLOW TRACE [generateMentorResponse] - Set isSpeaking = true`);

        // Record user message
        const userMessage: ChatMessage = {
          role: 'user',
          content: transcription,
        };
        console.log(`🔍 FLOW TRACE [generateMentorResponse] - Created user message: ${userMessage.content.substring(0, 30)}...`);

        // Note: The user message was already added to the history earlier in the processAudio function
        // We don't need to add it again to avoid duplicates
        // Comment out or remove the duplicate addMessage call:
        // addMessage({
        //   role: 'user',
        //   content: transcription,
        //   timestamp: Date.now(),
        // });
        // console.log(`🔍 FLOW TRACE [generateMentorResponse] - Added user message to messages state`);

        let mentorResponseContent = '';

        // Now we can pass the full mentor name to createSystemPrompt
        const systemPrompt = createSystemPrompt(mentorName);
        console.log(`🔍 FLOW TRACE [generateMentorResponse] - Created system prompt: ${systemPrompt.substring(0, 50)}...`);

        const conversationHistory: ChatMessage[] = history
          .slice(-opts.historyWindowSize * 2) // Get the last n exchanges (2 messages per exchange)
          .map(msg => ({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content
          }));
        console.log(`🔍 FLOW TRACE [generateMentorResponse] - Conversation history length: ${conversationHistory.length}`);

        if (shouldUseDirectApi) {
          console.log(`🔍 FLOW TRACE [generateMentorResponse] - Using Direct API (shouldUseDirectApi=true)`);
          try {
            // Use the full mentor name from MENTOR_PERSONALITIES
            const mentorObject = { 
              name: mentorName
            };
            
            console.log(`🔍 FLOW TRACE [generateMentorResponse] - Using mentor object:`, mentorObject);
            
            // Extract conversation history as string array for the API
            // Make sure we use the current mentor name in the conversation history, not old ones
            const conversationHistoryStrings = conversationHistory.map(msg => {
              if (msg.role === 'user') {
                return `User: ${msg.content}`;
              } else {
                // Ensure assistant messages are attributed to the current mentor
                return `${mentorName}: ${msg.content}`;
              }
            });
            
            console.log(`🔍 FLOW TRACE [generateMentorResponse] - Formatted conversation history with current mentor name: ${mentorName}`);
            
            // Using API with conversation history
            mentorResponseContent = await generateResponse(transcription, mentorObject, conversationHistoryStrings);
            console.log(`🔍 FLOW TRACE [generateMentorResponse] - Received response from generateResponse, length: ${mentorResponseContent.length}`);
            console.log(`🔍 FLOW TRACE [generateMentorResponse] - Response content (first 100 chars): "${mentorResponseContent.substring(0, 100)}..."`);
          } catch (error) {
            console.error(`🔍 FLOW TRACE [generateMentorResponse] - Error from generateResponse:`, error);
          }
        } else {
          console.log(`🔍 FLOW TRACE [generateMentorResponse] - Using Streaming API (shouldUseDirectApi=false)`);
          // Using streaming API
          const allMessages: ChatMessage[] = [
            { role: 'system', content: systemPrompt },
            ...conversationHistory,
            userMessage,
          ];

          try {
            const stream = streamChatCompletionWithOpenAI(allMessages, {
              temperature: 0.7,
              model: 'gpt-4',
            });

            if (stream) {
              await stream.closed;
              console.log(`🔍 FLOW TRACE [generateMentorResponse] - Stream closed successfully`);
            } else {
              console.error(`🔍 FLOW TRACE [generateMentorResponse] - No stream returned from streamChatCompletionWithOpenAI`);
            }
          } catch (error) {
            console.error(`🔍 FLOW TRACE [generateMentorResponse] - Error in streaming response:`, error);
          }
        }

        if (shouldUseDirectApi && mentorResponseContent) {
          console.log(`🔍 FLOW TRACE [generateMentorResponse] - Processing direct API response`);
          // If we received a mentor response from the direct API, add it to messages
          const mentorMessage: ChatMessage = {
            role: 'assistant',
            content: mentorResponseContent,
            timestamp: Date.now(),
          };

          console.log(`🔍 FLOW TRACE [generateMentorResponse] - Created mentor message: ${mentorMessage.content.substring(0, 100)}...`);
          console.log(`🔍 FLOW TRACE [generateMentorResponse] - Message content BEFORE sanitization: "${mentorMessage.content.substring(0, 100)}..."`);
          
          // Apply sanitization again as a safety measure
          mentorMessage.content = sanitizeResponse(mentorMessage.content);
          console.log(`🔍 FLOW TRACE [generateMentorResponse] - Message content AFTER sanitization: "${mentorMessage.content.substring(0, 100)}..."`);
          
          // Check for acknowledgment phrases that might have survived
          if (hasAcknowledgmentPhrases(mentorMessage.content)) {
            console.error(`🔍 FLOW TRACE [generateMentorResponse] - ⚠️ WARNING: Acknowledgment phrases detected after sanitization!`);
          }
          
          addMessage(mentorMessage);
          console.log(`🔍 FLOW TRACE [generateMentorResponse] - Added mentor message to messages state`);

          // Generate audio for the mentor's response
          if (mentorResponseContent) {
            console.log(`🔍 FLOW TRACE [generateMentorResponse] - Generating audio for response`);
            
            // Map mentor to correct speaker ID
            const speakerId = freshMentorKey === 'marcus' ? 0 : freshMentorKey === 'seneca' ? 1 : 2;
            console.log(`🔍 FLOW TRACE [generateMentorResponse] - Using speaker ID: ${speakerId} for ${freshMentorKey}`);
            
            const audioBlob = await generateSpeech(mentorResponseContent, speakerId, []);
            if (audioBlob) {
              console.log(`🔍 FLOW TRACE [generateMentorResponse] - Audio generated successfully: ${audioBlob.size} bytes`);
              await playAudio(audioBlob);
              console.log(`🔍 FLOW TRACE [generateMentorResponse] - Audio played successfully`);
            } else {
              console.error(`🔍 FLOW TRACE [generateMentorResponse] - Failed to generate audio`);
            }
          }
        }
      } catch (error) {
        console.error(`🔍 FLOW TRACE [generateMentorResponse] - Unhandled error:`, error);
      } finally {
        isGeneratingResponseRef.current = false;
        setIsSpeaking(false);
        console.log(`🔍 FLOW TRACE [generateMentorResponse] - Reset isGeneratingResponse and isSpeaking to false`);
      }
      // ============================================================================================
      
      console.log('🔎 PROCESS AUDIO DEBUGGING - Returned from generateMentorResponse');
    } catch (error) {
      console.error('🔎 PROCESS AUDIO DEBUGGING - Unhandled error in processAudio:', error);
      setState(prev => ({
        ...prev,
        isProcessing: false,
        isError: true,
        errorMessage: error instanceof Error 
          ? error.message 
          : 'Failed to process audio',
      }));
    }
  }, [addMessage, history, opts.historyWindowSize, setIsSpeaking, shouldUseDirectApi]);
  
  // Helper function to detect acknowledgment phrases
  const hasAcknowledgmentPhrases = (text: string): boolean => {
    const lowerText = text.toLowerCase();
    const phrases = [
      "i understand what you're saying",
      "i understand what you are saying",
      "i see what you're saying",
      "i see what you are saying",
      "i understand your question",
      "let me think about that",
      "i appreciate your question",
      "thank you for your question",
      "i understand you're asking",
      "i understand you are asking"
    ];
    
    return phrases.some(phrase => lowerText.includes(phrase));
  };
  
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
  
  // Monitor WebSocket VAD for silence detection
  useEffect(() => {
    // Only set up silence detection if using socket VAD and currently recording
    if (!opts.useSocketVad || !isRecording) return;
    
    // Check if we have a change from speaking to silent
    const isSilent = !isSocketVadDetectingSpeech;
    const wasSpokenBefore = !previousSilenceStateRef.current;
    const silenceJustStarted = isSilent && wasSpokenBefore;
    
    console.log(`[VAD] Current state - isSilent: ${isSilent}, wasSpokenBefore: ${wasSpokenBefore}, silenceJustStarted: ${silenceJustStarted}, isRecording: ${isRecording}`);
    
    // Update the previous silence state
    previousSilenceStateRef.current = isSilent;
    
    // If silence just started, set a timer to stop recording after configured timeout
    if (silenceJustStarted && isRecording) {
      console.log(`[VAD] Silence detected, waiting ${opts.maxSilenceMs}ms before stopping...`);
      
      // Clear any existing timeout
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }
      
      // Set new timeout to stop listening after silence threshold
      silenceTimeoutRef.current = window.setTimeout(() => {
        console.log('[VAD] Silence timeout reached, stopping recording');
        if (isRecording) {
          stopListening();
        }
        silenceTimeoutRef.current = null;
      }, opts.maxSilenceMs);
    }
    
    // If the user was silent and now is speaking again, cancel any pending silence timeout
    if (!isSilent && silenceTimeoutRef.current) {
      console.log('[VAD] Speech detected, canceling silence timeout');
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    
    // Cleanup timeout on unmount or dependency change
    return () => {
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }
    };
  }, [
    opts.useSocketVad, 
    opts.maxSilenceMs, 
    isRecording, 
    isSocketVadDetectingSpeech, 
    stopListening
  ]);
  
  // Log and respond to mentor changes
  useEffect(() => {
    console.log(`🔍 MENTOR CHANGE DETECTED - Current mentor is now: ${currentMentor}`);
    
    // Reset state when mentor changes to ensure fresh conversations
    setState(prev => ({
      ...prev,
      userText: '',
      mentorText: '',
      isError: false,
      errorMessage: null,
    }));
    
    // Abort any ongoing operations
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Reset flags
    isGeneratingResponseRef.current = false;
    isStreamingTTSRef.current = false;
    
  }, [currentMentor]);
  
  // Listen for custom mentor-changed events
  useEffect(() => {
    const handleMentorChanged = (event: Event) => {
      const customEvent = event as CustomEvent;
      const newMentor = customEvent.detail?.mentor;
      console.log(`🔍 MENTOR-CHANGED EVENT - Detected mentor change to: ${newMentor}`);
      
      // Force check against the store
      const storeState = useSessionStore.getState();
      console.log(`🔍 MENTOR-CHANGED EVENT - Current store state has mentor: ${storeState.currentMentor}`);
    };
    
    window.addEventListener('mentor-changed', handleMentorChanged);
    
    return () => {
      window.removeEventListener('mentor-changed', handleMentorChanged);
    };
  }, []);
  
  // Update debug state
  useEffect(() => {
    setDebugState({
      vadConnectionStatus: isSocketVadConnected,
      vadSessionStatus: isSocketVadSessionActive, 
      vadActive: isVADActive,
      vadSpeakingStatus: isSocketVadDetectingSpeech,
    });
    
    console.log(`[VAD DEBUG] Connection: ${isSocketVadConnected ? 'YES' : 'NO'}, ` +
                `Session: ${isSocketVadSessionActive ? 'ACTIVE' : 'INACTIVE'}, ` + 
                `VAD Active: ${isVADActive ? 'YES' : 'NO'}, ` +
                `Speaking: ${isSocketVadDetectingSpeech ? 'YES' : 'SILENT'}`);
                
  }, [isSocketVadConnected, isSocketVadSessionActive, isVADActive, isSocketVadDetectingSpeech]);
  
  // Initialize WebSocket VAD when the component mounts
  useEffect(() => {
    if (opts.useSocketVad) {
      console.log('[useMentorCallEngine] Initializing WebSocket VAD on mount');
      connectSocketVad().then(connected => {
        console.log(`[useMentorCallEngine] WebSocket VAD connection ${connected ? 'successful' : 'failed'}`);
      });
    }
    
    return () => {
      if (opts.useSocketVad) {
        disconnectSocketVad();
      }
    };
  }, [opts.useSocketVad, connectSocketVad, disconnectSocketVad]);
  
  // Return the API
  return {
    ...state,
    audioLevel,
    isRecording,
    isSpeaking,
    isListening,
    isVADActive,
    startListening,
    stopListening,
    toggleListening,
    interruptMentor,
    endCall,
    // Debug info for WebSocket VAD
    vadDebugState: debugState,
    isSocketVadConnected,
    isSocketVadSessionActive,
    isSocketVadDetectingSpeech
  };
} 