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
  baseUrl: import.meta.env.VITE_MOCK_API_URL || 'http://localhost:5002',
  health: '/api/health',
  transcribe: '/api/transcribe',
  tts: '/api/tts',
  gpt: '/api/gpt',
  mentors: '/api/mentors',
  // OpenAI direct endpoints
  baseOpenAIUrl: 'https://api.openai.com',
  whisperEndpoint: '/v1/audio/transcriptions',
  chatEndpoint: '/v1/chat/completions'
};

// Personalities for mentors
export const MENTOR_PERSONALITIES = {
  marcus: {
    name: 'Marcus Aurelius',
    style: 'calm',
    title: 'Philosopher and Roman Emperor',
    years: '121-180 CE',
    image: './images/marcus.png',
    description: 'Known for his personal reflections in "Meditations", Marcus Aurelius ruled as Roman Emperor while practicing Stoic philosophy.',
    voiceId: '0'  // Default voice ID for the TTS service
  },
  seneca: {
    name: 'Seneca',
    style: 'motivational',
    title: 'Philosopher and Statesman',
    years: '4 BCE-65 CE',
    image: './images/seneca.png',
    description: 'A Roman Stoic philosopher who served as advisor to Emperor Nero and wrote influential letters on ethics and natural philosophy.',
    voiceId: '1'  // Second voice ID for the TTS service
  },
  epictetus: {
    name: 'Epictetus',
    style: 'firm',
    title: 'Stoic Philosopher and Former Slave',
    years: '50-135 CE',
    image: './images/epictetus.png',
    description: 'Born a slave and later freed, Epictetus taught that philosophy is a way of life, not just an intellectual exercise.',
    voiceId: '2'  // Third voice ID for the TTS service
  }
}; 