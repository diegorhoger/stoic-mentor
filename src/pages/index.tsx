import React, { useState } from 'react';
import AppLayout from '../components/layout/AppLayout';
import MentorCallUI from '../components/core/MentorCallUI';
import MentorSwitcher from '../components/core/MentorSwitcher';
import WebSocketVadDemo from '../components/WebSocketVadDemo';

const HomePage: React.FC = () => {
  const [showVadDemo, setShowVadDemo] = useState(false);

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
          
          <div className="mb-6">
            <button
              onClick={() => setShowVadDemo(!showVadDemo)}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              {showVadDemo ? 'Hide' : 'Show'} WebSocket VAD Demo
            </button>
          </div>
          
          <MentorSwitcher />
          
          {/* MentorCallUI handles the conversation interface */}
          <MentorCallUI />
          
          {showVadDemo && <WebSocketVadDemo />}
        </div>
      </div>
    </AppLayout>
  );
};

export default HomePage; 