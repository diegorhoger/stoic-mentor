import React from 'react';
import AppLayout from '../components/layout/AppLayout';
import MentorCallUI from '../components/core/MentorCallUI';
import MentorSwitcher from '../components/core/MentorSwitcher';

const HomePage: React.FC = () => {
  return (
    <AppLayout>
      <div className="flex flex-col items-center w-full bg-white">
        <div className="w-full max-w-2xl mx-auto pt-8 pb-12">
          <h1 style={{
            fontSize: '32px',
            fontWeight: 'bold',
            textAlign: 'center',
            marginBottom: '28px',
            letterSpacing: '0.5px',
            color: '#111827'
          }}>
            Stoic Mentor
          </h1>
          
          <MentorSwitcher />
          
          {/* MentorCallUI handles the conversation interface */}
          <MentorCallUI />
        </div>
      </div>
    </AppLayout>
  );
};

export default HomePage; 