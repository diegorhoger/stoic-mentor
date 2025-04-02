import React, { useState, useEffect } from 'react';
import { useSessionStore } from '../../state/sessionStore';
import { useMicStream } from '../../hooks/useMicStream';
import WaveformVisualizer from '../UI/WaveformVisualizer';
import { MENTOR_PERSONALITIES } from '../../constants/app';
import { transcribeAudio, generateResponse, generateAudio } from '../../services/api';
import { MentorKey } from '../../types';

const MentorCallUI: React.FC = () => {
  const { currentMentor, isSpeaking, isListening, setIsSpeaking, setIsListening, addMessage } = useSessionStore();
  const { isRecording, audioLevel, startRecording, stopRecording, getAudioBlob } = useMicStream();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle recording state changes
  useEffect(() => {
    if (isRecording) {
      setIsListening(true);
    } else {
      setIsListening(false);
    }
  }, [isRecording, setIsListening]);

  // Toggle recording
  const toggleRecording = async () => {
    try {
      if (isRecording) {
        stopRecording();
      } else {
        await startRecording();
      }
    } catch (err) {
      setError('Failed to access microphone. Please check permissions.');
      console.error(err);
    }
  };

  // Process audio when recording stops
  const processAudio = async () => {
    if (isProcessing) return;
    
    setIsProcessing(true);
    setError(null);
    
    try {
      // Get recorded audio
      const audioBlob = await getAudioBlob();
      if (!audioBlob) {
        throw new Error('No audio recorded');
      }
      
      // Transcribe audio to text
      const transcription = await transcribeAudio(audioBlob);
      
      // Add user message to history
      addMessage({
        role: 'user',
        content: transcription,
        timestamp: Date.now(),
      });
      
      // Generate mentor response
      const mentorPrompt = MENTOR_PERSONALITIES[currentMentor as MentorKey].prompt;
      const response = await generateResponse(transcription, mentorPrompt);
      
      // Add mentor message to history
      addMessage({
        role: 'mentor',
        content: response,
        timestamp: Date.now(),
      });
      
      // Generate and play audio
      setIsSpeaking(true);
      const voiceId = MENTOR_PERSONALITIES[currentMentor as MentorKey].voiceId;
      const audioResponse = await generateAudio(response, voiceId);
      
      // Play the audio (placeholder - actual implementation would use Web Audio API)
      const audioUrl = URL.createObjectURL(audioResponse);
      const audio = new Audio(audioUrl);
      
      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
      };
      
      audio.play().catch(err => {
        console.error('Error playing audio:', err);
        setIsSpeaking(false);
      });
      
    } catch (err) {
      setError('Error processing audio. Please try again.');
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Process audio when recording stops
  useEffect(() => {
    if (!isRecording && !isProcessing) {
      processAudio();
    }
  }, [isRecording]);

  return (
    <div className="flex flex-col items-center space-y-6 p-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">
          {MENTOR_PERSONALITIES[currentMentor as MentorKey].name}
        </h2>
        <p className="text-gray-600">
          {isListening ? 'Listening...' : isSpeaking ? 'Speaking...' : 'Click to speak'}
        </p>
      </div>
      
      <WaveformVisualizer
        audioLevel={audioLevel}
        isActive={isRecording || isSpeaking}
        color={isRecording ? '#EF4444' : '#4F46E5'}
        height={100}
        width={300}
      />
      
      <button
        onClick={toggleRecording}
        disabled={isProcessing || isSpeaking}
        className={`px-6 py-3 rounded-full font-medium text-white ${
          isRecording
            ? 'bg-red-500 hover:bg-red-600'
            : 'bg-blue-500 hover:bg-blue-600'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {isRecording ? 'Stop' : 'Start'} Recording
      </button>
      
      {error && (
        <div className="text-red-500 text-center mt-4">
          {error}
        </div>
      )}
    </div>
  );
};

export default MentorCallUI; 