import { create } from "zustand";

interface AppState {
  voiceOnly: boolean;
  setVoiceOnly: (value: boolean) => void;
  isListening: boolean;
  setIsListening: (value: boolean) => void;
}

export const useAppStore = create<AppState>()((set) => ({
  voiceOnly: false,
  setVoiceOnly: (value) => set({ voiceOnly: value }),
  isListening: false,
  setIsListening: (value) => set({ isListening: value }),
}));
