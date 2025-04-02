import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HomePage from './pages';
import DevToolsFix from './components/DevToolsFix';

// Create a client
const queryClient = new QueryClient();

function App() {
  return (
    <>
      <DevToolsFix />
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'white',
        width: '100vw',
        height: '100vh',
        margin: 0,
        padding: 0,
        overflow: 'auto'
      }}>
        <QueryClientProvider client={queryClient}>
          <HomePage />
        </QueryClientProvider>
      </div>
    </>
  );
}

export default App;
