import React, { useState, useEffect } from 'react';

interface VoiceButtonProps {
  isRecording: boolean;
  isProcessing: boolean;
  isSpeaking: boolean;
  onToggleRecording: () => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const VoiceButton: React.FC<VoiceButtonProps> = ({
  isRecording,
  isProcessing,
  isSpeaking,
  onToggleRecording,
  size = 'md',
  className = '',
}) => {
  const [ripple, setRipple] = useState(false);
  
  // Play pulsing animation when recording
  useEffect(() => {
    if (isRecording) {
      const interval = setInterval(() => {
        setRipple(prev => !prev);
      }, 1000);
      
      return () => clearInterval(interval);
    }
  }, [isRecording]);
  
  // Calculate size classes
  const sizeClasses = {
    sm: 'w-12 h-12',
    md: 'w-16 h-16',
    lg: 'w-20 h-20',
  };
  
  // Determine the button state
  const getButtonState = () => {
    if (isProcessing) return 'processing';
    if (isSpeaking) return 'speaking';
    if (isRecording) return 'recording';
    return 'idle';
  };
  
  const buttonState = getButtonState();
  
  // Style based on state
  const stateStyles = {
    idle: 'bg-blue-500 hover:bg-blue-600',
    recording: 'bg-red-500 hover:bg-red-600',
    processing: 'bg-yellow-500',
    speaking: 'bg-purple-500',
  };
  
  // Icon based on state
  const stateIcons = {
    idle: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
      </svg>
    ),
    recording: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
      </svg>
    ),
    processing: (
      <svg className="animate-spin h-8 w-8" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    ),
    speaking: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15.536a5 5 0 001.414 1.414m2.828-9.9a9 9 0 012.728-2.728" />
      </svg>
    ),
  };
  
  // Tooltip message
  const tooltipMessages = {
    idle: 'Tap to speak',
    recording: 'Tap to stop',
    processing: 'Processing...',
    speaking: 'Listening to mentor',
  };
  
  return (
    <div className="relative">
      {/* Ripple effect for recording */}
      {isRecording && (
        <span className={`absolute top-0 left-0 right-0 bottom-0 rounded-full ${sizeClasses[size]} bg-red-500 opacity-20 transition-transform duration-1000 ${ripple ? 'scale-150' : 'scale-100'}`} />
      )}
      
      <button
        onClick={onToggleRecording}
        disabled={isProcessing || isSpeaking}
        className={`relative ${sizeClasses[size]} rounded-full text-white flex items-center justify-center shadow-lg transition-colors duration-300 ${stateStyles[buttonState]} disabled:opacity-70 disabled:cursor-not-allowed ${className}`}
        title={tooltipMessages[buttonState]}
        aria-label={tooltipMessages[buttonState]}
      >
        {stateIcons[buttonState]}
      </button>
      
      <span className="block text-xs font-medium text-center mt-2 text-gray-600">
        {tooltipMessages[buttonState]}
      </span>
    </div>
  );
};

export default VoiceButton; 