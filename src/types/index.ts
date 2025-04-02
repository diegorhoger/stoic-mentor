// Mentor types
export type MentorKey = 'marcus' | 'seneca' | 'epictetus';

export interface Mentor {
  name: string;
  prompt: string;
  voiceId: string;
  style: 'calm' | 'motivational' | 'firm';
}

export interface Mentors {
  [key: string]: Mentor;
}

// Message types
export interface Message {
  role: 'user' | 'mentor';
  content: string;
  timestamp: number;
}

// Session state
export interface SessionState {
  currentMentor: MentorKey;
  history: Message[];
  isSpeaking: boolean;
  isListening: boolean;
}

// Audio state
export interface AudioState {
  isRecording: boolean;
  audioLevel: number;
  isPlaying: boolean;
}

// Whisper API types
export interface WhisperApiResponse {
  text: string;
}

export interface WhisperError {
  error: {
    message: string;
    type: string;
    param: string | null;
    code: string;
  };
}

export interface MockWhisperResponse {
  transcription: string;
  text?: string;
}

export interface TranscriptionOptions {
  language?: string;
  prompt?: string;
  temperature?: number;
  model?: string;
} 