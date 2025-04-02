import { API_ENDPOINTS } from '../constants/app';

/**
 * Generic function to handle API requests
 */
const fetchAPI = async <T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> => {
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Send audio data to Whisper API for transcription
 */
export const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
  const formData = new FormData();
  formData.append('audio', audioBlob);

  return fetchAPI<string>(API_ENDPOINTS.whisper, {
    method: 'POST',
    body: formData,
  });
};

/**
 * Send text to GPT API for response generation
 */
export const generateResponse = async (
  text: string,
  mentorPrompt: string
): Promise<string> => {
  return fetchAPI<string>(API_ENDPOINTS.gpt, {
    method: 'POST',
    body: JSON.stringify({
      text,
      prompt: mentorPrompt,
    }),
  });
};

/**
 * Send text to TTS API for audio generation
 */
export const generateAudio = async (
  text: string,
  voiceId: string
): Promise<Blob> => {
  const response = await fetchAPI<{ audioUrl: string }>(API_ENDPOINTS.tts, {
    method: 'POST',
    body: JSON.stringify({
      text,
      voiceId,
    }),
  });

  // Fetch the audio from the URL
  const audioResponse = await fetch(response.audioUrl);
  return audioResponse.blob();
}; 