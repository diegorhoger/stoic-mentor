# Stoic Mentor

A voice-powered conversational application featuring stoic mentors who provide philosophical guidance and insights based on stoic principles.

## Description

Stoic Mentor is a web application that allows users to have voice conversations with AI mentors representing famous stoic philosophers, including Marcus Aurelius, Seneca, and Epictetus. The application transcribes user speech, processes it, and responds with philosophical guidance in the style of the selected mentor.

## Features

- **Three Stoic Mentors**: Marcus Aurelius, Seneca, and Epictetus
- **Natural Conversation**: Speak and get spoken responses
- Speech-to-text and text-to-speech capabilities
- **Kokoro TTS**: High-quality voice synthesis with an open-source model
- **Responsive Design**: Works on desktop and mobile devices
- **Multi-platform**: Web, iOS, and Android support
- Multiple mentor personalities with distinct speaking styles
- Responsive web interface with modern design

## Technology Stack

- **Frontend**: React with Vite, TailwindCSS
- **API Server**: Flask with CORS support
- **Audio Processing**: Mock generator for voice synthesis
- **Speech Recognition**: OpenAI Whisper API (optional) or simulated transcription (mock API)

## Getting Started

### Prerequisites

- Node.js (v16+)
- Python 3.8+
- npm or yarn
- OpenAI API key (optional, for Whisper integration)

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/stoic-mentor.git
   cd stoic-mentor
   ```

2. Install frontend dependencies:
   ```
   npm install
   ```

3. Install API server dependencies (in a separate terminal):
   ```
   cd ..
   pip install -r requirements.txt
   ```

4. Set up environment variables:
   ```
   # Copy the example environment file
   cp .env.example .env
   
   # Edit .env and add your OpenAI API key if you want to use Whisper
   # VITE_OPENAI_API_KEY=your_api_key_here
   # VITE_USE_DIRECT_WHISPER=true
   ```

### Running the Application

1. Start the API server:
   ```
   python mock_api.py
   ```

2. Start the frontend development server:
   ```
   npm run dev
   ```

3. Open your browser and navigate to `http://localhost:5173`

## Using OpenAI Whisper API

The application now supports direct integration with OpenAI's Whisper API for high-quality speech recognition:

1. Obtain an API key from [OpenAI](https://platform.openai.com/api-keys)
2. Add your API key to the `.env` file:
   ```
   VITE_OPENAI_API_KEY=your_api_key_here
   VITE_USE_DIRECT_WHISPER=true
   ```
3. Restart the development server

The application will now use the Whisper API for speech-to-text conversion. If you don't provide an API key or set `VITE_USE_DIRECT_WHISPER=false`, it will fall back to the mock API.

## Development Status

This project is in active development. While we now support OpenAI Whisper for speech recognition, we're working on integrating more AI capabilities for a complete experience.

## License

[MIT License](LICENSE)

# Stoic Mentor Voice Companion

A conversational AI application that emulates Stoic mentors from ancient times.

## API Integration

### Using Direct API Integration

The application can use the mock API for development or direct API integration with:

1. **OpenAI API** - for transcription (Whisper) and conversation (GPT)
2. **ElevenLabs API** - for text-to-speech (TTS)

To use direct API integration:

1. Copy the `.env.example` to `.env`
2. Add your API keys:
   ```
   # OpenAI API Key (required for Whisper and GPT)
   VITE_OPENAI_API_KEY=sk-your-openai-key-here
   
   # ElevenLabs API Key (required for TTS)
   VITE_ELEVENLABS_API_KEY=your-elevenlabs-key-here
   ```
3. Enable the direct API integrations:
   ```
   # Set to 'true' to use direct API, 'false' to use mock API
   VITE_USE_DIRECT_WHISPER=true
   VITE_USE_DIRECT_OPENAI=true
   VITE_USE_DIRECT_TTS=false  # Keep false until ElevenLabs integration is completed
   ```

### API Key Troubleshooting

- OpenAI API keys typically start with `sk-` followed by alphanumeric characters
- **Project-Scoped Keys**: Keys that start with `sk-proj-` are now supported with additional headers:
  ```javascript
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'OpenAI-Organization': 'org-q2FnHJDFUAA89gSEDNw4uTgi',
    'OpenAI-Project': 'ua8qZIWWT5YpIDPIUrZsdQHfMg'  // Must be the project ID WITHOUT the 'proj-' prefix
  }
  ```
  - The project ID in your API key (after `sk-proj-`) must match the `OpenAI-Project` header exactly, without the "proj-" prefix
  - For example, if your key is `sk-proj-ua8qZIWWT5YpIDPIUrZs...`, the header should be `'OpenAI-Project': 'ua8qZIWWT5YpIDPIUrZs...'`
  - If you get a "OpenAI-Project header should match project for API key" error, make sure you're not adding extra prefixes
- If you see errors related to API keys:
  - Check the browser console for detailed error messages
  - Verify your API key is valid and active
  - Make sure you've enabled the correct APIs in your OpenAI dashboard

### Using Mock API (Default)

To use the mock API (recommended for development):

1. Run the mock API server:
   ```
   python mock_api.py
   ```
2. Set all direct API flags to `false` in `.env`:
   ```
   VITE_USE_DIRECT_WHISPER=false
   VITE_USE_DIRECT_OPENAI=false
   VITE_USE_DIRECT_TTS=false
   ```

For the mock API server to work, make sure the `VITE_MOCK_API_URL` points to the correct URL (default is `http://localhost:5002`).

## Feature Status

- ✅ Mock API integration
- ⚠️ OpenAI Whisper integration (experimental)
- ⚠️ OpenAI GPT integration (experimental)
- ❌ ElevenLabs TTS integration (not implemented yet)

### Requirements

1. **OpenAI API Key** - for GPT model access
2. **Kokoro TTS** - for text-to-speech conversion (runs locally on the backend, no API key needed)
3. **Python 3.9+** - for running the backend server
4. **Node.js 18+** - for running the front-end
