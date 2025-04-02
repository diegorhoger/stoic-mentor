import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './reset.css'
import './index.css'
import App from './App.tsx'

// Debug environment variables
console.log('Environment variables:');
console.log('VITE_USE_DIRECT_WHISPER:', import.meta.env.VITE_USE_DIRECT_WHISPER);
console.log('VITE_USE_DIRECT_OPENAI:', import.meta.env.VITE_USE_DIRECT_OPENAI);
console.log('VITE_MOCK_API_URL:', import.meta.env.VITE_MOCK_API_URL);

// Safely log API key format without exposing the full key
const apiKey = import.meta.env.VITE_OPENAI_API_KEY || '';
console.log('API Key format check:');
console.log('- Starts with sk-proj-:', apiKey.startsWith('sk-proj-'));
console.log('- Key length:', apiKey.length);
if (apiKey.startsWith('sk-proj-')) {
  // Try to extract project ID
  const projectIdMatch = apiKey.match(/^sk-proj-([^_]+)/);
  console.log('- Project ID extraction successful:', !!projectIdMatch);
  if (projectIdMatch && projectIdMatch[1]) {
    console.log('- Extracted project ID:', projectIdMatch[1].substring(0, 10) + '...');
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
