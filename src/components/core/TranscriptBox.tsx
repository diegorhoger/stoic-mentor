import React, { useEffect, useRef } from 'react';

interface TranscriptBoxProps {
  text: string;
  isUser: boolean;
  isActive: boolean;
}

const TranscriptBox: React.FC<TranscriptBoxProps> = ({ text, isUser, isActive }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll to bottom when text changes
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [text]);

  return (
    <div 
      ref={containerRef}
      className={`max-w-md mx-auto p-4 rounded-lg shadow-sm h-32 overflow-y-auto ${
        isUser 
          ? 'bg-blue-50 border border-blue-100' 
          : 'bg-purple-50 border border-purple-100'
      } ${isActive ? 'border-l-4 border-l-blue-500' : ''}`}
    >
      <div className="flex items-center mb-2">
        <div className={`rounded-full w-2 h-2 mr-2 ${isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
        <p className="text-sm font-medium text-gray-700">
          {isUser ? 'You' : 'Mentor'}
        </p>
      </div>
      
      <p className="text-gray-800">
        {text || (isActive ? 'Listening...' : 'No text yet')}
      </p>
    </div>
  );
};

export default TranscriptBox; 