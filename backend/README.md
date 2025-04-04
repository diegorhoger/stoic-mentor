# Stoic Mentor Backend

This is the backend server for the Stoic Voice Mentor application, providing voice processing, text-to-speech, and mentor response generation.

## Features

- Voice Activity Detection (VAD) via WebSocket for real-time audio processing
- Text-to-speech conversion using OpenAI's API
- Speech-to-text transcription using OpenAI's Whisper API
- Mentor response generation using OpenAI's API

## WebSocket-based VAD System

The WebSocket-based Voice Activity Detection (VAD) system provides real-time audio analysis for detecting speech with high accuracy. It uses a hybrid approach combining:

1. **RMS-based adaptive thresholding** - Analyzes audio levels with dynamic noise floor calibration
2. **WebRTC VAD** - Google's WebRTC Voice Activity Detection algorithm
3. **Ensemble approach** - Combines both methods with configurable weights

### Key Features

- **Session-based architecture** - Each user gets a dedicated processing pipeline
- **Adaptive thresholding** - Automatically adjusts to different noise environments
- **Multiple VAD methods** - Combines traditional signal processing with specialized VAD algorithms
- **Real-time feedback** - Immediate speech detection events
- **Configurable parameters** - Adjust sensitivity, aggressiveness, and other parameters
- **Persistent calibration** - Maintains noise profiles per session

## Getting Started

### Prerequisites

- Python 3.9+
- pip

### Installation

1. Clone the repository
2. Install dependencies:
   ```
   pip install -r requirements.txt
   ```
3. Set up environment variables in `.env`:
   ```
   OPENAI_API_KEY=your-openai-api-key
   SOCKET_VAD_DEBUG=true
   SOCKET_VAD_SAMPLE_RATE=16000
   SOCKET_VAD_FRAME_DURATION_MS=30
   SOCKET_VAD_AGGRESSIVENESS=2
   ```

### Running the Server

For development:
```
python api.py
```

For production:
```
gunicorn --worker-class eventlet -w 1 --bind 0.0.0.0:5000 api:app
```

The server runs on port 5000 by default.

## WebSocket API

### Connection

Connect to the WebSocket server:
```javascript
const socket = io('http://localhost:5000', {
    transports: ['websocket'],
    reconnection: true
});
```

### Events

#### Client → Server

| Event | Data | Description |
|-------|------|-------------|
| `init_vad` | `{ session_id?: string }` | Initialize a VAD session (optional session_id) |
| `process_audio` | `{ session_id: string, audio: string }` | Send base64-encoded audio for processing |
| `update_vad_config` | `{ session_id: string, config: object }` | Update VAD configuration |
| `force_recalibration` | `{ session_id: string }` | Force recalibration of the VAD system |
| `get_debug_state` | `{ session_id: string }` | Get debug information about the session |

#### Server → Client

| Event | Data | Description |
|-------|------|-------------|
| `connected` | `{ status: string, sid: string }` | Connection established |
| `vad_initialized` | `{ session_id: string, noise_profile: object, config: object }` | VAD session initialized |
| `vad_result` | `{ is_speech: boolean, rms_level: number, threshold: number, timestamp: number }` | Regular VAD update |
| `speech_start` | `{ event: string, timestamp: number, confidence: number, session_id: string }` | Speech detected |
| `speech_end` | `{ event: string, timestamp: number, duration_ms: number, session_id: string }` | Speech ended |
| `calibration_started` | `{ session_id: string, timestamp: number }` | Calibration started |
| `calibration_complete` | `{ session_id: string, noise_profile: object }` | Calibration complete |
| `config_updated` | `{ session_id: string, config: object }` | Configuration updated |
| `debug_state` | `{ ... }` | Debug state information |
| `error` | `{ message: string }` | Error information |

## Example Client

An example client implementation is provided in `websocket_client_example.html`. This demonstrates:

1. Connecting to the WebSocket server
2. Initializing a VAD session
3. Recording and streaming audio
4. Receiving and displaying speech detection events
5. Adjusting VAD parameters
6. Handling calibration

## Configuration Options

The VAD system supports various configuration options that can be updated at runtime:

### General Options

- `debug` - Enable debug output
- `sample_rate` - Audio sample rate (must be 8000, 16000, 32000, or 48000 Hz for WebRTC VAD)
- `frame_duration_ms` - Frame duration in milliseconds (10, 20, or 30 ms for WebRTC VAD)

### WebRTC VAD Options

- `use_webrtc_vad` - Enable WebRTC VAD
- `aggressiveness` - WebRTC VAD aggressiveness (0-3, higher = more aggressive)

### RMS VAD Options

- `use_rms_vad` - Enable RMS-based VAD
- `initial_sensitivity_factor` - Sensitivity factor for threshold calculation
- `calibration_duration_ms` - Duration of initial calibration in milliseconds
- `recalibration_interval_ms` - Minimum time between recalibrations in milliseconds
- `silence_duration_for_recal_ms` - Required silence duration for automatic recalibration
- `consecutive_frames_threshold` - Number of consecutive frames required for state change

### Ensemble Options

- `webrtc_weight` - Weight for WebRTC VAD in ensemble (0-1)
- `rms_weight` - Weight for RMS VAD in ensemble (0-1)

## Docker Support

A Dockerfile is provided for containerization. Build and run the container:

```
docker build -t stoic-mentor-backend .
docker run -p 5000:5000 --env-file .env stoic-mentor-backend
```

## License

This project is proprietary and confidential. 