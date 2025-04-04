/**
 * Socket-based Voice Activity Detection (VAD) Service
 * 
 * This service manages WebSocket connections to the backend VAD service,
 * handling audio streaming, speech detection events, and configuration.
 */

import { io, Socket } from 'socket.io-client';
import { API_ENDPOINTS } from '../constants/app';

// Event types
export enum SocketVadEvent {
  CONNECTED = 'connected',
  VAD_INITIALIZED = 'vad_initialized',
  VAD_RESULT = 'vad_result',
  SPEECH_START = 'speech_start',
  SPEECH_END = 'speech_end',
  CALIBRATION_STARTED = 'calibration_started',
  CALIBRATION_COMPLETE = 'calibration_complete',
  CONFIG_UPDATED = 'config_updated',
  DEBUG_STATE = 'debug_state',
  ERROR = 'error'
}

// Types for event data
export interface NoiseProfile {
  noiseFloor: number;
  stdDev: number;
  samples: number[];
  sensitivityFactor: number;
  lastCalibrationTime: number;
  calibrationComplete: boolean;
}

export interface VadResult {
  is_speech: boolean;
  rms_level: number;
  threshold: number;
  timestamp: number;
  session_id: string;
}

export interface SpeechStartEvent {
  event: 'speech_start';
  timestamp: number;
  confidence: number;
  session_id: string;
}

export interface SpeechEndEvent {
  event: 'speech_end';
  timestamp: number;
  duration_ms: number;
  session_id: string;
}

export interface CalibrationStartedEvent {
  session_id: string;
  timestamp: number;
}

export interface CalibrationCompleteEvent {
  session_id: string;
  noise_profile: NoiseProfile;
}

export interface ConfigUpdatedEvent {
  session_id: string;
  config: Record<string, unknown>;
}

export interface ErrorEvent {
  message: string;
}

export interface VadConfig {
  debug?: boolean;
  sample_rate?: number;
  frame_duration_ms?: number;
  use_webrtc_vad?: boolean;
  use_rms_vad?: boolean;
  aggressiveness?: number;
  webrtc_weight?: number;
  rms_weight?: number;
  rms_vad_config?: {
    initial_sensitivity_factor?: number;
    calibration_duration_ms?: number;
    recalibration_interval_ms?: number;
    silence_duration_for_recal_ms?: number;
    consecutive_frames_threshold?: number;
  };
}

export interface VadInitializedEvent {
  session_id: string;
  noise_profile: NoiseProfile;
  config: VadConfig;
}

// Type for event handlers
type EventHandler<T> = (data: T) => void;

class SocketVadService {
  private socket: Socket | null = null;
  private sessionId: string | null = null;
  private eventHandlers: Map<string, Set<EventHandler<unknown>>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
  private autoReconnect = true;
  private audioChunkSize = 4096; // Size of audio chunks to send
  private isConnected = false;
  private isSpeaking = false;
  private debug = false;

  /**
   * Connect to the WebSocket server
   */
  async connect(): Promise<boolean> {
    if (this.socket) {
      console.log('[SocketVAD] Already connected');
      return true;
    }

    try {
      const socketUrl = API_ENDPOINTS.socketVadUrl;
      console.log(`[SocketVAD] Connecting to ${socketUrl}`);

      this.socket = io(socketUrl, {
        transports: ['websocket'],
        reconnection: this.autoReconnect,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: this.reconnectDelay,
        reconnectionDelayMax: 5000
      });

      // Set up event listeners
      this.setupSocketEvents();

      return new Promise((resolve) => {
        // Set a timeout for connection
        const timeout = setTimeout(() => {
          console.error('[SocketVAD] Connection timeout');
          if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
          }
          resolve(false);
        }, 5000);

        // Listen for connection success
        this.once(SocketVadEvent.CONNECTED, () => {
          clearTimeout(timeout);
          this.isConnected = true;
          console.log('[SocketVAD] Connected successfully');
          resolve(true);
        });

        // Listen for connection error
        this.socket!.on('connect_error', (err) => {
          clearTimeout(timeout);
          console.error(`[SocketVAD] Connection error: ${err.message}`);
          resolve(false);
        });
      });
    } catch (error) {
      console.error('[SocketVAD] Error connecting:', error);
      return false;
    }
  }

  /**
   * Setup socket event handlers
   */
  private setupSocketEvents(): void {
    if (!this.socket) return;

    // Basic Socket.IO events
    this.socket.on('connect', () => {
      console.log(`[SocketVAD] Connected, socket ID: ${this.socket?.id}`);
      this.isConnected = true;
      this.reconnectAttempts = 0;
    });

    this.socket.on('disconnect', (reason) => {
      console.log(`[SocketVAD] Disconnected: ${reason}`);
      this.isConnected = false;
      
      // Handle various disconnect reasons
      if (reason === 'io server disconnect') {
        // Server disconnected us, need to reconnect manually
        if (this.autoReconnect) {
          this.reconnect();
        }
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error(`[SocketVAD] Connection error: ${error.message}`);
    });

    // Forward all VAD-specific events to our event handler system
    for (const event of Object.values(SocketVadEvent)) {
      this.socket.on(event, (data) => {
        if (this.debug) {
          console.log(`[SocketVAD] Received ${event}:`, data);
        }
        this.emit(event, data);
      });
    }
  }

  /**
   * Initialize a VAD session
   */
  async initVad(existingSessionId?: string): Promise<string | null> {
    if (!this.socket || !this.isConnected) {
      const connected = await this.connect();
      if (!connected) {
        return null;
      }
    }

    return new Promise((resolve) => {
      // Set a timeout for initialization
      const timeout = setTimeout(() => {
        console.error('[SocketVAD] VAD initialization timeout');
        resolve(null);
      }, 5000);

      // Listen for initialization response
      this.once(SocketVadEvent.VAD_INITIALIZED, (data: VadInitializedEvent) => {
        clearTimeout(timeout);
        this.sessionId = data.session_id;
        console.log(`[SocketVAD] VAD session initialized: ${this.sessionId}`);
        
        // Store the initial speaking state
        this.isSpeaking = false;
        
        resolve(this.sessionId);
      });

      // Send initialization request
      this.socket!.emit('init_vad', {
        session_id: existingSessionId
      });
    });
  }

  /**
   * Process an audio chunk
   * @param audioData Base64-encoded PCM audio data
   */
  processAudio(audioData: string): void {
    if (!this.socket || !this.isConnected || !this.sessionId) {
      console.error('[SocketVAD] Cannot process audio: not connected or no session');
      return;
    }

    this.socket.emit('process_audio', {
      session_id: this.sessionId,
      audio: audioData
    });
  }

  /**
   * Update VAD configuration
   * @param config Configuration options
   */
  updateConfig(config: VadConfig): void {
    if (!this.socket || !this.isConnected || !this.sessionId) {
      console.error('[SocketVAD] Cannot update config: not connected or no session');
      return;
    }

    this.socket.emit('update_vad_config', {
      session_id: this.sessionId,
      config
    });
  }

  /**
   * Force recalibration of the VAD system
   */
  forceRecalibration(): void {
    if (!this.socket || !this.isConnected || !this.sessionId) {
      console.error('[SocketVAD] Cannot force recalibration: not connected or no session');
      return;
    }

    this.socket.emit('force_recalibration', {
      session_id: this.sessionId
    });
  }

  /**
   * Get debug state
   */
  getDebugState(): void {
    if (!this.socket || !this.isConnected || !this.sessionId) {
      console.error('[SocketVAD] Cannot get debug state: not connected or no session');
      return;
    }

    this.socket.emit('get_debug_state', {
      session_id: this.sessionId
    });
  }

  /**
   * Process audio from AudioBuffer
   * @param audioBuffer Web Audio API AudioBuffer
   */
  processAudioBuffer(audioBuffer: AudioBuffer): void {
    // Convert to the format expected by the backend
    const pcmData = this.convertAudioBufferToPCM(audioBuffer);
    
    // Encode as base64
    const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcmData)));
    
    // Send to the server
    this.processAudio(base64Data);
  }

  /**
   * Process audio from Float32Array
   * @param audioData Float32Array audio data
   */
  processAudioData(audioData: Float32Array): void {
    // Convert to the format expected by the backend
    const pcmData = this.convertFloat32ToPCM(audioData);
    
    // Encode as base64
    const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcmData)));
    
    // Send to the server
    this.processAudio(base64Data);
  }

  /**
   * Convert AudioBuffer to PCM format
   * @param buffer Web Audio API AudioBuffer
   * @returns ArrayBuffer containing PCM data
   */
  private convertAudioBufferToPCM(buffer: AudioBuffer): ArrayBuffer {
    // Get the first channel (mono)
    const samples = buffer.getChannelData(0);
    return this.convertFloat32ToPCM(samples);
  }

  /**
   * Convert Float32Array to PCM format
   * @param samples Float32Array audio samples (-1.0 to 1.0)
   * @returns ArrayBuffer containing PCM data
   */
  private convertFloat32ToPCM(samples: Float32Array): ArrayBuffer {
    // Convert to 16-bit PCM
    const pcmData = new Int16Array(samples.length);
    
    // Convert Float32 (-1.0 to 1.0) to Int16 (-32768 to 32767)
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    
    return pcmData.buffer;
  }

  /**
   * Check if connected to the server
   */
  isSocketConnected(): boolean {
    return this.isConnected && this.socket !== null;
  }

  /**
   * Check if a VAD session is active
   */
  hasActiveSession(): boolean {
    return this.isSocketConnected() && this.sessionId !== null;
  }

  /**
   * Get the current session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Get the current speaking state
   */
  getIsSpeaking(): boolean {
    return this.isSpeaking;
  }

  /**
   * Disconnect from the server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.sessionId = null;
    this.isConnected = false;
    this.isSpeaking = false;
  }

  /**
   * Attempt to reconnect to the server
   */
  private reconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`[SocketVAD] Max reconnect attempts (${this.maxReconnectAttempts}) reached`);
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * this.reconnectAttempts, 5000);
    
    console.log(`[SocketVAD] Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
    
    setTimeout(() => {
      this.connect().then(connected => {
        if (connected && this.sessionId) {
          // Try to reuse the previous session
          this.initVad(this.sessionId);
        }
      });
    }, delay);
  }

  /**
   * Register an event handler
   * @param event Event type
   * @param handler Handler function
   */
  on<T>(event: SocketVadEvent, handler: EventHandler<T>): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler as EventHandler<unknown>);
  }

  /**
   * Register a one-time event handler
   * @param event Event type
   * @param handler Handler function
   */
  once<T>(event: SocketVadEvent, handler: EventHandler<T>): void {
    const onceHandler: EventHandler<T> = (data: T) => {
      this.off(event, onceHandler);
      handler(data);
    };
    this.on(event, onceHandler);
  }

  /**
   * Remove an event handler
   * @param event Event type
   * @param handler Handler function
   */
  off<T>(event: SocketVadEvent, handler: EventHandler<T>): void {
    if (this.eventHandlers.has(event)) {
      this.eventHandlers.get(event)!.delete(handler as EventHandler<unknown>);
    }
  }

  /**
   * Emit an event to registered handlers
   * @param event Event type
   * @param data Event data
   */
  private emit<T>(event: string, data: T): void {
    if (this.eventHandlers.has(event)) {
      for (const handler of this.eventHandlers.get(event)!) {
        try {
          handler(data);
        } catch (error) {
          console.error(`[SocketVAD] Error in event handler for ${event}:`, error);
        }
      }
    }

    // Special handling for speech state events
    if (event === SocketVadEvent.SPEECH_START) {
      this.isSpeaking = true;
    } else if (event === SocketVadEvent.SPEECH_END) {
      this.isSpeaking = false;
    }
  }

  /**
   * Set debug mode
   * @param enabled Whether debug logging should be enabled
   */
  setDebug(enabled: boolean): void {
    this.debug = enabled;
  }
}

// Create a singleton instance
export const socketVadService = new SocketVadService();

// Export the default instance and the class for testing
export default socketVadService; 