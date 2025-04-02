import React from 'react';
import AppLayout from '../components/layout/AppLayout';
import ConversationUI from '../components/core/ConversationUI';
import MentorSwitcher from '../components/core/MentorSwitcher';

const HomePage: React.FC = () => {
  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Stoic Voice Mentor</h2>
          <p className="text-gray-600 mb-4">
            Choose a Stoic mentor and begin a conversation about life's challenges:
          </p>
          <MentorSwitcher />
        </div>
        
        <div className="bg-white shadow rounded-lg p-6">
          <ConversationUI />
        </div>
      </div>
    </AppLayout>
  );
};

export default HomePage; 