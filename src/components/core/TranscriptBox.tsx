import React from 'react';

interface TranscriptBoxProps {
  text: string;
  isUser: boolean;
  isActive: boolean;
}

const TranscriptBox: React.FC<TranscriptBoxProps> = ({ text, isUser }) => {
  if (!text && isUser) {
    return <div className="mb-2">Ask me something about stoicism...</div>;
  }

  if (!text) {
    return null;
  }

  return (
    <div>
      {text}
    </div>
  );
};

export default TranscriptBox; 