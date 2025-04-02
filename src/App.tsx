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
      <div className="app-container">
        <QueryClientProvider client={queryClient}>
          <HomePage />
        </QueryClientProvider>
      </div>
    </>
  );
}

export default App;
