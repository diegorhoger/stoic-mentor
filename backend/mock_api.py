import os
import io
import tempfile
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename
import time
import numpy as np
import wave

# Initialize Flask app
app = Flask(__name__)
CORS(app)  # Enable Cross-Origin Resource Sharing

# Global constants
TEMP_DIR = tempfile.gettempdir()
AUDIO_SAMPLE_RATE = 24000

# Try to import the mock generator
try:
    from mock_generator import load_csm_1b, Segment
    generator = load_csm_1b()
    USE_MOCK_GENERATOR = True
    print("[API] Successfully loaded mock generator for TTS")
except Exception as e:
    print(f"[API] Failed to load mock generator, using sine wave: {e}")
    USE_MOCK_GENERATOR = False

@app.route('/', methods=['GET'])
def root():
    """Provide API documentation for the root path."""
    api_docs = {
        "name": "Stoic Mentor API",
        "version": "1.0.0",
        "description": "API for the Stoic Voice Mentor application",
        "endpoints": [
            {"path": "/", "method": "GET", "description": "API documentation"},
            {"path": "/api/health", "method": "GET", "description": "Health check endpoint"},
            {"path": "/api/mentors", "method": "GET", "description": "Get available mentor personalities"},
            {"path": "/api/tts", "method": "POST", "description": "Convert text to speech"},
            {"path": "/api/transcribe", "method": "POST", "description": "Transcribe speech to text"},
            {"path": "/api/stream", "method": "POST", "description": "Stream audio (not yet implemented)"}
        ]
    }
    return jsonify(api_docs)

@app.route('/api/health', methods=['GET'])
def health_check():
    """Simple health check endpoint to verify the API is running."""
    return jsonify({"status": "ok", "model": "mock"})

@app.route('/api/mentors', methods=['GET'])
def get_mentors():
    """Returns the available mentor personalities."""
    mentors = {
        "marcus": {
            "name": "Marcus Aurelius",
            "style": "calm",
            "description": "Roman Emperor and Stoic philosopher, speaks with quiet strength and wisdom."
        },
        "seneca": {
            "name": "Seneca",
            "style": "motivational",
            "description": "Roman Stoic philosopher and statesman, speaks with eloquence and motivation."
        },
        "epictetus": {
            "name": "Epictetus",
            "style": "firm",
            "description": "Former slave turned influential Stoic philosopher, speaks bluntly and challenges assumptions."
        }
    }
    return jsonify(mentors)

@app.route('/api/tts', methods=['POST'])
def text_to_speech():
    """Creates a WAV file for text-to-speech."""
    try:
        # Get JSON data from request
        data = request.json
        if not data or 'text' not in data:
            return jsonify({"error": "No text provided"}), 400
            
        text = data.get('text')
        speaker_id = data.get('speaker', 0)  # Default to first speaker if not specified
        
        print(f"[Mock] Generating audio for text: {text}")
        
        # Generate audio using the mock generator if available
        if USE_MOCK_GENERATOR:
            try:
                # Generate audio using mock generator
                print(f"[Mock] Using mock generator for speaker: {speaker_id}")
                audio_tensor = generator.generate(
                    text=text,
                    speaker=speaker_id,
                    context=[],
                    max_audio_length_ms=10000  # 10 seconds maximum
                )
                
                # Convert tensor to WAV
                buffer = io.BytesIO()
                import torchaudio
                torchaudio.save(buffer, audio_tensor.unsqueeze(0), generator.sample_rate, format="wav")
                buffer.seek(0)
                
                # Return audio file
                return send_file(
                    buffer,
                    mimetype="audio/wav",
                    as_attachment=True,
                    download_name=f"speech_{speaker_id}.wav"
                )
            except Exception as e:
                print(f"[Mock] Mock generator failed, falling back to sine wave: {e}")
                # Fall back to sine wave generation
        
        # If mock generator is not available or failed, use sine wave generation
        duration = 2  # seconds
        frequency = 440.0  # 440 Hz = A4
        
        # Adjust frequency based on speaker for variety
        if speaker_id == 1:
            frequency = 392.0  # G4
        elif speaker_id == 2:
            frequency = 349.2  # F4
            
        samples = np.arange(duration * AUDIO_SAMPLE_RATE)
        waveform = np.sin(2 * np.pi * frequency * samples / AUDIO_SAMPLE_RATE)
        
        # Scale to 16-bit range and convert to int
        waveform = (waveform * 32767).astype(np.int16)
        
        # Create WAV file in memory
        buffer = io.BytesIO()
        with wave.open(buffer, 'wb') as wav_file:
            wav_file.setnchannels(1)  # Mono
            wav_file.setsampwidth(2)  # 16 bits
            wav_file.setframerate(AUDIO_SAMPLE_RATE)
            wav_file.writeframes(waveform.tobytes())
        
        buffer.seek(0)
        
        # Simulate processing time
        time.sleep(1)
        
        # Return audio file
        return send_file(
            buffer,
            mimetype="audio/wav",
            as_attachment=True,
            download_name=f"speech_{speaker_id}.wav"
        )
        
    except Exception as e:
        print(f"[Mock] Error in text_to_speech: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/transcribe', methods=['POST'])
def transcribe_audio():
    """Returns a mock transcription in a format similar to OpenAI's Whisper API."""
    try:
        # Check if file is in request
        if 'audio' not in request.files:
            print("[Mock] Error: No audio file provided in request")
            return jsonify({"error": "No audio file provided"}), 400
            
        file = request.files['audio']
        if file.filename == '':
            print("[Mock] Error: No audio file selected")
            return jsonify({"error": "No audio file selected"}), 400
            
        # Save temporarily
        filename = secure_filename(file.filename)
        filepath = os.path.join(TEMP_DIR, filename)
        file.save(filepath)
        
        # Log file details
        file_size = os.path.getsize(filepath)
        print(f"[Mock] Received audio file: {filename}, size: {file_size} bytes")
        
        # Simulate processing time
        time.sleep(1)
        
        # Return mock transcription
        responses = [
            "Hello, I'd like to discuss Stoic philosophy with you.",
            "What does it mean to live virtuously according to the Stoics?",
            "How can I practice Stoic mindfulness in my daily life?",
            "Tell me about the concept of 'amor fati'.",
            "What would Marcus Aurelius advise about dealing with difficult people?"
        ]
        
        transcription = responses[int(time.time()) % len(responses)]
        print(f"[Mock] Returning transcription: {transcription}")
        
        # Clean up
        os.remove(filepath)
        
        # Return in a format similar to Whisper API
        # Whisper API returns: { "text": "..." }
        # For backward compatibility we'll include both fields
        return jsonify({
            "text": transcription,
            "transcription": transcription
        })
        
    except Exception as e:
        print(f"[Mock] Error in transcribe_audio: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/stream', methods=['POST'])
def stream_audio():
    """Placeholder for streaming API."""
    return jsonify({"message": "Streaming not yet implemented"}), 501

if __name__ == '__main__':
    print("Starting mock API server on port 5001...")
    app.run(debug=True, host='0.0.0.0', port=5001) 