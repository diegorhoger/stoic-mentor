// Latency target in milliseconds
export const LATENCY_TARGET = 200;

// Audio settings
export const AUDIO_SETTINGS = {
  sampleRate: 16000,
  channels: 1,
  bufferSize: 4096,
};

// API endpoints
export const API_ENDPOINTS = {
  baseUrl: import.meta.env.VITE_MOCK_API_URL || 'http://localhost:5001',
  whisper: '/api/transcribe',
  gpt: '/api/gpt',
  tts: '/api/tts',
  mentors: '/api/mentors',
  health: '/api/health',
  stream: '/api/stream',
};

// Mentor personalities
export const MENTOR_PERSONALITIES = {
  marcus: {
    name: 'Marcus Aurelius',
    prompt: 'You are Marcus Aurelius. Speak calmly and with quiet strength...',
    voiceId: 'marcus-v1',
    style: 'calm',
  },
  seneca: {
    name: 'Seneca',
    prompt: 'You are Seneca. Speak with eloquence and motivation...',
    voiceId: 'seneca-v1',
    style: 'motivational',
  },
  epictetus: {
    name: 'Epictetus',
    prompt: 'You are Epictetus. Speak bluntly and challenge assumptions...',
    voiceId: 'epictetus-v1',
    style: 'firm',
  },
}; 