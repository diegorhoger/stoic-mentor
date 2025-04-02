# Stoic Mentor

A voice-powered conversational application featuring stoic mentors who provide philosophical guidance and insights based on stoic principles.

## Description

Stoic Mentor is a web application that allows users to have voice conversations with AI mentors representing famous stoic philosophers, including Marcus Aurelius, Seneca, and Epictetus. The application transcribes user speech, processes it, and responds with philosophical guidance in the style of the selected mentor.

## Features

- Interactive voice conversation with stoic philosopher AI mentors
- Speech-to-text and text-to-speech capabilities
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
