/**
 * Types related to audio processing and voice activity detection
 */

/**
 * Represents a profile of background noise characteristics
 * Used for adaptive thresholding in voice activity detection
 */
export interface NoiseProfile {
  /**
   * Average background noise level (0-1 normalized)
   */
  noiseFloor: number;
  
  /**
   * Standard deviation of noise samples
   */
  stdDev: number;
  
  /**
   * Recent audio samples used for calculations
   */
  samples: number[];
  
  /**
   * Dynamic multiplier for threshold calculation
   * Higher values = less sensitive detection
   * Typically ranges from 1.2 to 2.0
   */
  sensitivityFactor: number;
  
  /**
   * Timestamp of last calibration update
   */
  lastCalibrationTime: number;
  
  /**
   * Whether initial calibration has been completed
   */
  calibrationComplete: boolean;
}

/**
 * Configuration options for adaptive thresholding
 */
export interface AdaptiveVADOptions {
  /**
   * Duration of initial calibration in milliseconds
   * Default: 2000ms (2 seconds)
   */
  calibrationDurationMs?: number;
  
  /**
   * Interval between samples during calibration
   * Default: 100ms
   */
  calibrationSampleRateMs?: number;
  
  /**
   * Initial sensitivity factor
   * Default: 1.5
   */
  initialSensitivityFactor?: number;
  
  /**
   * Time between recalibration checks in milliseconds
   * Default: 5000ms (5 seconds)
   */
  recalibrationIntervalMs?: number;
  
  /**
   * Required silence duration before recalibration in milliseconds
   * Default: 2000ms (2 seconds)
   */
  silenceDurationForRecalMs?: number;
  
  /**
   * Maximum number of samples to keep in history
   * Default: 50
   */
  maxSampleHistory?: number;
  
  /**
   * Smoothing factor for exponential moving average (0-1)
   * Lower = slower adaptation, Higher = faster adaptation
   * Default: 0.1
   */
  emaAlpha?: number;
}

/**
 * Constants for adaptive voice detection
 */
export const ADAPTIVE_VAD_DEFAULTS = {
  CALIBRATION_DURATION_MS: 2000,
  CALIBRATION_SAMPLE_RATE_MS: 100,
  INITIAL_SENSITIVITY_FACTOR: 1.5,
  RECALIBRATION_INTERVAL_MS: 5000,
  SILENCE_DURATION_FOR_RECAL_MS: 2000,
  MAX_SAMPLE_HISTORY: 50,
  EMA_ALPHA: 0.1
}; 