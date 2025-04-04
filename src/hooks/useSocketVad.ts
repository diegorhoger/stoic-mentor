/**
 * useSocketVad.ts
 * 
 * React hook for integrating the WebSocket-based VAD service with microphone input.
 * This hook provides real-time Voice Activity Detection through the backend service.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import socketVadService, { 
  SocketVadEvent,
  VadConfig,
  VadResult,
  SpeechStartEvent,
  SpeechEndEvent,
  NoiseProfile,
  VadInitializedEvent,
  CalibrationCompleteEvent
} from '../services/socketVadService';

interface UseSocketVadOptions {
  /** Auto-connect on mount */
  autoConnect?: boolean;
  /** Auto-initialize VAD on connection */
  autoInit?: boolean;
  /** Debug mode */
  debug?: boolean;
  /** Callback fired when the speaking state changes */
  onSpeakingChange?: (isSpeaking: boolean) => void;
  /** Initial configuration for the VAD system */
  initialConfig?: VadConfig;
  /** Audio processing options */
  audioOptions?: {
    /** Process frames every N milliseconds */
    processingIntervalMs?: number;
    /** Use AudioWorklet for processing (if available) */
    useAudioWorklet?: boolean;
  };
}

interface UseSocketVadResult {
  /** Whether we're connected to the WebSocket server */
  isConnected: boolean;
  /** Whether we have an active VAD session */
  isSessionActive: boolean;
  /** Whether the user is currently speaking */
  isSpeaking: boolean;
  /** Latest audio level (0-1) */
  audioLevel: number;
  /** Current threshold value for speech detection */
  threshold: number;
  /** Current session ID */
  sessionId: string | null;
  /** Latest noise profile from the VAD system */
  noiseProfile: NoiseProfile | null;
  /** Connect to the WebSocket server */
  connect: () => Promise<boolean>;
  /** Disconnect from the WebSocket server */
  disconnect: () => void;
  /** Initialize a new VAD session */
  initVad: () => Promise<string | null>;
  /** Start audio processing */
  startAudioProcessing: () => Promise<boolean>;
  /** Stop audio processing */
  stopAudioProcessing: () => void;
  /** Force recalibration of the VAD system */
  forceRecalibration: () => void;
  /** Update VAD configuration */
  updateConfig: (config: VadConfig) => void;
}

/**
 * Hook for integrating the WebSocket-based VAD service with microphone input
 */
export function useSocketVad(options: UseSocketVadOptions = {}): UseSocketVadResult {
  // Default options
  const {
    autoConnect = true,
    autoInit = true,
    debug = false,
    onSpeakingChange,
    initialConfig,
    audioOptions = {
      processingIntervalMs: 100,
      useAudioWorklet: false
    }
  } = options;

  // State
  const [isConnected, setIsConnected] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [threshold, setThreshold] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [noiseProfile, setNoiseProfile] = useState<NoiseProfile | null>(null);

  // Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const audioProcessingTimerRef = useRef<number | null>(null);
  const isProcessingAudioRef = useRef(false);

  // Debug logging
  const log = useCallback((message: string, ...args: unknown[]) => {
    if (debug) {
      console.log(`[useSocketVad] ${message}`, ...args);
    }
  }, [debug]);

  // Connect to WebSocket server
  const connect = useCallback(async (): Promise<boolean> => {
    socketVadService.setDebug(debug);
    const connected = await socketVadService.connect();
    setIsConnected(connected);
    return connected;
  }, [debug]);

  // Disconnect from WebSocket server
  const disconnect = useCallback(() => {
    socketVadService.disconnect();
    setIsConnected(false);
    setIsSessionActive(false);
    setSessionId(null);
  }, []);

  // Initialize VAD session
  const initVad = useCallback(async (): Promise<string | null> => {
    if (!isConnected) {
      const connected = await connect();
      if (!connected) {
        log('Failed to connect to WebSocket server');
        return null;
      }
    }

    const newSessionId = await socketVadService.initVad();
    
    if (newSessionId) {
      setSessionId(newSessionId);
      setIsSessionActive(true);
      
      // Apply initial configuration if provided
      if (initialConfig) {
        socketVadService.updateConfig(initialConfig);
      }
    } else {
      setIsSessionActive(false);
    }
    
    return newSessionId;
  }, [isConnected, connect, initialConfig, log]);

  // Initialize audio processing
  const initAudio = useCallback(async (): Promise<boolean> => {
    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      // Create audio context
      const AudioContext = window.AudioContext || ((window as unknown) as {webkitAudioContext: AudioContext}).webkitAudioContext;
      const audioContext = new AudioContext();
      
      // Create audio nodes
      const sourceNode = audioContext.createMediaStreamSource(stream);
      const analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 2048;
      analyserNode.smoothingTimeConstant = 0.8;
      
      // Connect nodes
      sourceNode.connect(analyserNode);
      
      // Use ScriptProcessor for now (AudioWorklet support to be added later)
      const processorNode = audioContext.createScriptProcessor(4096, 1, 1);
      
      // Store references
      audioContextRef.current = audioContext;
      micStreamRef.current = stream;
      sourceNodeRef.current = sourceNode;
      analyserNodeRef.current = analyserNode;
      processorNodeRef.current = processorNode;
      
      return true;
    } catch (error) {
      log('Error initializing audio:', error);
      return false;
    }
  }, [log]);

  // Process audio data
  const processAudioData = useCallback(() => {
    const analyserNode = analyserNodeRef.current;
    
    if (!analyserNode || !isProcessingAudioRef.current) return;
    
    // Get audio data
    const dataArray = new Float32Array(analyserNode.fftSize);
    analyserNode.getFloatTimeDomainData(dataArray);
    
    // Calculate RMS level
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sum / dataArray.length);
    
    // Update state
    setAudioLevel(rms);
    
    // Send to WebSocket VAD service
    if (isSessionActive) {
      socketVadService.processAudioData(dataArray);
    }
  }, [isSessionActive]);

  // Start audio processing
  const startAudioProcessing = useCallback(async (): Promise<boolean> => {
    if (isProcessingAudioRef.current) {
      log('Audio processing already started');
      return true;
    }
    
    if (!audioContextRef.current) {
      const initialized = await initAudio();
      if (!initialized) {
        log('Failed to initialize audio');
        return false;
      }
    }
    
    // Start processing
    isProcessingAudioRef.current = true;
    
    // Process audio data at regular intervals
    audioProcessingTimerRef.current = window.setInterval(() => {
      processAudioData();
    }, audioOptions.processingIntervalMs);
    
    return true;
  }, [initAudio, processAudioData, audioOptions.processingIntervalMs, log]);

  // Stop audio processing
  const stopAudioProcessing = useCallback(() => {
    if (!isProcessingAudioRef.current) return;
    
    // Clear processing timer
    if (audioProcessingTimerRef.current !== null) {
      clearInterval(audioProcessingTimerRef.current);
      audioProcessingTimerRef.current = null;
    }
    
    // Disconnect and clean up audio nodes
    if (processorNodeRef.current) {
      processorNodeRef.current.disconnect();
    }
    
    isProcessingAudioRef.current = false;
    
    // Reset state
    setAudioLevel(0);
  }, []);

  // Force recalibration
  const forceRecalibration = useCallback(() => {
    if (isSessionActive) {
      socketVadService.forceRecalibration();
    }
  }, [isSessionActive]);

  // Update VAD configuration
  const updateConfig = useCallback((config: VadConfig) => {
    if (isSessionActive) {
      socketVadService.updateConfig(config);
    }
  }, [isSessionActive]);

  // Set up event listeners
  useEffect(() => {
    // Register event handlers
    
    // Handle VAD results
    const handleVadResult = (result: VadResult) => {
      setAudioLevel(result.rms_level);
      setThreshold(result.threshold);
    };
    
    // Handle speech start
    const handleSpeechStart = (event: SpeechStartEvent) => {
      log('Speech start detected:', event);
      setIsSpeaking(true);
      if (onSpeakingChange) {
        onSpeakingChange(true);
      }
    };
    
    // Handle speech end
    const handleSpeechEnd = (event: SpeechEndEvent) => {
      log('Speech end detected:', event);
      setIsSpeaking(false);
      if (onSpeakingChange) {
        onSpeakingChange(false);
      }
    };
    
    // Register event handlers
    socketVadService.on(SocketVadEvent.VAD_RESULT, handleVadResult);
    socketVadService.on(SocketVadEvent.SPEECH_START, handleSpeechStart);
    socketVadService.on(SocketVadEvent.SPEECH_END, handleSpeechEnd);
    
    // Update state when session changes
    socketVadService.on(SocketVadEvent.VAD_INITIALIZED, (data: VadInitializedEvent) => {
      setNoiseProfile(data.noise_profile);
    });
    
    // Update noise profile when calibration completes
    socketVadService.on(SocketVadEvent.CALIBRATION_COMPLETE, (data: CalibrationCompleteEvent) => {
      setNoiseProfile(data.noise_profile);
    });
    
    // Clean up event listeners on unmount
    return () => {
      socketVadService.off(SocketVadEvent.VAD_RESULT, handleVadResult);
      socketVadService.off(SocketVadEvent.SPEECH_START, handleSpeechStart);
      socketVadService.off(SocketVadEvent.SPEECH_END, handleSpeechEnd);
    };
  }, [log, onSpeakingChange]);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect().then(connected => {
        if (connected && autoInit) {
          initVad();
        }
      });
    }
    
    // Clean up on unmount
    return () => {
      stopAudioProcessing();
      
      // Close audio context
      if (audioContextRef.current?.state !== 'closed') {
        audioContextRef.current?.close();
      }
      
      // Stop microphone stream
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(track => track.stop());
      }
      
      // Don't disconnect from WebSocket when component unmounts
      // This prevents connection cycling issues during component rerendering
      // disconnect();
    };
  }, [autoConnect, autoInit, connect, initVad, stopAudioProcessing, disconnect]);

  // Update connected and session status when socket status changes
  useEffect(() => {
    const updateStatus = () => {
      setIsConnected(socketVadService.isSocketConnected());
      setIsSessionActive(socketVadService.hasActiveSession());
      setIsSpeaking(socketVadService.getIsSpeaking());
    };
    
    // Update status initially
    updateStatus();
    
    // Update status when connection state changes
    socketVadService.on(SocketVadEvent.CONNECTED, updateStatus);
    
    // Set up listeners for speaking events
    const handleVadResult = (data: VadResult) => {
      setAudioLevel(data.rms_level);
      setThreshold(data.threshold);
      setIsSpeaking(data.is_speech);
      
      // Fire the callback if provided
      if (onSpeakingChange && data.is_speech !== isSpeaking) {
        onSpeakingChange(data.is_speech);
      }
    };
    
    const handleSpeechStart = (data: SpeechStartEvent) => {
      console.log('[useSocketVad] Speech start event received', data);
      setIsSpeaking(true);
      if (onSpeakingChange) {
        onSpeakingChange(true);
      }
    };
    
    const handleSpeechEnd = (data: SpeechEndEvent) => {
      console.log('[useSocketVad] Speech end event received', data);
      setIsSpeaking(false);
      if (onSpeakingChange) {
        onSpeakingChange(false);
      }
    };
    
    socketVadService.on(SocketVadEvent.VAD_RESULT, handleVadResult);
    socketVadService.on(SocketVadEvent.SPEECH_START, handleSpeechStart);
    socketVadService.on(SocketVadEvent.SPEECH_END, handleSpeechEnd);
    
    return () => {
      socketVadService.off(SocketVadEvent.CONNECTED, updateStatus);
      socketVadService.off(SocketVadEvent.VAD_RESULT, handleVadResult);
      socketVadService.off(SocketVadEvent.SPEECH_START, handleSpeechStart);
      socketVadService.off(SocketVadEvent.SPEECH_END, handleSpeechEnd);
    };
  }, [isSpeaking, onSpeakingChange]);

  return {
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
  };
} 