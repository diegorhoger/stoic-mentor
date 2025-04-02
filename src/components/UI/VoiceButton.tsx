import React from 'react';

interface VoiceButtonProps {
  isRecording: boolean;
  isProcessing: boolean;
  isSpeaking: boolean;
  onToggleRecording: () => void;
  className?: string;
}

const VoiceButton: React.FC<VoiceButtonProps> = ({
  isRecording,
  isProcessing,
  isSpeaking,
  onToggleRecording,
  className = '',
}) => {
  // Determine label based on state
  const getLabel = () => {
    if (isProcessing) return 'Processing...';
    if (isSpeaking) return 'Listening';
    if (isRecording) return 'Stop';
    return 'Search';
  };

  const label = getLabel();
  
  return (
    <div className="text-center">
      <button
        onClick={onToggleRecording}
        disabled={isProcessing || isSpeaking}
        className={`bg-gray-100 h-16 w-16 rounded-md flex items-center justify-center hover:bg-gray-200 disabled:opacity-70 ${className}`}
        aria-label={label}
        title={label}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
      </button>
      <div className="mt-1 text-sm">{label}</div>
    </div>
  );
};

export default VoiceButton; 