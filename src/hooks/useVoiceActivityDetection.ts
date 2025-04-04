import { useCallback, useEffect, useRef, useState } from 'react';
import { VAD_SETTINGS, ADAPTIVE_VAD_SETTINGS } from '../constants/audioThresholds';
import { useNoiseProfile } from './useNoiseProfile';
import { audioAnalysisService, AudioAnalysisEvent } from '../services/audioAnalysisService';

interface VADOptions {
  /**
   * Threshold level (0-1) below which audio is considered silence
   */
  silenceThreshold?: number;
  
  /**
   * Time in milliseconds of continuous silence after which to trigger onSilence
   */
  silenceTimeoutMs?: number;
  
  /**
   * Minimum speaking time in milliseconds before silence detection activates
   */
  minSpeakingTimeMs?: number;
  
  /**
   * Callback when silence is detected
   */
  onSilence?: () => void;
  
  /**
   * Callback when voice activity is detected after silence
   */
  onSpeech?: () => void;
  
  /**
   * Whether to use adaptive thresholding
   */
  useAdaptiveThresholding?: boolean;
  
  /**
   * Whether to use backend audio analysis service
   */
  useBackendAnalysisService?: boolean;
}

export interface UseVoiceActivityDetectionResult {
  /**
   * Whether VAD is currently active
   */
  isActive: boolean;
  
  /**
   * Whether speech is currently detected
   */
  isSpeaking: boolean;
  
  /**
   * Start voice activity detection
   */
  startVAD: () => void;
  
  /**
   * Stop voice activity detection
   */
  stopVAD: () => void;
  
  /**
   * Reset silence timer (useful for manual controls)
   */
  resetSilenceTimer: () => void;
  
  /**
   * Current silence threshold (for adaptive thresholding)
   */
  currentThreshold?: number;
  
  /**
   * Current noise floor (for adaptive thresholding)
   */
  noiseFloor?: number;
}

export const useVoiceActivityDetection = (
  audioLevel: number, 
  options: VADOptions = {}
): UseVoiceActivityDetectionResult => {
  // Default options
  const defaultOptions: Required<VADOptions> = {
    silenceThreshold: 0.04, // Lower threshold to detect more silence
    silenceTimeoutMs: 1000,
    minSpeakingTimeMs: 300,
    onSilence: () => {},
    onSpeech: () => {},
    useAdaptiveThresholding: VAD_SETTINGS.USE_ADAPTIVE_THRESHOLDING,
    useBackendAnalysisService: true
  };
  
  // Merge defaults with provided options
  const opts = { ...defaultOptions, ...options };
  
  // State
  const [isActive, setIsActive] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [currentThreshold, setCurrentThreshold] = useState<number>(opts.silenceThreshold);
  const [noiseFloor, setNoiseFloor] = useState<number>(0);
  
  // Initialize adaptive thresholding with appropriate options
  const {
    noiseProfile,
    isCalibrating,
    addAudioSample,
    getDynamicThreshold,
    isSpeechDetected: adaptiveIsSpeechDetected
  } = useNoiseProfile({
    initialSensitivityFactor: ADAPTIVE_VAD_SETTINGS.INITIAL_SENSITIVITY_FACTOR,
    calibrationDurationMs: ADAPTIVE_VAD_SETTINGS.CALIBRATION_DURATION_MS,
    calibrationSampleRateMs: ADAPTIVE_VAD_SETTINGS.CALIBRATION_SAMPLE_RATE_MS,
    recalibrationIntervalMs: ADAPTIVE_VAD_SETTINGS.RECALIBRATION_INTERVAL_MS,
    silenceDurationForRecalMs: ADAPTIVE_VAD_SETTINGS.SILENCE_DURATION_FOR_RECAL_MS,
    maxSampleHistory: ADAPTIVE_VAD_SETTINGS.MAX_SAMPLE_HISTORY,
    emaAlpha: ADAPTIVE_VAD_SETTINGS.EMA_ALPHA
  });
  
  // Refs to preserve values between renders
  const silenceTimeoutRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const minSpeakingTimeReachedRef = useRef<boolean>(false);
  const consecutiveSilenceFramesRef = useRef<number>(0);
  const consecutiveSpeechFramesRef = useRef<number>(0);
  const previousAudioLevelRef = useRef<number>(0);
  const audioLevelHistoryRef = useRef<number[]>([]);
  const baselineNoiseFloorRef = useRef<number | null>(null);
  const significantActivityThresholdRef = useRef<number | null>(null);
  const initialCalibrationCompleteRef = useRef<boolean>(false);
  const lastLogTimeRef = useRef<number>(Date.now());
  const silenceTriggeredRef = useRef<boolean>(false);
  
  // Backend audio analysis service handlers
  const handleBackendSpeechStart = useCallback(() => {
    if (!isActive) return;
    
    console.log('Backend VAD: Speech detected');
    if (!isSpeaking) {
      setIsSpeaking(true);
      opts.onSpeech();
    }
    
    // Cancel any silence timeout
    if (silenceTimeoutRef.current) {
      console.log('Backend VAD: Canceling silence timeout due to speech detection');
      window.clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    
    // Reset silence triggered flag
    silenceTriggeredRef.current = false;
  }, [isActive, isSpeaking, opts]);
  
  const handleBackendSpeechEnd = useCallback(() => {
    if (!isActive || !isSpeaking) return;
    
    console.log('Backend VAD: Silence detected');
    
    // Check if minimum speaking time has been reached
    const currentTime = Date.now();
    const elapsedTime = startTimeRef.current ? currentTime - startTimeRef.current : 0;
    
    if (elapsedTime < opts.minSpeakingTimeMs) {
      console.log(`Backend VAD: Ignoring silence because minimum speaking time (${opts.minSpeakingTimeMs}ms) not reached`);
      return;
    }
    
    // Set silence timeout if not already set
    if (!silenceTimeoutRef.current && !silenceTriggeredRef.current) {
      console.log(`Backend VAD: Setting silence timeout for ${opts.silenceTimeoutMs}ms`);
      silenceTimeoutRef.current = window.setTimeout(() => {
        console.log('Backend VAD: Silence timeout elapsed, triggering onSilence');
        silenceTimeoutRef.current = null;
        setIsSpeaking(false);
        silenceTriggeredRef.current = true;
        opts.onSilence();
      }, opts.silenceTimeoutMs);
    }
  }, [isActive, isSpeaking, opts]);
  
  // Register event handlers for backend audio analysis service
  useEffect(() => {
    if (opts.useBackendAnalysisService) {
      console.log('Backend VAD: Registering event handlers');
      audioAnalysisService.addEventListener(AudioAnalysisEvent.SPEECH_START, handleBackendSpeechStart);
      audioAnalysisService.addEventListener(AudioAnalysisEvent.SPEECH_END, handleBackendSpeechEnd);
    }
    
    return () => {
      if (opts.useBackendAnalysisService) {
        console.log('Backend VAD: Removing event handlers');
        audioAnalysisService.removeEventListener(AudioAnalysisEvent.SPEECH_START, handleBackendSpeechStart);
        audioAnalysisService.removeEventListener(AudioAnalysisEvent.SPEECH_END, handleBackendSpeechEnd);
      }
    };
  }, [opts.useBackendAnalysisService, handleBackendSpeechStart, handleBackendSpeechEnd]);
  
  // Reset silence timer
  const resetSilenceTimer = useCallback(() => {
    if (silenceTimeoutRef.current) {
      console.log('VAD: Manually resetting silence timer');
      window.clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
  }, []);
  
  // Clean up resources
  const cleanup = useCallback(() => {
    console.log('VAD: Cleaning up resources');
    resetSilenceTimer();
    setIsActive(false);
    silenceTriggeredRef.current = false;
    audioLevelHistoryRef.current = [];
    minSpeakingTimeReachedRef.current = false;
    consecutiveSilenceFramesRef.current = 0;
    consecutiveSpeechFramesRef.current = 0;
    startTimeRef.current = null;
    baselineNoiseFloorRef.current = null;
    significantActivityThresholdRef.current = null;
    initialCalibrationCompleteRef.current = false;
  }, [resetSilenceTimer]);
  
  // Helper function to calculate average audio level from history
  const getAverageAudioLevel = () => {
    if (audioLevelHistoryRef.current.length === 0) return audioLevel;
    
    // Use a weighted average giving more weight to recent levels
    let totalWeight = 0;
    let weightedSum = 0;
    
    audioLevelHistoryRef.current.forEach((level, index) => {
      // More recent values (higher index) get higher weight
      const weight = index + 1;
      weightedSum += level * weight;
      totalWeight += weight;
    });
    
    return weightedSum / totalWeight;
  };
  
  // Update UI displays with current adaptive values
  useEffect(() => {
    if (opts.useAdaptiveThresholding && noiseProfile && !isCalibrating) {
      setCurrentThreshold(getDynamicThreshold());
      setNoiseFloor(noiseProfile.noiseFloor);
    }
  }, [opts.useAdaptiveThresholding, noiseProfile, isCalibrating, getDynamicThreshold]);
  
  // Monitor audio level for voice activity detection
  useEffect(() => {
    if (!isActive) return;
    
    // Send sample to backend analysis service if enabled
    if (opts.useBackendAnalysisService) {
      audioAnalysisService.addAudioSample(audioLevel)
        .catch(error => console.error('Error adding audio sample to analysis service:', error));
    }
    
    // Add sample to local adaptive system if enabled
    if (opts.useAdaptiveThresholding && !opts.useBackendAnalysisService) {
      addAudioSample(audioLevel);
    }
    
    // If we're using the backend service, let it handle the speech detection
    if (opts.useBackendAnalysisService) {
      return;
    }
    
    // Get current time
    const currentTime = Date.now();
    
    // Keep track of audio history - limit to a sliding window of samples
    // Use a larger window (5) for more stability in detection
    audioLevelHistoryRef.current.push(audioLevel);
    if (audioLevelHistoryRef.current.length > 5) {
      audioLevelHistoryRef.current.shift();
    }
    
    // Calculate average audio level from recent history
    const avgAudioLevel = getAverageAudioLevel();
    
    // For adaptive thresholding, check if we're in calibration phase
    if (opts.useAdaptiveThresholding && isCalibrating) {
      // Don't perform speech detection during calibration
      return;
    }
    
    // Store previous audio level for rate-of-change detection
    previousAudioLevelRef.current = audioLevel;
    
    // Debugging log (limit frequency to avoid console spam)
    if (currentTime - lastLogTimeRef.current > 1000) {  // Log max once per second
      console.log(`VAD Levels - Audio: ${(avgAudioLevel * 100).toFixed(1)}%, Threshold: ${(currentThreshold * 100).toFixed(1)}%`);
      lastLogTimeRef.current = currentTime;
    }
    
    // Determine threshold to use
    let effectiveThreshold = currentThreshold;
    if (opts.useAdaptiveThresholding) {
      effectiveThreshold = getDynamicThreshold();
      
      // If adaptive threshold is unusually low or high, use a reasonable default
      if (effectiveThreshold < 0.02 || effectiveThreshold > 0.5) {
        console.warn(`VAD: Adaptive threshold value ${effectiveThreshold.toFixed(3)} is outside reasonable range, using default`);
        effectiveThreshold = opts.silenceThreshold;
      }
    } else {
      effectiveThreshold = opts.silenceThreshold;
    }

    // If we're using adaptive thresholding with the local implementation (not backend)
    if (opts.useAdaptiveThresholding && !opts.useBackendAnalysisService) {
      // Use the implementation's speech detection
      const isSpeech = adaptiveIsSpeechDetected(audioLevel);
      
      if (isSpeech) {
        // Reset silence counter
        consecutiveSilenceFramesRef.current = 0;
        
        // Cancel any existing silence timeout
        if (silenceTimeoutRef.current) {
          console.log('VAD (Adaptive): Canceling silence timeout due to voice activity');
          window.clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = null;
        }
        
        // If we were silent and now we're speaking
        if (!isSpeaking) {
          console.log(`VAD (Adaptive): Speech detected (level: ${(avgAudioLevel * 100).toFixed(1)}%)`);
          setIsSpeaking(true);
          opts.onSpeech();
        }
      } else {
        // Count consecutive silent frames
        consecutiveSilenceFramesRef.current++;
        
        // If we have enough consecutive silent frames and we're currently speaking
        if (isSpeaking && consecutiveSilenceFramesRef.current >= VAD_SETTINGS.CONSECUTIVE_SILENCE_FRAMES) {
          // If we don't have a silence timeout yet and haven't triggered silence already
          if (!silenceTimeoutRef.current && !silenceTriggeredRef.current) {
            console.log(`VAD (Adaptive): Setting silence timeout (${opts.silenceTimeoutMs}ms) after ${consecutiveSilenceFramesRef.current} silent frames`);
            silenceTimeoutRef.current = window.setTimeout(() => {
              console.log('VAD (Adaptive): Silence timeout elapsed, triggering onSilence');
              silenceTimeoutRef.current = null;
              setIsSpeaking(false);
              silenceTriggeredRef.current = true;
              opts.onSilence();
            }, opts.silenceTimeoutMs);
          } 
        } 
        // Force trigger if we have enough consecutive silent frames
        else if (isSpeaking && consecutiveSilenceFramesRef.current > VAD_SETTINGS.CONSECUTIVE_SILENCE_FRAMES * 2) {
          console.log(`VAD (Adaptive): Force triggering silence detection after ${consecutiveSilenceFramesRef.current} silent frames`);
          if (silenceTimeoutRef.current) {
            window.clearTimeout(silenceTimeoutRef.current);
            silenceTimeoutRef.current = null;
          }
          setIsSpeaking(false);
          silenceTriggeredRef.current = true;
          opts.onSilence();
        }
      }
    } else if (!opts.useBackendAnalysisService) {
      // Traditional threshold-based approach (not using adaptive implementation or backend)
      
      // Determine significant activity threshold that indicates actual speech
      const speechThreshold = significantActivityThresholdRef.current !== null
        ? significantActivityThresholdRef.current
        : effectiveThreshold * 1.5; // 50% higher than base threshold as fallback
      
      // Store the first timestamp when recording starts
      if (startTimeRef.current === null) {
        startTimeRef.current = currentTime;
      }
      
      // Calculate elapsed time since recording started
      const elapsedTime = startTimeRef.current 
        ? currentTime - startTimeRef.current 
        : 0;
      
      // Check if minimum speaking time has been reached
      if (!minSpeakingTimeReachedRef.current && elapsedTime >= opts.minSpeakingTimeMs) {
        minSpeakingTimeReachedRef.current = true;
        console.log(`VAD: Minimum speaking time reached (${opts.minSpeakingTimeMs}ms) at ${new Date().toISOString()}`);
      }
      
      // Don't run silence detection until minimum speaking time is reached
      if (!minSpeakingTimeReachedRef.current) {
        // During initial period, we need to be more aggressive in detecting speech
        // to ensure we don't cut off the beginning of utterances
        if (avgAudioLevel >= effectiveThreshold && !isSpeaking) {
          // Require multiple consecutive frames above threshold
          consecutiveSpeechFramesRef.current += 1;
          
          // Only set as speaking after consecutive frames above threshold
          if (consecutiveSpeechFramesRef.current >= 2) {
            setIsSpeaking(true);
            console.log(`VAD: Initial speech detected after ${consecutiveSpeechFramesRef.current} frames (${(avgAudioLevel * 100).toFixed(1)}%)`);
          }
        } else {
          // Reset counter if level drops below threshold
          consecutiveSpeechFramesRef.current = 0;
        }
        return;
      }
      
      // Check if audio level is below threshold (silence)
      const isSilent = avgAudioLevel < effectiveThreshold;
      
      if (isSilent) {
        // Count consecutive silent frames
        consecutiveSilenceFramesRef.current++;
        
        // If we have enough consecutive silent frames, consider setting a silence timeout
        if (isSpeaking && consecutiveSilenceFramesRef.current >= VAD_SETTINGS.CONSECUTIVE_SILENCE_FRAMES) {
          // If we don't have a silence timeout yet and haven't triggered silence already
          if (!silenceTimeoutRef.current && !silenceTriggeredRef.current) {
            // Log more detailed audio level information
            const percentAboveThreshold = Math.max(0, (avgAudioLevel / effectiveThreshold - 1) * 100).toFixed(1);
            console.log(`VAD: Setting silence timeout (${opts.silenceTimeoutMs}ms) after ${consecutiveSilenceFramesRef.current} silent frames`);
            console.log(`VAD: Audio level ${(avgAudioLevel * 100).toFixed(1)}% vs threshold ${(effectiveThreshold * 100).toFixed(1)}% (${percentAboveThreshold}% above)`);
            
            silenceTimeoutRef.current = window.setTimeout(() => {
              console.log('VAD: Silence timeout elapsed, triggering onSilence');
              silenceTimeoutRef.current = null;
              setIsSpeaking(false);
              silenceTriggeredRef.current = true;
              opts.onSilence();
            }, opts.silenceTimeoutMs);
          }
        }
      } else {
        // Reset silence tracking when we detect audio
        if (consecutiveSilenceFramesRef.current > 5) {
          console.log(`VAD: Speech resumed after ${consecutiveSilenceFramesRef.current} silent frames`);
        }
        
        // Check if this is actual speech or just background noise
        const isActualSpeech = avgAudioLevel >= speechThreshold;
        
        if (isActualSpeech) {
          consecutiveSilenceFramesRef.current = 0;
          
          // Track consecutive speech frames
          consecutiveSpeechFramesRef.current += 1;
          
          // Cancel any existing silence timeout if seeing actual speech
          if (silenceTimeoutRef.current) {
            console.log('VAD: Canceling silence timeout due to voice activity');
            window.clearTimeout(silenceTimeoutRef.current);
            silenceTimeoutRef.current = null;
          }
          
          // Reset silence triggered flag when we detect strong speech
          if (silenceTriggeredRef.current) {
            console.log(`VAD: Resetting silence triggered flag due to strong voice activity (${(avgAudioLevel * 100).toFixed(1)}%)`);
            silenceTriggeredRef.current = false;
          }
          
          // If we were silent and now we're speaking, 
          // require multiple frames above threshold before triggering onSpeech
          if (!isSpeaking) {
            // Only trigger speech after consecutive frames above threshold
            if (consecutiveSpeechFramesRef.current >= 2) {
              console.log(`VAD: Speech detected after silence (level: ${(avgAudioLevel * 100).toFixed(1)}%) after ${consecutiveSpeechFramesRef.current} frames`);
              setIsSpeaking(true);
              opts.onSpeech();
            }
          }
        }
      }
    }
  }, [
    audioLevel, 
    isActive, 
    isSpeaking, 
    opts, 
    cleanup, 
    isCalibrating,
    addAudioSample,
    getDynamicThreshold,
    adaptiveIsSpeechDetected,
    noiseProfile,
    currentThreshold
  ]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('VAD: Component unmounting, cleaning up');
      cleanup();
    };
  }, [cleanup]);
  
  // Start voice activity detection
  const startVAD = useCallback(() => {
    console.log('VAD: Starting voice activity detection');
    cleanup();
    setIsActive(true);
    startTimeRef.current = Date.now();
    lastLogTimeRef.current = Date.now();
    baselineNoiseFloorRef.current = null;
    significantActivityThresholdRef.current = null;
    initialCalibrationCompleteRef.current = false;
    
    // If using backend service, force recalibration
    if (opts.useBackendAnalysisService) {
      audioAnalysisService.forceRecalibration()
        .catch(error => console.error('Error forcing recalibration:', error));
    }
  }, [cleanup, opts.useBackendAnalysisService]);
  
  // Stop voice activity detection
  const stopVAD = useCallback(() => {
    console.log('VAD: Stopping voice activity detection');
    cleanup();
  }, [cleanup]);
  
  return {
    isActive,
    isSpeaking,
    startVAD,
    stopVAD,
    resetSilenceTimer,
    currentThreshold: opts.useAdaptiveThresholding ? currentThreshold : undefined,
    noiseFloor: opts.useAdaptiveThresholding ? noiseFloor : undefined
  };
}; 