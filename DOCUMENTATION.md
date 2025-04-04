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
   - AI-powered mentor responses via OpenAI integration

### API Design

The API is designed to be simple and RESTful:

- `GET /api/health`: Check if the API server is running
- `GET /api/mentors`: Retrieve available mentor personalities
- `POST /api/tts`: Convert text to speech using a mock generator
- `POST /api/transcribe`: Transcribe speech to text using mock responses
- `POST /api/gpt`: Generate mentor responses using OpenAI's GPT-4 model

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

## UI Components

### Core Components
- **ConversationUI**: Main interface for the conversation experience
- **TranscriptBox**: Displays user and mentor text with appropriate styling
- **MentorSwitcher**: Component for selecting different stoic mentors
- **MentorCallUI**: Manages the conversation flow with mentor selection

### UI Components
- **VoiceButton**: Interactive button for recording with visual feedback including state indicators (recording, processing, speaking) and animations
- **WaveformVisualizer**: Visual representation of audio levels during recording and playback

## Recent Changes

### Implemented OpenAI API Integration for Authentic Stoic Responses

**Change**: Enhanced the backend to forward requests to the OpenAI API instead of generating mock responses.

**Rationale**: While the mock backend provided reliable responses, integrating with OpenAI's GPT-4 model offers more dynamic, contextually aware responses that can address a wider range of philosophical questions while maintaining the authentic voice of each Stoic mentor.

**Implementation Details**:
- Added OpenAI Python library integration in the Flask backend
- Created detailed system prompts for each Stoic philosopher that capture their unique voice and teaching style
- Implemented proper conversation history handling for contextual awareness
- Added robust error handling with fallback to mock responses when API calls fail
- Maintained the sanitization pipeline to remove unwanted acknowledgment phrases
- Added comprehensive logging to trace the request/response flow

**Impact**: Users now experience:
- More dynamic and nuanced philosophical responses from each Stoic mentor
- Contextually aware conversations that reference previous exchanges
- Authentic Stoic wisdom that maintains the distinctive voice of each philosopher
- Seamless fallback to reliable mock responses if API issues occur

### Implemented Voice Activity Detection (VAD)

**Change**: Added Voice Activity Detection to automatically stop recording when the user stops speaking.

**Rationale**: The previous implementation required users to manually stop recording after speaking, which created an unnatural conversation flow. The new VAD system provides a more intuitive experience by detecting silence and automatically transitioning from listening to processing.

**Implementation Details**:
- Created a new `useVoiceActivityDetection` hook that monitors audio levels
- Added silence detection logic with configurable thresholds stored in constants
- Integrated VAD with the existing `useMicStream` hook
- Configured the conversation UI to display VAD status to users
- Added safeguards to prevent premature silence detection:
  - Minimum speaking time before silence detection activates
  - Consecutive silent frames required to trigger silence detection
  - Configurable silence threshold and timeout duration

**Technical Approach**:
1. The `useVoiceActivityDetection` hook takes the current audio level as input
2. When audio level falls below the silence threshold for a specified duration, it triggers a callback
3. The silence timeout only starts after a minimum speaking time to avoid false triggers
4. Visual feedback in the UI shows when VAD is active

**Impact**: Users now experience:
- More natural conversation flow without needing to manually stop recording
- Automatic transition from speaking to processing
- Reduced confusion about when to stop speaking
- Visual feedback showing when VAD is active and monitoring their speech

### Enhanced Stoic Mentor Prompts

**Change**: Reimplemented the mentor prompt system to provide more immersive, emotionally supportive responses that authentically reflect the distinct voices of each Stoic mentor.

**Rationale**: The previous system used simple static prompts that didn't fully capture the unique personalities and teaching styles of the Stoic mentors. The new implementation:
1. Creates a dedicated module for mentor prompts with more nuanced character guidance
2. Provides both verbose and concise prompt options for different use cases
3. Includes specific tone guides for each mentor to ensure authentic role-playing

**Implementation Details**:
- Created a new `mentorPrompts.ts` file with enhanced prompt templates
- Updated the `openaiService.ts` to use the new mentor prompts system
- Modified the `createSystemPrompt` function to accept a mentor name rather than a prompt string
- Updated the API service to generate responses using the new prompt system
- Removed static prompt strings from the mentor personalities in constants

**Impact**: The application now provides more authentic and personality-driven responses from each Stoic mentor. Users will experience:
- More emotionally resonant guidance tailored to each mentor's unique perspective
- Responses that better reflect the historical teaching style of each philosopher
- Interactions that feel like true mentorship rather than generic philosophical advice

### Removed Unused Root `/src` Directory

**Change**: Removed the unused `/src` directory at the root level of the project.

**Rationale**: The project had two separate source directories:
1. `/stoic-mentor/src` - The active frontend application code
2. `/src` - An empty or partially implemented directory at the root level

After analysis, we determined that the root `/src` directory was not being used by any part of the application and contained only placeholder or incomplete code. All active development is properly contained within the `/stoic-mentor/src` directory for the frontend and the `/stoic-mentor/backend` directory for the API server.

**Impact**: No functional impact to the application. This change simplifies the project structure and removes potential confusion about which source directory is actively used.

## CI/CD Setup

The project uses GitHub Actions for continuous integration and deployment, with specific workflows for web, backend, and mobile builds.

### Web CI/CD (Vercel)

- **Configuration Files**: 
  - `.github/workflows/web.yml` - GitHub Actions workflow
  - `vercel.json` - Vercel deployment configuration

- **Process**:
  1. On push to main branch or pull requests, the workflow runs linting and build tests
  2. When merged to main, code is automatically deployed to Vercel
  3. Environment variables are managed through Vercel's dashboard

- **Required Secrets**:
  - `VERCEL_TOKEN` - API token for Vercel
  - `VERCEL_ORG_ID` - Organization ID from Vercel
  - `VERCEL_PROJECT_ID` - Project ID from Vercel

### Backend CI/CD

- **Configuration Files**:
  - `.github/workflows/backend.yml` - GitHub Actions workflow

- **Process**:
  1. Tests Python code using pytest
  2. Deployment is configured based on your chosen backend hosting platform
  3. Default setup includes placeholder for serverless function deployment

### Mobile CI/CD (Expo)

- **Configuration Files**:
  - `.github/workflows/mobile.yml` - GitHub Actions workflow
  - `eas.json` - Expo Application Services configuration

- **Process**:
  1. For pull requests: Builds preview versions using EAS Build
  2. For merges to main: Builds production versions
  3. Manual workflow dispatch option for app store submissions

- **Required Secrets**:
  - `EXPO_TOKEN` - API token for Expo

### Local Development

When developing locally, these CI/CD workflows don't impact your workflow. You can continue to use:
- `npm run dev` - For web development
- `expo start` - For mobile development (requires expo-cli)
- `cd backend && flask run` - For backend development

## Technologies Used

### Backend Technologies
- **Flask**: A lightweight web framework for Python used to build the RESTful API
- **Kokoro TTS**: An open-weight small-footprint TTS model for high-quality voice synthesis
- **OpenAI API**: Used for the GPT model integration
- **TorchAudio**: For audio processing and manipulation

## API Endpoints

The following API endpoints are available:

- `GET /api/health`: Health check endpoint
- `GET /api/mentors`: Get available mentor personalities
- `POST /api/tts`: Convert text to speech using Kokoro TTS (with fallbacks to mock generator and sine wave)
- `POST /api/transcribe`: Transcribe speech to text
- `POST /api/gpt`: Generate mentor response using OpenAI API
- `POST /api/stream`: Stream audio (not yet implemented)

## TTS Implementation

The application implements a three-tier fallback system for text-to-speech:

1. **Kokoro TTS**: Primary TTS engine using the open-source Kokoro model (82M parameters)
   - Uses different voices mapped to each mentor personality
   - Provides high-quality, natural-sounding speech
   - Runs entirely on the backend server without external API calls

2. **Mock Generator Fallback**: If Kokoro fails, falls back to the mock generator
   - Generates simple audio patterns 
   - Used mainly for development and testing

3. **Sine Wave Fallback**: Ultimate fallback if all else fails
   - Generates basic sine waves with different frequencies per voice
   - Ensures the application can always provide audio feedback

## Future Enhancements

- **Voice Customization**: Add support for custom voice profiles beyond the default set
- **Streaming TTS**: Implement chunk-based streaming for faster audio response

## WebSocket-Based Voice Activity Detection (VAD)

**Change**: Implemented WebSocket-based Voice Activity Detection

**Rationale**: The previous approach to Voice Activity Detection (VAD) relied on client-side processing only, which led to inconsistent results across different devices and browsers. By moving to a WebSocket-based architecture, we gain several advantages:

1. More consistent and reliable speech detection across devices and browsers
2. Access to more powerful audio processing libraries (like WebRTC VAD) on the backend
3. Adaptive thresholding and noise floor calibration
4. Ensemble approach combining multiple detection methods
5. Reduced client-side computational requirements

**Implementation Details**:

1. **Backend VAD Service**
   - Created a Socket.IO-based WebSocket service in Flask
   - Implemented a session-based architecture to maintain user state
   - Combined RMS-based adaptive thresholding with WebRTC VAD
   - Added dynamic calibration and configuration options
   - Provided fine-tuning parameters for sensitivity and aggressiveness

2. **Frontend Integration**
   - Developed `socketVadService.ts` for WebSocket communication with the backend
   - Created `useSocketVad` React hook for easy integration with components
   - Implemented audio processing and streaming pipeline
   - Added event-based architecture for speech detection events
   - Built robust reconnection and error handling

3. **Demo Component**
   - Created `WebSocketVadDemo.tsx` to demonstrate the WebSocket VAD capabilities
   - Added visual feedback for audio levels and thresholds
   - Implemented controls for configuring VAD parameters
   - Added debug information display

**Impact**: Users now experience:
   - More reliable and consistent speech detection
   - Better handling of different noise environments
   - Reduced false positives and negatives in speech detection
   - More natural conversation flow
   - Adaptive behavior that works across different microphones and devices

**Usage Example**:
```typescript
// Using the WebSocket VAD hook in a component
const {
  isSpeaking,
  audioLevel,
  threshold,
  startAudioProcessing,
  stopAudioProcessing
} = useSocketVad({
  autoConnect: true,
  autoInit: true,
  onSpeakingChange: (speaking) => {
    console.log('Speaking state changed:', speaking);
    // Handle speaking state changes
  }
});

// Start audio processing when needed
useEffect(() => {
  if (isListening) {
    startAudioProcessing();
    return () => stopAudioProcessing();
  }
}, [isListening]);
``` 