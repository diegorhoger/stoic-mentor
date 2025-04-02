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
- **Speech Recognition**: Simulated transcription (mock API)

## Getting Started

### Prerequisites

- Node.js (v16+)
- Python 3.8+
- npm or yarn

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

## Development Status

This project is in active development. The current version uses mock APIs for speech recognition and voice synthesis to facilitate development without requiring complex model dependencies.

## License

[MIT License](LICENSE)
