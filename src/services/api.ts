import { API_ENDPOINTS } from '../constants/app';
import { sanitizeResponse } from './openaiService';

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
  
  const fullUrl = `${API_ENDPOINTS.baseUrl}${API_ENDPOINTS.transcribe}`;
  console.log(`🎤 Making transcription request to: ${fullUrl}`);

  return fetchAPI<string>(fullUrl, {
    method: 'POST',
    body: formData,
  });
};

/**
 * Send text to GPT API for response generation
 */
export const generateResponse = async (
  text: string,
  mentor: { name: string },
  conversationHistory: string[] = []
): Promise<string> => {
  console.log(`🔍 FLOW TRACE [generateResponse] - Starting with text: "${text.substring(0, 30)}..."`);
  console.log(`🔍 FLOW TRACE [generateResponse] - Selected mentor: ${mentor.name}`);
  console.log(`🔍 FLOW TRACE [generateResponse] - Conversation history: ${conversationHistory.length} messages`);

  // Ensure mentor name is properly formatted
  let properMentorName = mentor.name;
  
  // Add robust mentor name normalization to ensure it matches what backend expects
  if (!properMentorName || properMentorName.trim() === '') {
    console.warn('🔍 FLOW TRACE [generateResponse] - Empty mentor name, defaulting to "Marcus Aurelius"');
    properMentorName = "Marcus Aurelius";
  }
  
  // Log the mentor data being used
  console.log(`🔍 FLOW TRACE [generateResponse] - Using mentor: ${JSON.stringify(mentor)}`);
  console.log(`🔍 FLOW TRACE [generateResponse] - Sending mentor name: ${properMentorName}`);

  const enhancedPrompt = `[CRITICAL: Respond directly as ${properMentorName} without using acknowledgment phrases like "I understand" or "I see what you're saying" or any variation. Never acknowledge the format of the question. Start your response immediately with substance.]
    \n\n${text}`;
  
  try {
    const url = `${API_ENDPOINTS.baseUrl}${API_ENDPOINTS.gpt}`;
    console.log(`🔍 FLOW TRACE [generateResponse] - API Call to: ${url}`);
    
    const payload = {
      mentor: properMentorName,  // Send the complete mentor name
      text: enhancedPrompt,
      conversationHistory: conversationHistory
    };
    
    console.log(`🔍 FLOW TRACE [generateResponse] - Request payload:`, { 
      mentor: properMentorName, 
      text: enhancedPrompt.substring(0, 100) + "...",
      historyLength: conversationHistory.length
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`🔍 FLOW TRACE [generateResponse] - API Error: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    console.log(`🔍 FLOW TRACE [generateResponse] - Response status: ${response.status}`);
    const responseData = await response.json();
    console.log(`🔍 FLOW TRACE [generateResponse] - Raw response data:`, responseData);

    if (!responseData.text) {
      console.error(`🔍 FLOW TRACE [generateResponse] - Missing text in response:`, responseData);
      throw new Error("Missing text in response");
    }

    console.log(`🔍 FLOW TRACE [generateResponse] - Response text (first 100 chars): "${responseData.text.substring(0, 100)}..."`);
    
    // Sanitize the response to remove any acknowledgment phrases
    const sanitizedResponse = sanitizeResponse(responseData.text);
    console.log(`🔍 FLOW TRACE [generateResponse] - BEFORE sanitization: "${responseData.text.substring(0, 100)}..."`);
    console.log(`🔍 FLOW TRACE [generateResponse] - AFTER sanitization: "${sanitizedResponse.substring(0, 100)}..."`);
    
    // Check if sanitization made any changes
    if (sanitizedResponse === responseData.text) {
      console.log(`🔍 FLOW TRACE [generateResponse] - ⚠️ Sanitization made NO changes!`);
    } else {
      console.log(`🔍 FLOW TRACE [generateResponse] - ✅ Sanitization successfully modified the response`);
    }

    return sanitizedResponse;
  } catch (error) {
    console.error(`🔍 FLOW TRACE [generateResponse] - Error:`, error);
    throw error;
  }
};

/**
 * Send text to TTS API for audio generation
 */
export const generateAudio = async (
  text: string,
  voiceId: string
): Promise<Blob> => {
  const fullUrl = `${API_ENDPOINTS.baseUrl}${API_ENDPOINTS.tts}`;
  console.log(`🔊 Making TTS request to: ${fullUrl}`);

  const response = await fetchAPI<{ audioUrl: string }>(fullUrl, {
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