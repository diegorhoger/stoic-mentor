import { API_ENDPOINTS } from '../constants/app';

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
 * @param mentorPrompt The base mentor prompt (personality)
 * @param conversationContext Additional context about the conversation
 * @returns A complete system prompt
 */
export function createSystemPrompt(mentorPrompt: string, conversationContext?: string): string {
  let systemPrompt = mentorPrompt;
  
  // Add conversation context if provided
  if (conversationContext) {
    systemPrompt += `\n\nConversation context: ${conversationContext}`;
  }
  
  // Add global instructions for all mentors
  systemPrompt += `\n\nGeneral instructions:
- Keep responses concise and direct, aimed at spoken conversation
- Speak with wisdom and insight in a stoic philosophical voice
- Respond as if speaking aloud, not writing
- Avoid complex structures like lists or citations
- Respond directly to the user's query in a conversational tone`;
  
  return systemPrompt;
}

/**
 * Determines if we should use direct OpenAI integration
 */
export function useDirectOpenAI(): boolean {
  const envValue = import.meta.env.VITE_USE_DIRECT_OPENAI;
  const useDirectApi = envValue === 'true' || envValue === true;
  console.log('Using direct OpenAI API:', useDirectApi);
  console.log('ENV value type:', typeof envValue, 'value:', envValue);
  return useDirectApi;
} 