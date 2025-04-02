import { create } from 'zustand';
import { SessionState, Message, MentorKey } from '../types';

const initialState: SessionState = {
  currentMentor: 'marcus',
  history: [],
  isSpeaking: false,
  isListening: false,
};

export const useSessionStore = create<SessionState & {
  setCurrentMentor: (mentor: MentorKey) => void;
  addMessage: (message: Message) => void;
  setIsSpeaking: (isSpeaking: boolean) => void;
  setIsListening: (isListening: boolean) => void;
  resetSession: () => void;
}>((set) => ({
  ...initialState,
  
  setCurrentMentor: (mentor) => set({ currentMentor: mentor }),
  
  addMessage: (message) => set((state) => ({
    history: [...state.history, message],
  })),
  
  setIsSpeaking: (isSpeaking) => set({ isSpeaking }),
  
  setIsListening: (isListening) => set({ isListening }),
  
  resetSession: () => set(initialState),
})); 