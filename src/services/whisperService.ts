import { API_ENDPOINTS } from '../constants/app';
import { WhisperApiResponse, WhisperError, MockWhisperResponse, TranscriptionOptions } from '../types';

/**
 * Transcribes audio using the backend Whisper integration
 * Currently configured to work with both the mock API and a direct OpenAI integration
 */
export const transcribeAudio = async (audioBlob: Blob, options?: TranscriptionOptions): Promise<string> => {
  try {
    // Check if we should use direct OpenAI integration or the mock API
    const envValue = import.meta.env.VITE_USE_DIRECT_WHISPER;
    const useDirectApi = envValue === 'true' || envValue === true;
    
    console.log('🎤 Transcribing audio...');
    console.log('🔧 Using direct Whisper API:', useDirectApi);
    console.log('🔧 ENV value type:', typeof envValue, 'value:', envValue);
    console.log('📦 Audio blob size:', audioBlob.size);
    
    if (useDirectApi) {
      try {
        console.log('🔌 Attempting to use OpenAI Whisper API directly');
        return await transcribeWithOpenAI(audioBlob, options);
      } catch (error) {
        console.error('❌ OpenAI API failed, falling back to mock API:', error);
        console.log('🔄 Falling back to mock API at:', import.meta.env.VITE_MOCK_API_URL);
        return await transcribeWithMockApi(audioBlob);
      }
    } else {
      console.log('🔌 Using mock API at:', import.meta.env.VITE_MOCK_API_URL);
      return await transcribeWithMockApi(audioBlob);
    }
  } catch (error) {
    console.error('Error transcribing audio:', error);
    throw error;
  }
};

/**
 * Extracts the project ID from a project-scoped API key
 * Project-scoped keys have the format "sk-proj-[projectId]_[rest]"
 */
const extractProjectId = (apiKey: string): string | null => {
  if (!apiKey.startsWith('sk-proj-')) {
    return null;
  }
  
  // Extract everything after 'sk-proj-' up to the first underscore
  const match = apiKey.match(/^sk-proj-([^_]+)/);
  if (match && match[1]) {
    console.log('Extracted project ID part:', match[1]);
    return match[1];
  }
  
  return null;
};

/**
 * Transcribes audio directly with OpenAI's Whisper API
 */
const transcribeWithOpenAI = async (audioBlob: Blob, options?: TranscriptionOptions): Promise<string> => {
  try {
    const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
    
    console.log('OpenAI API Key available:', !!apiKey);
    console.log('API Key first 10 chars:', apiKey ? apiKey.substring(0, 10) + '...' : 'No key');
    
    if (!apiKey) {
      throw new Error('OpenAI API key is not configured. Please add VITE_OPENAI_API_KEY to your environment variables.');
    }
    
    if (!apiKey.startsWith('sk-') || apiKey.length < 20) {
      throw new Error('Invalid OpenAI API key format. The key should start with "sk-" and be at least 20 characters long.');
    }
    
    // Project-scoped keys are now supported with the additional headers
    // These keys typically start with 'sk-proj-'
    const isProjectKey = apiKey.startsWith('sk-proj-');
    let projectId = null;
    
    if (isProjectKey) {
      console.log('Using project-scoped API key with organization and project headers');
      projectId = extractProjectId(apiKey);
      console.log('Extracted project ID:', projectId);
      
      if (!projectId) {
        console.warn('Could not extract project ID from key, will use default');
      }
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
    
    console.log('Making OpenAI Whisper API request with options:', {
      model: options?.model || 'whisper-1',
      language: options?.language,
      prompt: options?.prompt ? options.prompt.substring(0, 20) + '...' : undefined,
      temperature: options?.temperature
    });
    
    // Make request to OpenAI API
    const headers: Record<string, string> = {
      // Format according to the provided curl example
      'Authorization': `Bearer ${apiKey}`,
      'OpenAI-Organization': 'org-q2FnHJDFUAA89gSEDNw4uTgi',
    };
    
    // Removing the OpenAI-Project header as it's causing authentication issues
    console.log('Request headers - simplified version:', headers);
    
    const response = await fetch(`${API_ENDPOINTS.baseOpenAIUrl}${API_ENDPOINTS.whisperEndpoint}`, {
      method: 'POST',
      headers,
      body: formData,
    });
    
    if (!response.ok) {
      const errorData = await response.json() as WhisperError;
      console.error('OpenAI Whisper API error:', errorData);
      throw new Error(errorData.error?.message || 'Failed to transcribe audio with OpenAI');
    }
    
    const result = await response.json() as WhisperApiResponse;
    console.log('Whisper API response:', result);
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

  const response = await fetch(`${API_ENDPOINTS.baseUrl}${API_ENDPOINTS.transcribe}`, {
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