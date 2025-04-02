import React from 'react';
import { useSessionStore } from '../../state/sessionStore';
import { MENTOR_PERSONALITIES } from '../../constants/app';
import { MentorKey } from '../../types';

const MentorSwitcher: React.FC = () => {
  const { currentMentor, setCurrentMentor, isSpeaking, isListening } = useSessionStore();
  
  // Get mentor keys
  const mentorKeys = Object.keys(MENTOR_PERSONALITIES) as MentorKey[];
  
  // Handle mentor selection
  const handleMentorSelect = (mentor: MentorKey) => {
    setCurrentMentor(mentor);
  };
  
  return (
    <div className="flex flex-col space-y-4">
      <h3 className="text-lg font-medium text-gray-900">Choose Your Mentor</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {mentorKeys.map((mentor) => {
          const mentorData = MENTOR_PERSONALITIES[mentor];
          const isSelected = currentMentor === mentor;
          const isDisabled = isSpeaking || isListening;
          
          return (
            <button
              key={mentor}
              onClick={() => handleMentorSelect(mentor)}
              disabled={isDisabled}
              className={`p-4 rounded-lg border ${
                isSelected
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-blue-300'
              } ${
                isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
              }`}
            >
              <h4 className="font-medium text-gray-900">{mentorData.name}</h4>
              <p className="text-sm text-gray-500 mt-1">
                Style: {mentorData.style}
              </p>
            </button>
          );
        })}
      </div>
      
      {(isSpeaking || isListening) && (
        <p className="text-sm text-gray-500 italic">
          Mentor switching is disabled during conversation
        </p>
      )}
    </div>
  );
};

export default MentorSwitcher; 