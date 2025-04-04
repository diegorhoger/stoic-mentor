/**
 * Frontend service for interacting with the backend AudioAnalysisService
 * This provides adaptive thresholding for Voice Activity Detection (VAD)
 */

import { API_ENDPOINTS } from '../constants/app';

// Types
export interface NoiseProfile {
  noiseFloor: number;
  stdDev: number;
  samples: number[];
  sensitivityFactor: number;
  lastCalibrationTime: number;
  calibrationComplete: boolean;
}

export interface AudioAnalysisResult {
  level: number;
  threshold: number;
  isSpeech: boolean;
  profile: NoiseProfile;
  timestamp: number;
}

export interface AudioAnalysisConfig {
  initialSensitivityFactor?: number;
  calibrationDurationMs?: number;
  recalibrationIntervalMs?: number;
  silenceDurationForRecalMs?: number;
  maxSampleHistory?: number;
  smoothingFactor?: number;
  consecutiveFramesThreshold?: number;
  debug?: boolean;
}

// Event types and handler type
export enum AudioAnalysisEvent {
  CALIBRATION_START = 'calibration-start',
  CALIBRATION_COMPLETE = 'calibration-complete',
  SPEECH_START = 'speech-start',
  SPEECH_END = 'speech-end',
  THRESHOLD_CHANGED = 'threshold-changed'
}

export type AudioAnalysisEventHandler = (data: AudioAnalysisResult | null) => void;

/**
 * Singleton service for audio analysis with adaptive thresholding
 */
class AudioAnalysisService {
  private eventHandlers: Map<AudioAnalysisEvent, Set<AudioAnalysisEventHandler>> = new Map();
  private lastResult: AudioAnalysisResult | null = null;
  private pendingAnalysis: boolean = false;
  private _isCallbackRegistered: boolean = false;
  private debugMode: boolean = false;
  
  /**
   * Add an audio sample to the analysis service
   * @param audioLevel - Audio level (0-1 range)
   * @returns Promise with analysis result
   */
  async addAudioSample(audioLevel: number): Promise<AudioAnalysisResult> {
    // Prevent flooding the server with requests
    if (this.pendingAnalysis) {
      if (this.lastResult) {
        return this.lastResult;
      }
      
      // Return default result if no previous result exists
      return {
        level: audioLevel,
        threshold: 0,
        isSpeech: false,
        profile: {
          noiseFloor: 0,
          stdDev: 0,
          samples: [],
          sensitivityFactor: 1.5,
          lastCalibrationTime: Date.now(),
          calibrationComplete: false
        },
        timestamp: Date.now()
      };
    }
    
    this.pendingAnalysis = true;
    
    try {
      const fullUrl = `${API_ENDPOINTS.baseUrl}/audio-analysis`;
      const response = await fetch(fullUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          audioLevel,
          timestamp: Date.now()
        })
      });
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }
      
      const data: AudioAnalysisResult = await response.json();
      this.lastResult = data;
      
      // Check for events to emit
      if (this.lastResult) {
        // Emit speech start/end events
        if (this.lastResult.isSpeech && this.lastResult?.profile?.calibrationComplete) {
          this.emitEvent(AudioAnalysisEvent.SPEECH_START, this.lastResult);
        } else if (!this.lastResult.isSpeech && this.lastResult?.profile?.calibrationComplete) {
          this.emitEvent(AudioAnalysisEvent.SPEECH_END, this.lastResult);
        }
      }
      
      return this.lastResult;
    } catch (error) {
      console.error('Error in audio analysis:', error);
      throw error;
    } finally {
      this.pendingAnalysis = false;
    }
  }
  
  /**
   * Force recalibration of the audio analysis service
   */
  async forceRecalibration(): Promise<void> {
    try {
      const fullUrl = `${API_ENDPOINTS.baseUrl}/audio-analysis/calibrate`;
      const response = await fetch(fullUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }
      
      this.emitEvent(AudioAnalysisEvent.CALIBRATION_START, null);
    } catch (error) {
      console.error('Error forcing calibration:', error);
      throw error;
    }
  }
  
  /**
   * Get the current threshold and noise profile
   */
  async getThreshold(): Promise<{threshold: number; noiseProfile: NoiseProfile}> {
    try {
      const fullUrl = `${API_ENDPOINTS.baseUrl}/audio-analysis/threshold`;
      const response = await fetch(fullUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }
      
      return response.json();
    } catch (error) {
      console.error('Error getting threshold:', error);
      throw error;
    }
  }
  
  /**
   * Update the audio analysis service configuration
   */
  async updateConfig(config: AudioAnalysisConfig): Promise<void> {
    try {
      const fullUrl = `${API_ENDPOINTS.baseUrl}/audio-analysis/config`;
      const response = await fetch(fullUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(config)
      });
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error updating configuration:', error);
      throw error;
    }
  }
  
  /**
   * Get debug state (only if debug mode is enabled)
   */
  async getDebugState(): Promise<Record<string, unknown>> {
    try {
      const fullUrl = `${API_ENDPOINTS.baseUrl}/audio-analysis/debug`;
      const response = await fetch(fullUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }
      
      return response.json();
    } catch (error) {
      console.error('Error getting debug state:', error);
      throw error;
    }
  }
  
  /**
   * Add an event listener
   */
  addEventListener(event: AudioAnalysisEvent, handler: AudioAnalysisEventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    
    const handlers = this.eventHandlers.get(event);
    handlers?.add(handler);
  }
  
  /**
   * Remove an event listener
   */
  removeEventListener(event: AudioAnalysisEvent, handler: AudioAnalysisEventHandler): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }
  
  /**
   * Emit an event to all registered handlers
   */
  private emitEvent(event: AudioAnalysisEvent, data: AudioAnalysisResult | null): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in ${event} event handler:`, error);
        }
      });
    }
  }
  
  /**
   * Enable or disable debug mode
   */
  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
    this.updateConfig({ debug: enabled }).catch(console.error);
  }
  
  /**
   * Get latest result without making a request
   */
  getLatestResult(): AudioAnalysisResult | null {
    return this.lastResult;
  }
}

// Export singleton instance
export const audioAnalysisService = new AudioAnalysisService(); 