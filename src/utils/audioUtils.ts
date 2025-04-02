import { AUDIO_SETTINGS } from '../constants/app';

/**
 * Calculates the audio level from an AudioBuffer
 */
export const calculateAudioLevel = (audioBuffer: AudioBuffer): number => {
  const data = audioBuffer.getChannelData(0);
  let sum = 0;
  
  for (let i = 0; i < data.length; i++) {
    sum += data[i] * data[i];
  }
  
  return Math.sqrt(sum / data.length);
};

/**
 * Creates an AudioContext with the specified settings
 */
export const createAudioContext = (): AudioContext => {
  return new AudioContext({
    sampleRate: AUDIO_SETTINGS.sampleRate,
  });
};

/**
 * Converts an AudioBuffer to a Blob
 * Note: This is a placeholder implementation
 */
export const audioBufferToBlob = async (): Promise<Blob> => {
  // This is a placeholder - actual implementation would depend on the audio format
  // and encoding requirements
  return new Blob([], { type: 'audio/wav' });
};

/**
 * Checks if the browser supports the required audio features
 */
export const checkAudioSupport = (): boolean => {
  // Use type assertion for webkitAudioContext
  return !!(window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
}; 