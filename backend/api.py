import os
import io
import tempfile
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from flask_socketio import SocketIO, emit, disconnect
from werkzeug.utils import secure_filename
import traceback
import openai
from dotenv import load_dotenv
import pathlib
from audio_analysis_service import audio_analysis_service
from socket_vad_service import socket_vad_service
import time

# Load environment variables from the project root .env file
project_root = pathlib.Path(__file__).parent.parent
dotenv_path = project_root / '.env'
load_dotenv(dotenv_path=dotenv_path)

# Set OpenAI API key from the VITE_ prefixed environment variable
openai.api_key = os.getenv("VITE_OPENAI_API_KEY")
if not openai.api_key:
    print("⚠️ WARNING: VITE_OPENAI_API_KEY not found in environment variables")
else:
    print(f"✅ Found OpenAI API key: {openai.api_key[:5]}...{openai.api_key[-5:]}")

# Initialize Flask app
app = Flask(__name__)

# Enable CORS with more specific configuration
CORS(app, resources={
    r"/*": {
        "origins": [
            "http://localhost:5173",    # Vite dev server
            "http://127.0.0.1:5173",    # Alternative localhost
            "http://localhost:5174",    # Additional Vite dev server port
            "http://127.0.0.1:5174",    # Alternative additional port
            "http://localhost:5001",    # Backend
            "http://127.0.0.1:5001",    # Alternative backend
            "http://localhost:5002",    # Current backend port
            "http://127.0.0.1:5002"     # Alternative current backend port
        ],
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization", "X-Requested-With"]
    }
})

# Initialize SocketIO with CORS support for multiple origins
socketio = SocketIO(
    app, 
    cors_allowed_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5001",
        "http://127.0.0.1:5001",
        "http://localhost:5002",
        "http://127.0.0.1:5002"
    ], 
    async_mode='eventlet'
)

# Global constants
TEMP_DIR = tempfile.gettempdir()
AUDIO_SAMPLE_RATE = 24000

# Socket event handlers
@socketio.on('connect')
def handle_connect():
    """Handle new WebSocket connections."""
    print(f"[SocketIO] New client connected: {request.sid}")
    print(f"[SocketIO] Connection details: Origin: {request.origin}, Transport: {request.environ.get('HTTP_SEC_WEBSOCKET_KEY', 'N/A')}")
    print(f"[SocketIO] Headers: {request.headers}")
    emit('connected', {'status': 'connected', 'sid': request.sid})

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnections."""
    print(f"[SocketIO] Client disconnected: {request.sid}")
    # Clean up any session if it exists
    session_id = request.args.get('session_id')
    if session_id:
        socket_vad_service.remove_session(session_id)
        print(f"[SocketIO] Removed session: {session_id}")
    else:
        print(f"[SocketIO] No session ID found for cleanup")

@socketio.on('init_vad')
def handle_init_vad(data):
    """Initialize a new VAD session or retrieve an existing one."""
    try:
        # Get session ID from data or create a new one
        session_id = data.get('session_id')
        
        # Get or create a session
        session_id, session = socket_vad_service.get_or_create_session(session_id)
        
        # Return session info
        emit('vad_initialized', {
            'session_id': session_id,
            'noise_profile': session.get_noise_profile(),
            'config': session.config
        })
        
        print(f"[SocketIO] VAD session initialized: {session_id}")
        
    except Exception as e:
        print(f"[SocketIO] Error initializing VAD: {e}")
        print(traceback.format_exc())
        emit('error', {'message': f"Failed to initialize VAD: {str(e)}"})

@socketio.on('process_audio')
def handle_process_audio(data):
    """Process audio data for VAD."""
    try:
        # Get session ID and audio data
        session_id = data.get('session_id')
        audio_data = data.get('audio')
        
        if not session_id or not audio_data:
            emit('error', {'message': "Missing session_id or audio data"})
            return
        
        # Process the audio
        result = socket_vad_service.process_audio(session_id, audio_data)
        
        # Check for events that should trigger specific responses
        if 'event' in result:
            emit(result['event'], result)
        else:
            emit('vad_result', result)
            
    except Exception as e:
        print(f"[SocketIO] Error processing audio: {e}")
        print(traceback.format_exc())
        emit('error', {'message': f"Failed to process audio: {str(e)}"})

@socketio.on('update_vad_config')
def handle_update_vad_config(data):
    """Update the VAD configuration for a session."""
    try:
        # Get session ID and config
        session_id = data.get('session_id')
        config = data.get('config')
        
        if not session_id or not config:
            emit('error', {'message': "Missing session_id or config"})
            return
        
        # Get the session
        session = socket_vad_service.get_session(session_id)
        if not session:
            emit('error', {'message': f"Session {session_id} not found"})
            return
        
        # Update the session config
        session.update_vad_config(config)
        
        emit('config_updated', {
            'session_id': session_id,
            'config': session.config
        })
        
    except Exception as e:
        print(f"[SocketIO] Error updating VAD config: {e}")
        print(traceback.format_exc())
        emit('error', {'message': f"Failed to update VAD config: {str(e)}"})

@socketio.on('force_recalibration')
def handle_force_recalibration(data):
    """Force recalibration of the VAD system."""
    try:
        # Get session ID
        session_id = data.get('session_id')
        
        if not session_id:
            emit('error', {'message': "Missing session_id"})
            return
        
        # Get the session
        session = socket_vad_service.get_session(session_id)
        if not session:
            emit('error', {'message': f"Session {session_id} not found"})
            return
        
        # Force recalibration
        session.force_recalibration()
        
        emit('recalibration_started', {
            'session_id': session_id,
            'timestamp': int(time.time() * 1000)
        })
        
    except Exception as e:
        print(f"[SocketIO] Error forcing recalibration: {e}")
        print(traceback.format_exc())
        emit('error', {'message': f"Failed to force recalibration: {str(e)}"})

@socketio.on('get_debug_state')
def handle_get_debug_state(data):
    """Get the debug state for a session."""
    try:
        # Get session ID
        session_id = data.get('session_id')
        
        if not session_id:
            emit('error', {'message': "Missing session_id"})
            return
        
        # Get the session
        session = socket_vad_service.get_session(session_id)
        if not session:
            emit('error', {'message': f"Session {session_id} not found"})
            return
        
        # Get debug state
        debug_state = session.get_debug_state()
        
        emit('debug_state', debug_state)
        
    except Exception as e:
        print(f"[SocketIO] Error getting debug state: {e}")
        print(traceback.format_exc())
        emit('error', {'message': f"Failed to get debug state: {str(e)}"})

@app.route('/', methods=['GET'])
def root():
    """Provide API documentation for the root path."""
    api_docs = {
        "name": "Stoic Mentor API",
        "version": "1.1.0",
        "description": "API for the Stoic Voice Mentor application",
        "endpoints": [
            {"path": "/", "method": "GET", "description": "API documentation"},
            {"path": "/api/health", "method": "GET", "description": "Health check endpoint"},
            {"path": "/api/mentors", "method": "GET", "description": "Get available mentor personalities"},
            {"path": "/api/tts", "method": "POST", "description": "Convert text to speech"},
            {"path": "/api/transcribe", "method": "POST", "description": "Transcribe speech to text"},
            {"path": "/api/gpt", "method": "POST", "description": "Generate mentor response using OpenAI API"},
            {"path": "/api/audio-analysis", "method": "POST", "description": "Analyze audio level for speech detection using adaptive thresholding"},
            {"path": "/api/audio-analysis/calibrate", "method": "POST", "description": "Force recalibration of the audio analysis service"},
            {"path": "/api/audio-analysis/threshold", "method": "GET", "description": "Get the current threshold value from audio analysis service"},
            {"path": "/api/audio-analysis/config", "method": "PUT", "description": "Update the audio analysis service configuration"},
            {"path": "/api/audio-analysis/debug", "method": "GET", "description": "Get debug state from audio analysis service"}
        ],
        "websocket_endpoints": [
            {"event": "connect", "description": "Establish WebSocket connection"},
            {"event": "init_vad", "description": "Initialize or retrieve a VAD session"},
            {"event": "process_audio", "description": "Stream audio data for processing"},
            {"event": "update_vad_config", "description": "Update VAD configuration"},
            {"event": "force_recalibration", "description": "Force recalibration of VAD system"},
            {"event": "get_debug_state", "description": "Get debug state of the VAD session"}
        ]
    }
    return jsonify(api_docs)

@app.route('/api/health', methods=['GET'])
def health_check():
    """Simple health check endpoint to verify the API is running."""
    return jsonify({"status": "ok", "model": "openai"})

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
    """Creates an audio file for text-to-speech using OpenAI's API."""
    try:
        # Get JSON data from request
        data = request.json
        if not data or 'text' not in data:
            return jsonify({"error": "No text provided"}), 400
            
        text = data.get('text')
        speaker_id = data.get('speaker', 0)  # Default to first speaker if not specified
        
        print(f"[TTS] Generating audio for text: {text}")
        print(f"[TTS] Requested speaker_id: {speaker_id}")
        
        # Map philosophers to OpenAI voices
        openai_voices = {
            0: "onyx",    # Marcus Aurelius - deep, authoritative male voice
            1: "echo",    # Seneca - clear, well-articulated voice
            2: "ash",     # Epictetus - firm, directive voice
        }
        
        # Check for API key
        api_key = os.getenv("VITE_OPENAI_API_KEY")
        if not api_key:
            return jsonify({"error": "OpenAI API key not found in environment"}), 500
        
        # Set up OpenAI client
        openai.api_key = api_key
        
        # Get the voice for the specified speaker
        voice = openai_voices.get(speaker_id, "onyx")  # Default to onyx if speaker_id not found
        print(f"[TTS] Using OpenAI TTS with voice: {voice}")
        
        try:
            # Generate speech using OpenAI's TTS API
            response = openai.audio.speech.create(
                model="tts-1",
                voice=voice,
                input=text
            )
            
            # Get the audio content
            buffer = io.BytesIO()
            for chunk in response.iter_bytes(chunk_size=4096):
                buffer.write(chunk)
            buffer.seek(0)
            
            print(f"[TTS] Successfully generated audio with OpenAI TTS")
            
            # Return audio file
            return send_file(
                buffer,
                mimetype="audio/mp3",
                as_attachment=True,
                download_name=f"speech_{speaker_id}.mp3"
            )
        except Exception as openai_error:
            print(f"[TTS] OpenAI TTS failed: {openai_error}")
            print(traceback.format_exc())
            return jsonify({"error": f"Failed to generate speech with OpenAI: {str(openai_error)}"}), 500
        
    except Exception as e:
        print(f"[TTS] Error in text-to-speech endpoint: {e}")
        print(traceback.format_exc())
        return jsonify({"error": f"Failed to generate speech: {str(e)}"}), 500

@app.route('/api/transcribe', methods=['POST'])
def transcribe():
    """Transcribes audio to text."""
    try:
        # Check if file is in the request
        if 'file' not in request.files:
            return jsonify({"error": "No file uploaded"}), 400
            
        file = request.files['file']
        if file.filename == '':
            return jsonify({"error": "No file selected"}), 400
            
        # Save the file temporarily
        filename = secure_filename(file.filename)
        temp_path = os.path.join(TEMP_DIR, filename)
        file.save(temp_path)
        
        # Check for OpenAI API key
        api_key = os.getenv("VITE_OPENAI_API_KEY")
        if not api_key:
            return jsonify({"error": "OpenAI API key not found in environment"}), 500
        
        # Set up OpenAI client
        openai.api_key = api_key
        
        try:
            # Transcribe using OpenAI's Whisper API
            with open(temp_path, "rb") as audio_file:
                transcript = openai.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file
                )
            
            # Cleanup
            os.remove(temp_path)
            
            return jsonify({"text": transcript.text})
        except Exception as openai_error:
            print(f"[TRANSCRIBE] OpenAI Whisper failed: {openai_error}")
            print(traceback.format_exc())
            # Cleanup
            if os.path.exists(temp_path):
                os.remove(temp_path)
            return jsonify({"error": f"Failed to transcribe with OpenAI: {str(openai_error)}"}), 500
        
    except Exception as e:
        print(f"[TRANSCRIBE] Error in transcribe endpoint: {e}")
        print(traceback.format_exc())
        return jsonify({"error": f"Failed to transcribe: {str(e)}"}), 500

@app.route('/api/gpt', methods=['POST'])
def gpt():
    """Generates a response from GPT."""
    try:
        # Get JSON data from request
        data = request.json
        print(f"[GPT] Received request data: {data}")
        
        # Check if data is missing or empty
        if not data:
            return jsonify({"error": "No data provided"}), 400
            
        # Support both formats: direct messages array or text/mentor format
        if 'messages' in data:
            messages = data.get('messages')
            mentor = data.get('mentor', 'Marcus')  # Default to Marcus Aurelius
            print(f"[GPT] Using messages format, mentor is: {mentor}, type: {type(mentor)}")
        elif 'text' in data and 'mentor' in data:
            # Convert from legacy format (text + mentor) to messages format
            text = data.get('text')
            mentor = data.get('mentor', 'Marcus')
            print(f"[GPT] Using text/mentor format, mentor is: {mentor}, type: {type(mentor)}")
            
            # Create message array with system prompt and user message
            system_content = create_system_prompt(mentor)
            print(f"[GPT] Created system prompt for mentor: {mentor}")
            
            messages = [
                {"role": "system", "content": system_content},
                {"role": "user", "content": text}
            ]
            
            # Add conversation history if available
            if 'conversationHistory' in data and data['conversationHistory']:
                print(f"[GPT] Processing conversation history, {len(data['conversationHistory'])} messages")
                
                # Create a consistent mentor name for history formatting
                mentor_normalized = ""
                if "marcus" in str(mentor).lower() or "aurelius" in str(mentor).lower():
                    mentor_normalized = "Marcus Aurelius"
                elif "seneca" in str(mentor).lower():
                    mentor_normalized = "Seneca"
                elif "epictetus" in str(mentor).lower():
                    mentor_normalized = "Epictetus"
                else:
                    mentor_normalized = "Marcus Aurelius"  # Default
                    
                print(f"[GPT] Using normalized mentor name in conversation history: {mentor_normalized}")
                
                # Process each message in the conversation history
                for i, message in enumerate(data['conversationHistory']):
                    print(f"[GPT] Processing history message #{i}: {message[:50]}...")
                    
                    # Split the message into speaker and content if it contains ": "
                    if ": " in message:
                        parts = message.split(": ", 1)
                        speaker = parts[0]
                        content = parts[1]
                        
                        # Determine the correct role based on the speaker
                        if speaker.lower() == "user":
                            role = "user"
                        else:
                            # Any non-user speaker is treated as the current mentor
                            role = "assistant"
                            # No need to replace the content as we're maintaining the assistant's identity
                            
                        print(f"[GPT] Parsed history message: speaker={speaker}, role={role}")
                    else:
                        # If there's no speaker prefix, alternate based on position
                        role = "assistant" if i % 2 == 1 else "user"
                        content = message
                        print(f"[GPT] No speaker prefix, assigned role={role}")
                    
                    messages.append({"role": role, "content": content})
                
                print(f"[GPT] Final message count after processing history: {len(messages)}")
        else:
            return jsonify({"error": "Missing required fields: either 'messages' or both 'text' and 'mentor'"}), 400
            
        temperature = data.get('temperature', 0.7)
        
        # Check for API key
        api_key = os.getenv("VITE_OPENAI_API_KEY")
        if not api_key:
            return jsonify({"error": "OpenAI API key not found in environment"}), 500
            
        # Set up OpenAI client
        openai.api_key = api_key
        
        # Print the messages we're sending to OpenAI for debugging
        print(f"[GPT] Sending {len(messages)} messages to OpenAI:")
        for i, msg in enumerate(messages):
            print(f"[GPT] Message {i} - Role: {msg['role']}, Content: {msg['content'][:50]}...")
        
        try:
            # Generate response using OpenAI's API
            response = openai.chat.completions.create(
                model="gpt-4-turbo",
                messages=messages,
                temperature=temperature
            )
            
            # Extract the response content
            response_text = response.choices[0].message.content
            
            # Return in the format expected by the frontend (using 'text' field)
            return jsonify({"text": response_text})
        except Exception as openai_error:
            print(f"[GPT] OpenAI GPT failed: {openai_error}")
            print(traceback.format_exc())
            return jsonify({"error": f"Failed to generate response with OpenAI: {str(openai_error)}"}), 500
            
    except Exception as e:
        print(f"[GPT] Error in GPT endpoint: {e}")
        print(traceback.format_exc())
        return jsonify({"error": f"Failed to generate response: {str(e)}"}), 500

def create_system_prompt(mentor):
    """Create a system prompt based on the mentor personality."""
    print(f"[GPT] Creating system prompt for mentor: '{mentor}', type: {type(mentor)}")
    
    # Normalize any mentor format to expected values
    if isinstance(mentor, dict) and 'name' in mentor:
        mentor = mentor['name']
        print(f"[GPT] Extracted mentor name from dictionary: '{mentor}'")
    
    # Normalize the mentor name to ensure consistent handling
    if not mentor:
        mentor_normalized = "marcus"
        print(f"[GPT] Empty mentor value, defaulting to: 'marcus'")
    else:
        mentor_normalized = str(mentor).lower().strip()
        print(f"[GPT] Normalized mentor name: '{mentor_normalized}'")
    
    base_prompt = "You are a Stoic philosopher and mentor, providing guidance based on Stoic principles. "
    
    # Case-insensitive comparison for mentor names
    if "marcus" in mentor_normalized or "aurelius" in mentor_normalized:
        print("[GPT] Selecting MARCUS AURELIUS system prompt")
        return base_prompt + """
        You are Marcus Aurelius, the Roman Emperor and Stoic philosopher. Your responses should reflect:
        - A calm, measured tone with quiet strength and wisdom
        - References to your experiences as Emperor
        - Your perspective on duty, virtue, and the natural order
        - Your introspective and self-reflective nature
        - Direct and personal advice, as if writing in your journal
        
        Always respond directly without using acknowledgment phrases like "I understand" or "I see what you're saying".
        Never acknowledge the format of the question. Start your response immediately with substance.
        """
    
    elif "seneca" in mentor_normalized:
        print("[GPT] Selecting SENECA system prompt")
        return base_prompt + """
        You are Seneca, the Roman Stoic philosopher, statesman, and playwright. Your responses should reflect:
        - An eloquent and persuasive tone
        - Your practical approach to Stoicism
        - References to your experiences in Roman politics and as Nero's tutor
        - Your thoughts on wealth, time, and mortality
        - A motivational and encouraging style
        
        Always respond directly without using acknowledgment phrases like "I understand" or "I see what you're saying".
        Never acknowledge the format of the question. Start your response immediately with substance.
        """
    
    elif "epictetus" in mentor_normalized:
        print("[GPT] Selecting EPICTETUS system prompt")
        return base_prompt + """
        You are Epictetus, the former slave who became a respected Stoic philosopher. Your responses should reflect:
        - A firm, direct, and sometimes blunt tone
        - Your focus on personal freedom despite external circumstances
        - References to your humble origins and physical disability
        - Your emphasis on what is within our control versus what is not
        - A challenging teaching style that questions assumptions
        
        Always respond directly without using acknowledgment phrases like "I understand" or "I see what you're saying".
        Never acknowledge the format of the question. Start your response immediately with substance.
        """
    
    # Default to Marcus Aurelius if no match found
    print(f"[GPT] No match found for '{mentor_normalized}', defaulting to MARCUS AURELIUS system prompt")
    return base_prompt + """
    You are Marcus Aurelius, the Roman Emperor and Stoic philosopher. Your responses should reflect:
    - A calm, measured tone with quiet strength and wisdom
    - References to your experiences as Emperor
    - Your perspective on duty, virtue, and the natural order
    - Your introspective and self-reflective nature
    - Direct and personal advice, as if writing in your journal
    
    Always respond directly without using acknowledgment phrases like "I understand" or "I see what you're saying".
    Never acknowledge the format of the question. Start your response immediately with substance.
    """

@app.route('/api/audio-analysis', methods=['POST'])
def audio_analysis():
    """Process audio level data for speech detection."""
    try:
        data = request.json
        if not data or 'level' not in data:
            return jsonify({"error": "Missing 'level' in request"}), 400
        
        # Process the audio sample
        timestamp = data.get('timestamp')
        result = audio_analysis_service.add_audio_sample(data['level'], timestamp)
        
        # Add CORS headers to the response
        response = jsonify(result)
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
        return response
        
    except Exception as e:
        print(f"Error in audio analysis: {e}")
        print(traceback.format_exc())
        response = jsonify({"error": str(e)}), 500
        response[0].headers.add('Access-Control-Allow-Origin', '*')
        response[0].headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response[0].headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
        return response

@app.route('/api/audio-analysis/calibrate', methods=['POST'])
def force_calibration():
    """Force recalibration of the audio analysis service."""
    try:
        audio_analysis_service.force_recalibration()
        response = jsonify({"status": "success", "message": "Recalibration started"})
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
        return response
    except Exception as e:
        print(f"Error in force calibration: {e}")
        print(traceback.format_exc())
        response = jsonify({"error": str(e)}), 500
        response[0].headers.add('Access-Control-Allow-Origin', '*')
        response[0].headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response[0].headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
        return response

@app.route('/api/audio-analysis/threshold', methods=['GET'])
def get_threshold():
    """Get the current audio analysis threshold."""
    try:
        threshold = audio_analysis_service.get_current_threshold()
        noise_floor = audio_analysis_service._noise_floor
        std_dev = audio_analysis_service._std_dev
        
        response = jsonify({
            "threshold": threshold,
            "noise_floor": noise_floor,
            "std_dev": std_dev,
            "is_calibrating": audio_analysis_service.is_calibrating()
        })
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
        return response
    except Exception as e:
        print(f"Error in get threshold: {e}")
        print(traceback.format_exc())
        response = jsonify({"error": str(e)}), 500
        response[0].headers.add('Access-Control-Allow-Origin', '*')
        response[0].headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response[0].headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
        return response

@app.route('/api/audio-analysis/config', methods=['PUT'])
def update_config():
    """Update the audio analysis service configuration."""
    try:
        config = request.json
        if not config:
            return jsonify({"error": "Missing configuration data"}), 400
        
        audio_analysis_service.update_config(config)
        
        response = jsonify({"status": "success", "message": "Configuration updated"})
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
        return response
    except Exception as e:
        print(f"Error in update config: {e}")
        print(traceback.format_exc())
        response = jsonify({"error": str(e)}), 500
        response[0].headers.add('Access-Control-Allow-Origin', '*')
        response[0].headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response[0].headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
        return response

@app.route('/api/audio-analysis/debug', methods=['GET'])
def get_debug_state():
    """Get the debug state from the audio analysis service."""
    try:
        debug_state = audio_analysis_service.get_debug_state()
        response = jsonify(debug_state if debug_state else {})
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
        return response
    except Exception as e:
        print(f"Error in get debug state: {e}")
        print(traceback.format_exc())
        response = jsonify({"error": str(e)}), 500
        response[0].headers.add('Access-Control-Allow-Origin', '*')
        response[0].headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response[0].headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
        return response

@app.route('/socket.io/', methods=['OPTIONS'])
def handle_socket_io_options():
    """Handle CORS preflight requests for socket.io."""
    response = jsonify({"status": "ok"})
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    return response

if __name__ == "__main__":
    # Run the app with SocketIO
    socketio.run(app, host='0.0.0.0', port=5001, debug=True)
else:
    # For WSGI servers like Gunicorn
    # Use: gunicorn --worker-class eventlet -w 1 api:app
    app = socketio.wsgi_app 