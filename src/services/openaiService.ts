import { API_ENDPOINTS } from '../constants/app';
import { createMentorPrompt, mentorPrompt } from '../constants/mentorPrompts';

console.log('🚀 openaiService.ts file loaded');

/**
 * Represents a chat message in the OpenAI API format
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Options for generating chat completions
 */
export interface ChatCompletionOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stream?: boolean;
}

/**
 * Generate a chat completion using OpenAI's API directly
 * 
 * @param messages The conversation history in OpenAI format
 * @param options Optional parameters for the API request
 * @returns An async generator that yields response chunks as they arrive
 */
export async function* streamChatCompletionWithOpenAI(
  messages: ChatMessage[],
  options: ChatCompletionOptions = {}
): AsyncGenerator<string> {
  console.log('🌐 streamChatCompletionWithOpenAI called with messages:', messages.length);
  
  // Detailed logging of all messages being sent to OpenAI
  console.log('🔍 OPENAI REQUEST - COMPLETE MESSAGE PAYLOAD:');
  messages.forEach((msg, index) => {
    console.log(`🔍 OPENAI MESSAGE [${index}] - Role: ${msg.role}`);
    console.log(`🔍 OPENAI MESSAGE [${index}] - Content: 
${msg.content}`);
  });
  
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  
  console.log('OpenAI API Key available for chat:', !!apiKey);
  console.log('API Key first 10 chars:', apiKey ? apiKey.substring(0, 10) + '...' : 'No key');
  
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured. Please add VITE_OPENAI_API_KEY to your environment variables.');
  }

  // Default options
  const defaultOptions: ChatCompletionOptions = {
    model: 'gpt-4',
    temperature: 0.7,
    max_tokens: 1000,
    stream: true,
  };

  // Merge options with defaults
  const requestOptions = { ...defaultOptions, ...options };
  console.log('OpenAI request options:', {
    model: requestOptions.model,
    temperature: requestOptions.temperature,
    max_tokens: requestOptions.max_tokens,
    stream: requestOptions.stream,
  });

  try {
    console.log('Making OpenAI Chat API request...');
    
    // Setup headers based on API key type
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      // Format according to the provided curl example
      'Authorization': `Bearer ${apiKey}`,
      'OpenAI-Organization': 'org-q2FnHJDFUAA89gSEDNw4uTgi',
    };
    
    // Removing the OpenAI-Project header as it's causing authentication issues
    console.log('Request headers - simplified version:', headers);
    
    const response = await fetch(`${API_ENDPOINTS.baseOpenAIUrl}${API_ENDPOINTS.chatEndpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        messages,
        ...requestOptions,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('OpenAI API error response:', error);
      throw new Error(error.error?.message || 'Error generating chat completion');
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    console.log('OpenAI API response received, starting to stream...');
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        console.log('Stream complete');
        break;
      }

      // Decode the chunk and add it to the buffer
      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      // Process complete lines
      let lineEnd;
      while ((lineEnd = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, lineEnd).trim();
        buffer = buffer.slice(lineEnd + 1);

        if (line.startsWith('data: ')) {
          const data = line.slice(5).trim();
          
          // Check for the end of the stream
          if (data === '[DONE]') {
            console.log('Stream [DONE] marker received');
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices[0]?.delta?.content;
            if (content) {
              yield content;
            }
          } catch (error) {
            console.error('Error parsing JSON from stream:', error, 'Line:', line);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error streaming chat completion:', error);
    throw error;
  }
}

/**
 * Generate a chat completion using the backend API
 * 
 * @param messages The conversation history
 * @param options Optional parameters for the API request
 * @returns The complete response as a string
 */
export async function generateChatCompletion(
  messages: ChatMessage[],
  options: ChatCompletionOptions = {}
): Promise<string> {
  try {
    const response = await fetch(`${API_ENDPOINTS.baseUrl}${API_ENDPOINTS.gpt}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages,
        options,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to generate chat completion');
    }

    const result = await response.json();
    return result.content || result.text || '';
  } catch (error) {
    console.error('Error generating chat completion:', error);
    throw error;
  }
}

/**
 * Create a context-aware system prompt for a mentor
 * 
 * @param mentor The mentor to create a prompt for (accepts full name or first name)
 * @param conversationContext Additional context about the conversation
 * @param useVerbosePrompt Whether to use the full detailed prompt or the concise version
 * @returns A complete system prompt
 */
export function createSystemPrompt(
  mentor: string,
  conversationContext?: string,
  useVerbosePrompt: boolean = true
): string {
  // Normalize mentor name to just the first name for consistency
  let mentorFirstName: 'Marcus' | 'Seneca' | 'Epictetus';
  
  // Standardize the mentor name format
  const normalizedName = mentor.toLowerCase().trim();
  
  if (normalizedName.includes('marcus') || normalizedName.includes('aurelius')) {
    mentorFirstName = 'Marcus';
  } else if (normalizedName.includes('seneca')) {
    mentorFirstName = 'Seneca';
  } else if (normalizedName.includes('epictetus')) {
    mentorFirstName = 'Epictetus';
  } else {
    // Default to Marcus if the name is not recognized
    console.warn(`Unknown mentor name: "${mentor}", defaulting to Marcus`);
    mentorFirstName = 'Marcus';
  }
  
  console.log(`Creating system prompt for "${mentor}" (normalized to "${mentorFirstName}")`);
  
  // Use either the verbose or concise prompt based on the parameter
  const systemPrompt = useVerbosePrompt 
    ? createMentorPrompt(mentorFirstName)
    : mentorPrompt(mentorFirstName);
  
  // Add conversation context if provided
  let finalPrompt = systemPrompt;
  if (conversationContext) {
    finalPrompt += `\n\nConversation context: ${conversationContext}`;
  }
  
  return finalPrompt;
}

/**
 * Determines if we should use direct OpenAI integration
 */
export function useDirectOpenAI(): boolean {
  const envValue = import.meta.env.VITE_USE_DIRECT_OPENAI;
  console.log('🔄 useDirectOpenAI() called');
  console.log('🔄 Raw environment value:', envValue);
  console.log('🔄 Value type:', typeof envValue);
  console.log('🔄 Value comparison with "true":', envValue === 'true');
  console.log('🔄 Value comparison with true:', envValue === true);
  
  const useDirectApi = envValue === 'true' || envValue === true;
  console.log('🔄 Final determination - Using direct OpenAI API:', useDirectApi);
  return useDirectApi;
}

/**
 * Sanitizes a response to remove acknowledgment phrases
 * 
 * @param text The text to sanitize
 * @returns The sanitized text
 */
export function sanitizeResponse(text: string): string {
  console.log(`🧹 SANITIZE - Starting with text: "${text.substring(0, 100)}..."`);
  
  // List of acknowledgment phrases to check for and remove
  const acknowledgmentPhrases = [
    /^I understand what you're saying/i,
    /^I understand what you are saying/i,
    /^I see what you're saying/i,
    /^I see what you are saying/i,
    /^I understand your question/i,
    /^Let me think about that/i,
    /^I appreciate your question/i,
    /^Thank you for your question/i,
    /^As a Stoic philosopher/i,
    /^From a Stoic perspective/i,
    /^Looking at this from a Stoic perspective/i,
    /^Speaking as a Stoic/i,
    /^I understand you're asking/i,
    /^I understand you are asking/i,
    /^I am here/i,
    /^Yes, I am here/i,
    /^Indeed I am/i,
    /^Present and attentive/i,
    /^Present and listening/i,
    /^Yes, at your service/i,
    /^Indeed\./i,
  ];
  
  let sanitized = text;
  let wasModified = false;
  
  // Check each phrase against the text
  for (const phrase of acknowledgmentPhrases) {
    if (phrase.test(sanitized)) {
      console.log(`🧹 SANITIZE - Found acknowledgment phrase matching: ${phrase}`);
      
      // Find the first sentence ending after the acknowledgment phrase
      const phraseMatch = sanitized.match(phrase);
      if (phraseMatch && phraseMatch.index !== undefined) {
        const startIndex = phraseMatch.index;
        // Find the end of the first sentence
        const endIndex = sanitized.indexOf('.', startIndex);
        
        if (endIndex !== -1) {
          // Remove the entire first sentence containing the acknowledgment
          sanitized = sanitized.substring(endIndex + 1).trim();
          wasModified = true;
        }
      }
    }
  }
  
  if (wasModified) {
    console.log(`🧹 SANITIZE - Response was modified!`);
    console.log(`🧹 SANITIZE - Sanitized text: "${sanitized.substring(0, 100)}..."`);
  } else {
    console.log(`🧹 SANITIZE - No acknowledgment phrases found`);
  }
  
  return sanitized;
} 