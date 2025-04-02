# Stoic Mentor Project Documentation

## Project Overview

Stoic Mentor is a voice-based conversational application that simulates interactions with stoic philosophers. The application enables users to select a mentor from a list of famous stoic philosophers, engage in voice conversations, and receive philosophical guidance in the style of the selected mentor.

## Design Decisions

### Architecture

The project is structured as a client-server application:

1. **Frontend**: React application built with Vite and styled with Tailwind CSS
2. **Backend**: Flask API server that provides endpoints for:
   - Health checking
   - Mentor information retrieval
   - Text-to-speech conversion
   - Speech-to-text transcription

### API Design

The API is designed to be simple and RESTful:

- `GET /api/health`: Check if the API server is running
- `GET /api/mentors`: Retrieve available mentor personalities
- `POST /api/tts`: Convert text to speech using a mock generator
- `POST /api/transcribe`: Transcribe speech to text using mock responses

### Mock Implementation Strategy

Due to challenges with the original CSM (Conversational Speech Model) dependencies, we implemented a mock approach:

1. **Mock Generator**: Created a simplified generator that mimics the CSM model's API without requiring complex dependencies
2. **Audio Generation**: Implemented a fallback system that uses:
   - Primary: A more sophisticated audio generator with varying frequencies based on speaker ID
   - Backup: Simple sine wave generation if the primary method fails

### Frontend Components

Components are designed to be modular and reusable:

1. **MentorSelector**: Allows users to choose from available stoic mentors
2. **Conversation**: Manages the conversation flow and history
3. **AudioRecorder**: Handles recording user's voice input
4. **AudioPlayer**: Plays back the generated responses

## Technical Challenges & Solutions

### Challenge 1: CSM Model Dependencies

**Problem**: The original CSM model had complex dependencies including Triton, which caused import errors and tensor shape mismatches.

**Solution**: Created a mock implementation that:
- Disables Triton dependencies through environment variables
- Implements a `TritonMock` class to handle import attempts
- Creates simplified mock classes that match the CSM API

### Challenge 2: Port Conflicts

**Problem**: Default port 5000 was occupied by AirPlay Receiver on macOS.

**Solution**: Changed API server to run on port 5001 and updated API endpoints accordingly.

### Challenge 3: Tailwind CSS Configuration

**Problem**: PostCSS error occurred due to incorrect configuration with ES modules.

**Solution**: 
- Updated configuration to use ES module syntax (export default)
- Reinstalled packages with correct versions
- Updated import statements to use @tailwindcss/postcss

## Future Improvements

1. **Real Voice Generation**: Replace mock audio generation with actual text-to-speech services
2. **Enhanced Speech Recognition**: Implement more accurate speech-to-text capabilities
3. **Voice Activity Detection**: Add silence detection to automatically stop recording
4. **Response Quality**: Improve the quality and relevance of philosophical responses
5. **Extended Mentor Database**: Add more stoic philosophers and personalities

## Dependencies

### Frontend
- React
- Vite
- TypeScript
- Tailwind CSS
- Web Audio API

### Backend
- Flask
- Flask-CORS
- NumPy
- PyTorch
- TorchAudio 