import { API_ENDPOINTS } from '../constants/app';
import { WhisperApiResponse, WhisperError, MockWhisperResponse, TranscriptionOptions } from '../types';

/**
 * Transcribes audio using the backend Whisper integration
 * Currently configured to work with both the mock API and a direct OpenAI integration
 */
export const transcribeAudio = async (audioBlob: Blob, options?: TranscriptionOptions): Promise<string> => {
  try {
    // Check if we should use direct OpenAI integration or the mock API
    const useDirectApi = import.meta.env.VITE_USE_DIRECT_WHISPER === 'true';
    
    if (useDirectApi) {
      return await transcribeWithOpenAI(audioBlob, options);
    } else {
      return await transcribeWithMockApi(audioBlob);
    }
  } catch (error) {
    console.error('Error transcribing audio:', error);
    throw error;
  }
};

/**
 * Transcribes audio directly with OpenAI's Whisper API
 */
const transcribeWithOpenAI = async (audioBlob: Blob, options?: TranscriptionOptions): Promise<string> => {
  try {
    const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
    
    if (!apiKey) {
      throw new Error('OpenAI API key is not configured. Please add VITE_OPENAI_API_KEY to your environment variables.');
    }
    
    // Convert blob to file for FormData
    const audioFile = new File([audioBlob], 'speech.wav', { type: 'audio/wav' });
    
    // Create form data for the API request
    const formData = new FormData();
    formData.append('file', audioFile);
    formData.append('model', options?.model || 'whisper-1');
    
    // Add optional parameters if provided
    if (options?.language) {
      formData.append('language', options.language);
    }
    
    if (options?.prompt) {
      formData.append('prompt', options.prompt);
    }
    
    if (options?.temperature !== undefined) {
      formData.append('temperature', options.temperature.toString());
    }
    
    // Make request to OpenAI API
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData,
    });
    
    if (!response.ok) {
      const errorData = await response.json() as WhisperError;
      throw new Error(errorData.error?.message || 'Failed to transcribe audio with OpenAI');
    }
    
    const result = await response.json() as WhisperApiResponse;
    return result.text;
  } catch (error) {
    console.error('Error with OpenAI transcription:', error);
    throw error;
  }
};

/**
 * Transcribes audio using the mock API endpoint
 */
const transcribeWithMockApi = async (audioBlob: Blob): Promise<string> => {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'speech.wav');

  const response = await fetch(`${API_ENDPOINTS.baseUrl}${API_ENDPOINTS.whisper}`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to transcribe audio with mock API');
  }

  const result = await response.json() as MockWhisperResponse;
  // Handle both formats for backward compatibility
  return result.text || result.transcription;
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

/**
 * Helper function to convert long audio files to smaller chunks
 * Whisper API has a 25MB limit, so this helps process longer recordings
 */
export const splitAudioIfNeeded = async (audioBlob: Blob, maxSizeInMB = 24): Promise<Blob[]> => {
  const sizeMB = audioBlob.size / (1024 * 1024);
  
  if (sizeMB < maxSizeInMB) {
    return [audioBlob];
  }
  
  // For now, we'll just return the original blob and log a warning
  // In a production app, you'd implement proper audio chunking here
  console.warn(`Audio file is ${sizeMB.toFixed(2)}MB, which is close to the 25MB Whisper API limit.`);
  return [audioBlob];
}; 