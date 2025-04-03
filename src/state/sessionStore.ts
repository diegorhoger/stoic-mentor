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
  
  setCurrentMentor: (mentor) => {
    // Get current state first to show the actual current value, not the initial value
    const currentState = useSessionStore.getState();
    console.log(`🔍 STORE DEBUG - Setting mentor in store from: ${currentState.currentMentor} to: ${mentor}`);
    set({ currentMentor: mentor });
    // Verify it was set correctly
    setTimeout(() => {
      const state = useSessionStore.getState();
      console.log(`🔍 STORE DEBUG - Verified mentor in store is now: ${state.currentMentor}`);
    }, 0);
  },
  
  addMessage: (message) => set((state) => ({
    history: [...state.history, message],
  })),
  
  setIsSpeaking: (isSpeaking) => set({ isSpeaking }),
  
  setIsListening: (isListening) => set({ isListening }),
  
  resetSession: () => set((state) => ({
    ...initialState,
    currentMentor: state.currentMentor, // Preserve the current mentor selection
  })),
})); 