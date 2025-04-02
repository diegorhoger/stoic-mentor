import { API_ENDPOINTS } from '../constants/app';

/**
 * Transcribes audio using the backend Whisper integration
 */
export const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
  try {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'speech.wav');

    const response = await fetch(`${API_ENDPOINTS.baseUrl}${API_ENDPOINTS.whisper}`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to transcribe audio');
    }

    const result = await response.json();
    return result.transcription;
  } catch (error) {
    console.error('Error transcribing audio:', error);
    throw error;
  }
};

/**
 * Determines if the browser supports microphone access
 */
export const isMicrophoneSupported = (): boolean => {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
};

/**
 * Requests microphone permissions
 */
export const requestMicrophonePermission = async (): Promise<boolean> => {
  try {
    if (!isMicrophoneSupported()) {
      return false;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Clean up - stop all tracks
    stream.getTracks().forEach(track => track.stop());
    
    return true;
  } catch (error) {
    console.error('Error requesting microphone permission:', error);
    return false;
  }
}; 