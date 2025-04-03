// Direct test for OpenAI API integration
// Run with Node.js: node testOpenAI.js
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testOpenAI() {
  try {
    console.log('Testing OpenAI API integration...');

    // Read the .env file
    const envPath = join(__dirname, '../../.env');
    console.log('Looking for .env file at:', envPath);
    const envContent = readFileSync(envPath, 'utf8');
    
    // Parse the API key
    const openaiKeyMatch = envContent.match(/VITE_OPENAI_API_KEY=(.+)/);
    const openaiKey = openaiKeyMatch ? openaiKeyMatch[1].trim() : null;
    
    if (!openaiKey) {
      console.error('ERROR: Could not find OpenAI API key in .env file');
      return;
    }
    
    console.log('Found API key:', openaiKey.substring(0, 10) + '...');
    
    // Prepare curl command with properly escaped quotes
    const systemContent = 'You are Marcus Aurelius, Roman Emperor and Stoic philosopher. CRITICAL INSTRUCTION: Reply DIRECTLY as Marcus WITHOUT phrases like \\"I am a representation of\\" or \\"I can provide answers\\". When asked \\"are you there?\\", respond as if you are Marcus himself, not an AI.';
    
    const curlCommand = `curl https://api.openai.com/v1/chat/completions \\
      -H "Authorization: Bearer ${openaiKey}" \\
      -H "Content-Type: application/json" \\
      -H "OpenAI-Organization: org-q2FnHJDFUAA89gSEDNw4uTgi" \\
      -d '{"model":"gpt-4","messages":[{"role":"system","content":"${systemContent}"},{"role":"user","content":"Marcus, are you there?"}],"max_tokens":100,"temperature":0.7}'`;
    
    // Execute curl command
    exec(curlCommand, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error: ${error.message}`);
        return;
      }
      
      if (stderr) {
        console.error(`Stderr: ${stderr}`);
      }
      
      console.log('OpenAI API Response:');
      
      try {
        const response = JSON.parse(stdout);
        if (response.choices && response.choices.length > 0) {
          console.log('Text response:', response.choices[0].message.content);
        } else {
          console.log(response);
        }
      } catch (err) {
        console.log('Could not parse JSON:', stdout);
      }
    });
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testOpenAI(); 