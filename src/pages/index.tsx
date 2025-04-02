import React from 'react';
import AppLayout from '../components/layout/AppLayout';
import ConversationUI from '../components/core/ConversationUI';
import MentorSwitcher from '../components/core/MentorSwitcher';
import { useSessionStore } from '../state/sessionStore';
import { MENTOR_PERSONALITIES } from '../constants/app';

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

const HomePage: React.FC = () => {
  const { currentMentor } = useSessionStore();
  const mentorData = MENTOR_PERSONALITIES[currentMentor];
  
  return (
    <AppLayout>
      <div style={{
        paddingTop: '32px',
        width: '100%',
        backgroundColor: 'white'
      }}>
        <h1 style={{
          fontSize: '32px',
          fontWeight: 'bold',
          paddingBottom: '24px',
          textAlign: 'center'
        }}>
          Stoic Mentor
        </h1>
        
        <MentorSwitcher />
        
        <div style={{
          display: 'flex',
          alignItems: 'center',
          marginTop: '24px',
          marginBottom: '24px',
          backgroundColor: '#f9fafb',
          padding: '16px',
          borderRadius: '8px'
        }}>
          <div style={{
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            overflow: 'hidden',
            marginRight: '16px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
            backgroundColor: '#f3f4f6'
          }}>
            <img 
              src={mentorImages[currentMentor]}
              alt={mentorData.name}
              style={{
                width: '100%',
                objectFit: 'contain',
                objectPosition: 'top'
              }}
            />
          </div>
          <div>
            <h2 style={{
              fontSize: '24px',
              fontWeight: 'bold',
              marginBottom: '4px'
            }}>
              {mentorData.name}
            </h2>
            <p style={{
              fontSize: '14px',
              color: '#6b7280',
            }}>
              {mentorData.title} • {mentorData.years}
            </p>
          </div>
        </div>
        
        <ConversationUI />
      </div>
    </AppLayout>
  );
};

export default HomePage; 