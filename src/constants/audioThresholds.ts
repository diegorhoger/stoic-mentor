/**
 * Constants for audio processing thresholds
 */

/**
 * Voice Activity Detection settings
 */
export const VAD_SETTINGS = {
  // Level below which audio is considered silence (0-1)
  // Adjusted for our multi-method detection
  SILENCE_THRESHOLD: 0.145,  // Set just below ambient level of ~15.7%
  
  // Time in ms of continuous silence after which to stop recording
  SILENCE_TIMEOUT_MS: 10,  // Ultra-fast response
  
  // Minimum time in ms of speaking before silence detection activates
  MIN_SPEAKING_TIME_MS: 10,  // Match timeout for consistency
  
  // Number of consecutive silent frames to consider silence
  CONSECUTIVE_SILENCE_FRAMES: 2,  // Slight stability without much delay
  
  // Debounce period for re-enabling VAD after trigger (ms)
  VAD_DEBOUNCE_MS: 10,  // Match other timings
  
  // Whether to use adaptive thresholding
  USE_ADAPTIVE_THRESHOLDING: true,
  
  // Whether to use backend audio analysis service
  USE_BACKEND_ANALYSIS_SERVICE: true
};

/**
 * Audio level visualization settings
 */
export const AUDIO_LEVEL_SETTINGS = {
  // Minimum audio level to show any visualization (0-1)
  MIN_VISIBLE_LEVEL: 0.09,
  
  // Level considered "loud" for visualization purposes (0-1)
  LOUD_THRESHOLD: 0.4,
  
  // Maximum audio history to keep for smoothing
  AUDIO_HISTORY_MAX: 5
};

/**
 * Adaptive voice activity detection settings
 * These are used by the frontend adaptive processing system
 */
export const ADAPTIVE_VAD_SETTINGS = {
  // Initial sensitivity factor (multiplier for standard deviation)
  INITIAL_SENSITIVITY_FACTOR: 2.0,
  
  // Duration of initial calibration in milliseconds
  CALIBRATION_DURATION_MS: 2000,
  
  // How often to sample audio during calibration (ms)
  CALIBRATION_SAMPLE_RATE_MS: 100,
  
  // How often to recalibrate the system (ms)
  RECALIBRATION_INTERVAL_MS: 30000,  // 30 seconds
  
  // Duration of continuous silence before triggering recalibration (ms)
  SILENCE_DURATION_FOR_RECAL_MS: 5000,
  
  // Maximum number of samples to keep in history for noise floor calculation
  MAX_SAMPLE_HISTORY: 100,
  
  // Alpha factor for exponential moving average (noise floor smoothing)
  EMA_ALPHA: 0.05
};

/**
 * Backend audio analysis service configuration
 */
export const BACKEND_AUDIO_ANALYSIS_CONFIG = {
  // Starting sensitivity factor
  INITIAL_SENSITIVITY_FACTOR: 1.75,
  
  // Calibration duration in milliseconds
  CALIBRATION_DURATION_MS: 3000,
  
  // Auto-recalibration interval in milliseconds (0 to disable)
  RECALIBRATION_INTERVAL_MS: 60000, // 1 minute
  
  // Duration of silence that triggers recalibration
  SILENCE_DURATION_FOR_RECAL_MS: 10000, // 10 seconds
  
  // Maximum sample history to keep
  MAX_SAMPLE_HISTORY: 300,
  
  // Smoothing factor for audio level (0-1, higher = more smoothing)
  SMOOTHING_FACTOR: 0.3,
  
  // Consecutive frames needed to change speech state
  CONSECUTIVE_FRAMES_THRESHOLD: 2,
  
  // Enable debug mode
  DEBUG: false
}; 