import { API_ENDPOINTS } from '../constants/app';

/**
 * Interface for ElevenLabs Voice
 */
interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category?: string;
  description?: string;
  preview_url?: string;
  labels?: Record<string, string>;
  settings?: {
    stability: number;
    similarity_boost: number;
  };
}

/**
 * Converts text to speech using either the ElevenLabs API or the mock API
 */
export const generateSpeech = async (
  text: string,
  speakerId: number,
  context: Array<{
    text: string;
    speaker: number;
    audio: string; // Base64 encoded audio
  }> = []
): Promise<Blob> => {
  try {
    // Check if we should use direct ElevenLabs integration
    const useDirectApi = import.meta.env.VITE_USE_DIRECT_TTS === 'true' || import.meta.env.VITE_USE_DIRECT_TTS === true;
    
    console.log('🔊 Generating speech...');
    console.log('🔧 Using direct ElevenLabs API:', useDirectApi);
    console.log('🔧 ENV value:', import.meta.env.VITE_USE_DIRECT_TTS);
    
    if (useDirectApi) {
      try {
        console.log('🔌 Attempting to use ElevenLabs API directly');
        return await generateSpeechWithElevenLabs(text, speakerId);
      } catch (error) {
        console.error('❌ ElevenLabs API failed, falling back to mock API:', error);
        console.log('🔄 Falling back to mock API at:', import.meta.env.VITE_MOCK_API_URL);
        return await generateSpeechWithMockApi(text, speakerId, context);
      }
    } else {
      console.log('🔌 Using mock API at:', import.meta.env.VITE_MOCK_API_URL);
      return await generateSpeechWithMockApi(text, speakerId, context);
    }
  } catch (error) {
    console.error('Error generating speech:', error);
    throw error;
  }
};

/**
 * Converts text to speech using the ElevenLabs API
 */
const generateSpeechWithElevenLabs = async (text: string, speakerId: number): Promise<Blob> => {
  const apiKey = import.meta.env.VITE_ELEVENLABS_API_KEY;
  
  console.log('ElevenLabs API Key available:', !!apiKey);
  
  if (!apiKey) {
    throw new Error('ElevenLabs API key is not configured. Please add VITE_ELEVENLABS_API_KEY to your environment variables.');
  }
  
  // Map speaker ID to ElevenLabs voice ID and names
  // These are default voices available in all ElevenLabs accounts
  const voiceMap = [
    { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni' },      // Marcus Aurelius - Antoni (deep authoritative male voice)
    { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold' },      // Seneca - Arnold (powerful male voice)
    { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam' }         // Epictetus - Adam (older male voice)
  ];
  
  // Check if we have cached voices from the user account
  let userVoices: ElevenLabsVoice[] = [];
  try {
    userVoices = await fetchElevenLabsVoices(apiKey);
    console.log(`Found ${userVoices.length} voices in your ElevenLabs account`);
    
    // Try to find voices by name as requested
    const marcusVoice = userVoices.find(v => v.name.toLowerCase().includes('clyde'));
    const senecaVoice = userVoices.find(v => 
      v.name.toLowerCase().includes('mark') && 
      (v.name.toLowerCase().includes('natural') || v.name.toLowerCase().includes('conversation'))
    );
    const epictetusVoice = userVoices.find(v => 
      v.name.toLowerCase().includes('grandpa') || 
      (v.name.toLowerCase().includes('spuds') && v.name.toLowerCase().includes('oxley'))
    );
    
    // Update voice map with found voices if they exist
    if (marcusVoice) {
      console.log(`Found custom voice for Marcus: ${marcusVoice.name} (${marcusVoice.voice_id})`);
      voiceMap[0] = { id: marcusVoice.voice_id, name: marcusVoice.name };
    }
    
    if (senecaVoice) {
      console.log(`Found custom voice for Seneca: ${senecaVoice.name} (${senecaVoice.voice_id})`);
      voiceMap[1] = { id: senecaVoice.voice_id, name: senecaVoice.name };
    }
    
    if (epictetusVoice) {
      console.log(`Found custom voice for Epictetus: ${epictetusVoice.name} (${epictetusVoice.voice_id})`);
      voiceMap[2] = { id: epictetusVoice.voice_id, name: epictetusVoice.name };
    }
  } catch (error) {
    console.warn('Could not fetch ElevenLabs voices, using default voices:', error);
  }
  
  if (speakerId < 0 || speakerId >= voiceMap.length) {
    throw new Error(`Invalid speaker ID: ${speakerId}. Must be between 0 and ${voiceMap.length - 1}.`);
  }
  
  const selectedVoice = voiceMap[speakerId];
  
  try {
    // ElevenLabs API endpoint for text-to-speech
    const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoice.id}`;
    
    // Set up the request options
    const options = {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': apiKey
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    };
    
    console.log(`Making ElevenLabs API request using ${selectedVoice.name} voice (ID: ${selectedVoice.id})`);
    
    const response = await fetch(endpoint, options);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs API error:', errorText);
      
      // Check if the error is related to credit limits
      if (response.status === 429 || errorText.includes('credit') || errorText.includes('limit')) {
        console.log('⚠️ ElevenLabs credits may have run out, falling back to OpenAI TTS');
        return await generateSpeechWithOpenAI(text);
      }
      
      throw new Error(`ElevenLabs API error: ${response.status} ${response.statusText}`);
    }
    
    return await response.blob();
  } catch (error) {
    console.error('Error with ElevenLabs TTS:', error);
    
    // If any error occurs, try OpenAI's TTS as a fallback
    console.log('⚠️ Error with ElevenLabs, falling back to OpenAI TTS');
    return await generateSpeechWithOpenAI(text);
  }
};

/**
 * Fetches available voices from ElevenLabs account
 */
const fetchElevenLabsVoices = async (apiKey: string): Promise<ElevenLabsVoice[]> => {
  try {
    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'xi-api-key': apiKey
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch voices: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.voices || [];
  } catch (error) {
    console.error('Error fetching ElevenLabs voices:', error);
    return [];
  }
};

/**
 * Fallback to OpenAI's TTS API (using Ash voice) when ElevenLabs is unavailable
 */
const generateSpeechWithOpenAI = async (text: string): Promise<Blob> => {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  
  console.log('OpenAI API Key available for TTS fallback:', !!apiKey);
  
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured for TTS fallback.');
  }
  
  // OpenAI TTS endpoint
  const endpoint = 'https://api.openai.com/v1/audio/speech';
  
  // Set up the request options
  const options = {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'OpenAI-Organization': 'org-q2FnHJDFUAA89gSEDNw4uTgi',
    },
    body: JSON.stringify({
      model: 'tts-1',
      voice: 'ash',  // Using Ash as fallback voice
      input: text
    })
  };
  
  console.log(`Using OpenAI TTS with Ash voice as fallback`);
  
  const response = await fetch(endpoint, options);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('OpenAI TTS API error:', errorText);
    throw new Error(`OpenAI TTS API error: ${response.status} ${response.statusText}`);
  }
  
  return await response.blob();
};

/**
 * Converts text to speech using the mock API endpoint
 */
const generateSpeechWithMockApi = async (
  text: string,
  speakerId: number,
  context: Array<{
    text: string;
    speaker: number;
    audio: string;
  }> = []
): Promise<Blob> => {
  const response = await fetch(`${API_ENDPOINTS.baseUrl}${API_ENDPOINTS.tts}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      speaker: speakerId,
      context,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to generate speech with mock API');
  }

  return await response.blob();
};

/**
 * Plays audio from a blob
 */
export const playAudio = (audioBlob: Blob): Promise<void> => {
  return new Promise((resolve, reject) => {
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    
    audio.onended = () => {
      URL.revokeObjectURL(audioUrl);
      resolve();
    };
    
    audio.onerror = (error) => {
      URL.revokeObjectURL(audioUrl);
      reject(error);
    };
    
    audio.play().catch(reject);
  });
};

/**
 * Converts audio blob to base64 string
 */
export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        // Remove the data URL prefix (e.g., "data:audio/wav;base64,")
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      } else {
        reject(new Error('Failed to convert Blob to base64'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}; 