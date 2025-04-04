/**
 * Utility functions for audio signal analysis
 */

/**
 * Calculate the Root Mean Square (RMS) value of an audio buffer
 * This measures the average power of the signal
 * 
 * @param buffer - Audio buffer (Float32Array)
 * @returns RMS value between 0 and 1
 */
export const calculateRMS = (buffer: Float32Array): number => {
  let sum = 0;
  
  // Sum the squares of all samples
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i] * buffer[i];
  }
  
  // Return the square root of the average
  const rms = Math.sqrt(sum / buffer.length);
  
  // Since audio samples are typically in the range [-1, 1], 
  // the RMS will be in the range [0, 1]
  return rms;
};

/**
 * Calculate the arithmetic mean of an array of numbers
 * 
 * @param values - Array of numerical values
 * @returns Mean value
 */
export const calculateMean = (values: number[]): number => {
  if (values.length === 0) return 0;
  
  const sum = values.reduce((acc, val) => acc + val, 0);
  return sum / values.length;
};

/**
 * Calculate the standard deviation of an array of numbers
 * 
 * @param values - Array of numerical values
 * @param mean - Optional pre-calculated mean (for efficiency)
 * @returns Standard deviation
 */
export const calculateStdDev = (values: number[], mean?: number): number => {
  if (values.length <= 1) return 0;
  
  // Calculate mean if not provided
  const avg = mean !== undefined ? mean : calculateMean(values);
  
  // Sum of squared differences from the mean
  const sumSquaredDiffs = values.reduce((acc, val) => {
    const diff = val - avg;
    return acc + diff * diff;
  }, 0);
  
  // Calculate variance and return its square root
  return Math.sqrt(sumSquaredDiffs / values.length);
};

/**
 * Calculate Zero-Crossing Rate (ZCR) of an audio buffer
 * Measures how often the signal crosses the zero axis
 * Useful for differentiating between voice and noise
 * 
 * @param buffer - Audio buffer (Float32Array)
 * @returns ZCR value (0 to 1, where higher values indicate more crossings)
 */
export const calculateZCR = (buffer: Float32Array): number => {
  if (buffer.length <= 1) return 0;
  
  let crossings = 0;
  
  // Count sign changes between consecutive samples
  for (let i = 1; i < buffer.length; i++) {
    if ((buffer[i - 1] >= 0 && buffer[i] < 0) || 
        (buffer[i - 1] < 0 && buffer[i] >= 0)) {
      crossings++;
    }
  }
  
  // Normalize by buffer length to get rate between 0 and 1
  return crossings / (buffer.length - 1);
};

/**
 * Create an initial noise profile
 * 
 * @param samples - Initial audio samples
 * @param sensitivityFactor - Initial sensitivity factor
 * @returns A new NoiseProfile object
 */
export const createNoiseProfile = (
  samples: number[], 
  sensitivityFactor: number
): {
  noiseFloor: number;
  stdDev: number;
  samples: number[];
  sensitivityFactor: number;
  lastCalibrationTime: number;
  calibrationComplete: boolean;
} => {
  const noiseFloor = calculateMean(samples);
  const stdDev = calculateStdDev(samples, noiseFloor);
  
  return {
    noiseFloor,
    stdDev,
    samples: [...samples],
    sensitivityFactor,
    lastCalibrationTime: Date.now(),
    calibrationComplete: true
  };
}; 