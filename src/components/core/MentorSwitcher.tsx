import React from 'react';
import { useSessionStore } from '../../state/sessionStore';
import { MENTOR_PERSONALITIES } from '../../constants/app';
import { MentorKey } from '../../types';

// Import images directly
const marcusImage = '/images/marcus.png';
const senecaImage = '/images/seneca.png';
const epictetusImage = '/images/epictetus.png';

// Image mapping
const mentorImages = {
  marcus: marcusImage,
  seneca: senecaImage,
  epictetus: epictetusImage
};

const MentorSwitcher: React.FC = () => {
  const { currentMentor, setCurrentMentor, isSpeaking, isListening } = useSessionStore();
  
  // State to force re-renders
  const [rerenderKey, setRerenderKey] = React.useState(0);
  
  // Get mentor keys
  const mentorKeys = Object.keys(MENTOR_PERSONALITIES) as MentorKey[];
  
  // Handle mentor selection
  const handleMentorSelect = (mentor: MentorKey) => {
    console.log(`🔍 MENTOR SWITCHER - Selected mentor: ${mentor}`);
    console.log(`🔍 MENTOR SWITCHER - Previous mentor: ${currentMentor}`);
    
    // Set the mentor in state
    setCurrentMentor(mentor);
    console.log(`🔍 MENTOR SWITCHER - Updated mentor state`);
    
    // Force a re-render of this component
    setRerenderKey(prev => prev + 1);
    
    // Double-check the mentor selection was properly registered
    setTimeout(() => {
      const state = useSessionStore.getState();
      console.log(`🔍 MENTOR SWITCHER - Verified current mentor in store: ${state.currentMentor}`);
      
      if (state.currentMentor !== mentor) {
        console.error(`🔍 MENTOR SWITCHER - ERROR: Mentor state not updated correctly! Expected ${mentor} but got ${state.currentMentor}`);
        // Try setting it again
        setCurrentMentor(mentor);
        setRerenderKey(prev => prev + 1);
      }
    }, 100);
    
    // Force reload any conversation components
    console.log(`🔍 MENTOR SWITCHER - Triggering any needed UI updates`);
    
    // Force refresh to ensure components using the mentor state are rerendered
    window.dispatchEvent(new CustomEvent('mentor-changed', { detail: { mentor } }));
  };
  
  return (
    <div className="w-full max-w-2xl mx-auto px-4" key={`mentor-switcher-${rerenderKey}-${currentMentor}`}>
      <p className="text-center mb-4">
        Choose a Stoic mentor and begin a conversation about life's challenges:
      </p>
      
      <div style={{ 
        width: '100%', 
        display: 'flex',
        justifyContent: 'space-between',
        gap: '12px',
        marginBottom: '20px'
      }}>
        {mentorKeys.map((mentor) => {
          const mentorData = MENTOR_PERSONALITIES[mentor];
          const isSelected = currentMentor === mentor;
          const isDisabled = isSpeaking || isListening;
          
          return (
            <button
              key={mentor}
              onClick={() => handleMentorSelect(mentor)}
              disabled={isDisabled}
              style={{
                width: '100%',
                backgroundColor: isSelected ? '#f9fafb' : 'white',
                border: isSelected ? '1px solid #e5e7eb' : '1px solid #f3f4f6',
                borderRadius: '8px',
                padding: '12px',
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                opacity: isDisabled ? 0.5 : 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                transition: 'all 0.2s ease',
                boxShadow: isSelected ? '0 4px 6px -1px rgba(0, 0, 0, 0.1)' : 'none'
              }}
            >
              <div style={{ 
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                overflow: 'hidden',
                marginBottom: '8px',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'flex-start',
                backgroundColor: '#f3f4f6'
              }}>
                <img 
                  src={mentorImages[mentor]}
                  alt={mentorData.name}
                  style={{ 
                    width: '100%',
                    objectFit: 'contain',
                    objectPosition: 'top'
                  }}
                />
              </div>
              
              <div style={{ 
                fontWeight: 600, 
                fontSize: '16px',
                marginBottom: '4px'
              }}>
                {mentorData.name}
              </div>
              
              <div style={{ 
                fontSize: '12px', 
                color: '#6b7280',
                textAlign: 'center'
              }}>
                {mentorData.title}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default MentorSwitcher; 