import { useState, useRef, useCallback, useEffect } from 'react';
import { NoiseProfile, AdaptiveVADOptions, ADAPTIVE_VAD_DEFAULTS } from '../types/audio';
import { calculateMean, calculateStdDev, createNoiseProfile } from '../utils/audioAnalysis';

interface UseNoiseProfileResult {
  /**
   * Current noise profile, null during initial calibration
   */
  noiseProfile: NoiseProfile | null;
  
  /**
   * Whether the system is currently in calibration phase
   */
  isCalibrating: boolean;
  
  /**
   * Add a new audio level sample to the noise profile
   * @param level Audio level (0-1)
   */
  addAudioSample: (level: number) => void;
  
  /**
   * Calculate the current dynamic threshold based on noise profile
   */
  getDynamicThreshold: () => number;
  
  /**
   * Determine if the given audio level is considered speech
   * @param level Audio level (0-1)
   */
  isSpeechDetected: (level: number) => boolean;
  
  /**
   * Force a recalibration of the noise profile
   */
  forceRecalibration: () => void;
  
  /**
   * Reset the noise profile and start calibration again
   */
  resetProfile: () => void;
}

/**
 * Hook for managing adaptive noise thresholds for VAD
 */
export const useNoiseProfile = (options: AdaptiveVADOptions = {}): UseNoiseProfileResult => {
  // Merge default options with provided options
  const opts = {
    calibrationDurationMs: options.calibrationDurationMs ?? ADAPTIVE_VAD_DEFAULTS.CALIBRATION_DURATION_MS,
    calibrationSampleRateMs: options.calibrationSampleRateMs ?? ADAPTIVE_VAD_DEFAULTS.CALIBRATION_SAMPLE_RATE_MS,
    initialSensitivityFactor: options.initialSensitivityFactor ?? ADAPTIVE_VAD_DEFAULTS.INITIAL_SENSITIVITY_FACTOR,
    recalibrationIntervalMs: options.recalibrationIntervalMs ?? ADAPTIVE_VAD_DEFAULTS.RECALIBRATION_INTERVAL_MS,
    silenceDurationForRecalMs: options.silenceDurationForRecalMs ?? ADAPTIVE_VAD_DEFAULTS.SILENCE_DURATION_FOR_RECAL_MS,
    maxSampleHistory: options.maxSampleHistory ?? ADAPTIVE_VAD_DEFAULTS.MAX_SAMPLE_HISTORY,
    emaAlpha: options.emaAlpha ?? ADAPTIVE_VAD_DEFAULTS.EMA_ALPHA
  };
  
  // State
  const [noiseProfile, setNoiseProfile] = useState<NoiseProfile | null>(null);
  const [isCalibrating, setIsCalibrating] = useState<boolean>(true);
  
  // Refs
  const calibrationSamplesRef = useRef<number[]>([]);
  const calibrationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSilenceTimeRef = useRef<number>(Date.now());
  const consecutiveSpeechFramesRef = useRef<number>(0);
  const consecuetiveSilenceFramesRef = useRef<number>(0);
  
  /**
   * Initialize a new calibration phase
   */
  const startCalibration = useCallback(() => {
    console.log('VAD: Starting noise profile calibration');
    setIsCalibrating(true);
    calibrationSamplesRef.current = [];
    
    // Clear any existing calibration timer
    if (calibrationTimerRef.current) {
      clearTimeout(calibrationTimerRef.current);
    }
    
    // Set up a timer to complete calibration after the duration
    calibrationTimerRef.current = setTimeout(() => {
      if (calibrationSamplesRef.current.length >= 5) {
        const profile = createNoiseProfile(
          calibrationSamplesRef.current,
          opts.initialSensitivityFactor
        );
        
        setNoiseProfile(profile);
        setIsCalibrating(false);
        console.log(`VAD: Calibration complete - Noise floor: ${(profile.noiseFloor * 100).toFixed(1)}%, StdDev: ${(profile.stdDev * 100).toFixed(1)}%, Threshold: ${((profile.noiseFloor + profile.stdDev * profile.sensitivityFactor) * 100).toFixed(1)}%`);
      } else {
        // Not enough samples, extend calibration
        console.log('VAD: Not enough samples for calibration, extending');
        calibrationTimerRef.current = setTimeout(() => {
          // Force complete with whatever we have
          const profile = createNoiseProfile(
            calibrationSamplesRef.current.length > 0 ? calibrationSamplesRef.current : [0.02, 0.03, 0.02],
            opts.initialSensitivityFactor
          );
          
          setNoiseProfile(profile);
          setIsCalibrating(false);
          console.log(`VAD: Forced calibration complete - Noise floor: ${(profile.noiseFloor * 100).toFixed(1)}%`);
        }, opts.calibrationDurationMs / 2);
      }
    }, opts.calibrationDurationMs);
    
  }, [opts.calibrationDurationMs, opts.initialSensitivityFactor]);
  
  /**
   * Reset the profile and start calibration again
   */
  const resetProfile = useCallback(() => {
    setNoiseProfile(null);
    startCalibration();
  }, [startCalibration]);
  
  /**
   * Force a recalibration of the noise profile
   */
  const forceRecalibration = useCallback(() => {
    // Only allow recalibration if we have a profile
    if (noiseProfile) {
      resetProfile();
    }
  }, [noiseProfile, resetProfile]);
  
  /**
   * Add a new audio level sample to the noise profile
   */
  const addAudioSample = useCallback((level: number) => {
    // During calibration phase, collect samples
    if (isCalibrating) {
      calibrationSamplesRef.current.push(level);
      return;
    }
    
    // Skip if no profile yet
    if (!noiseProfile) return;
    
    // Make a copy of the current profile for updates
    const updatedProfile = { ...noiseProfile };
    
    // Add new sample to history
    updatedProfile.samples.push(level);
    if (updatedProfile.samples.length > opts.maxSampleHistory) {
      updatedProfile.samples.shift();
    }
    
    // Calculate threshold for speech detection
    const threshold = noiseProfile.noiseFloor + (noiseProfile.stdDev * noiseProfile.sensitivityFactor);
    
    // Determine if this sample is "silence" based on current threshold
    const isSilent = level < threshold;
    
    if (isSilent) {
      consecutiveSpeechFramesRef.current = 0;
      consecuetiveSilenceFramesRef.current++;
      lastSilenceTimeRef.current = Date.now();
      
      // Check for recalibration opportunity after extended silence
      const silenceDuration = Date.now() - lastSilenceTimeRef.current;
      if (silenceDuration > opts.silenceDurationForRecalMs &&
          Date.now() - noiseProfile.lastCalibrationTime > opts.recalibrationIntervalMs) {
        
        // Use recent silence samples for recalibration
        const recentSilentSamples = updatedProfile.samples.slice(-Math.min(20, updatedProfile.samples.length));
        
        // Update noise floor with exponential moving average
        updatedProfile.noiseFloor = calculateMean(recentSilentSamples);
        updatedProfile.stdDev = calculateStdDev(recentSilentSamples, updatedProfile.noiseFloor);
        updatedProfile.lastCalibrationTime = Date.now();
        
        console.log(`VAD: Recalibrated noise profile - New floor: ${(updatedProfile.noiseFloor * 100).toFixed(1)}%, StdDev: ${(updatedProfile.stdDev * 100).toFixed(1)}%`);
      }
    } else {
      // Reset silence counter and tracking
      consecuetiveSilenceFramesRef.current = 0;
      consecutiveSpeechFramesRef.current++;
    }
    
    // Dynamically adjust sensitivity based on signal consistency
    if (updatedProfile.samples.length >= 10) {
      const recentSamples = updatedProfile.samples.slice(-10);
      const mean = calculateMean(recentSamples);
      const stdDev = calculateStdDev(recentSamples, mean);
      
      // Coefficient of variation (normalized measure of dispersion)
      const variationCoeff = mean > 0 ? stdDev / mean : 0;
      
      // Adjust sensitivity based on signal stability
      // More stable signals (low variation) = lower sensitivity
      // Highly variable signals = higher sensitivity
      if (variationCoeff > 0.5) {
        // High variation, increase sensitivity factor (less sensitive)
        updatedProfile.sensitivityFactor = Math.min(2.0, updatedProfile.sensitivityFactor + 0.05);
      } else if (variationCoeff < 0.2 && updatedProfile.sensitivityFactor > 1.3) {
        // Low variation, decrease sensitivity factor (more sensitive)
        updatedProfile.sensitivityFactor = Math.max(1.2, updatedProfile.sensitivityFactor - 0.05);
      }
    }
    
    // Update noise floor with exponential moving average (EMA)
    // but only if the current level is likely to be background noise, not speech
    // This allows the system to adapt to gradually changing background conditions
    if (level < noiseProfile.noiseFloor * 1.5) {
      // Apply EMA: newValue = alpha * currentValue + (1 - alpha) * oldValue
      updatedProfile.noiseFloor = (opts.emaAlpha * level) + 
                                 ((1 - opts.emaAlpha) * noiseProfile.noiseFloor);
    }
    
    // Update the noise profile
    setNoiseProfile(updatedProfile);
  }, [
    isCalibrating, 
    noiseProfile, 
    opts.emaAlpha, 
    opts.maxSampleHistory, 
    opts.recalibrationIntervalMs, 
    opts.silenceDurationForRecalMs
  ]);
  
  /**
   * Calculate the current dynamic threshold based on noise profile
   */
  const getDynamicThreshold = useCallback(() => {
    if (!noiseProfile) return 0.04; // Default fallback threshold
    
    // Dynamic threshold = noise floor + (standard deviation * sensitivity factor)
    return noiseProfile.noiseFloor + (noiseProfile.stdDev * noiseProfile.sensitivityFactor);
  }, [noiseProfile]);
  
  /**
   * Determine if the given audio level is considered speech
   */
  const isSpeechDetected = useCallback((level: number) => {
    if (!noiseProfile) return level > 0.04; // Default fallback
    
    const threshold = getDynamicThreshold();
    
    // Primary threshold check
    const isSpeech = level > threshold;
    
    // Required consecutive frames for stability
    if (isSpeech) {
      consecutiveSpeechFramesRef.current++;
      consecuetiveSilenceFramesRef.current = 0;
      
      // Need 2 consecutive frames above threshold to confirm speech
      return consecutiveSpeechFramesRef.current >= 2;
    } else {
      consecutiveSpeechFramesRef.current = 0;
      return false;
    }
  }, [noiseProfile, getDynamicThreshold]);
  
  // Start calibration on initial mount
  useEffect(() => {
    startCalibration();
    
    return () => {
      // Clean up calibration timer on unmount
      if (calibrationTimerRef.current) {
        clearTimeout(calibrationTimerRef.current);
      }
    };
  }, [startCalibration]);
  
  return {
    noiseProfile,
    isCalibrating,
    addAudioSample,
    getDynamicThreshold,
    isSpeechDetected,
    forceRecalibration,
    resetProfile
  };
}; 