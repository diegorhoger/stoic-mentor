import os
import io
import tempfile
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS, cross_origin
from werkzeug.utils import secure_filename
import time
import numpy as np
import wave
import json
import random
import traceback
import re
import openai
from dotenv import load_dotenv
import pathlib

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
            {"path": "/api/gpt", "method": "POST", "description": "Generate mentor response using OpenAI API"},
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

@app.route('/api/gpt', methods=['POST'])
def generate_mentor_response():
    print("\n🔍 FLOW TRACE [generate_mentor_response] - /api/gpt endpoint called")
    print(f"🔍 FLOW TRACE [generate_mentor_response] - Request method: {request.method}")
    print(f"🔍 FLOW TRACE [generate_mentor_response] - Content-Type: {request.headers.get('Content-Type')}")
    
    if not request.data:
        print("🔍 FLOW TRACE [generate_mentor_response] - ⚠️ No data in request")
        return jsonify({"error": "No data provided"}), 400
    
    try:
        data = request.get_json()
        print(f"🔍 FLOW TRACE [generate_mentor_response] - Request data: {data}")
        
        if not data or 'text' not in data or 'mentor' not in data:
            print("🔍 FLOW TRACE [generate_mentor_response] - ⚠️ Missing required fields in request")
            return jsonify({"error": "Missing required fields"}), 400
        
        text = data['text']
        mentor = data['mentor']
        conversation_history = data.get('conversationHistory', [])
        
        print(f"🔍 FLOW TRACE [generate_mentor_response] - Processing text: {text[:100]}...")
        print(f"🔍 FLOW TRACE [generate_mentor_response] - Selected mentor: {mentor}")
        print(f"🔍 FLOW TRACE [generate_mentor_response] - Conversation history length: {len(conversation_history)}")
        
        # If we have conversation history, append it to our log
        if conversation_history:
            print("🔍 FLOW TRACE [generate_mentor_response] - Conversation history:")
            for i, message in enumerate(conversation_history[-3:]):  # Show only the last 3 messages
                print(f"🔍 FLOW TRACE [generate_mentor_response] - Message {i}: {message[:50]}...")
        
        # Check if OpenAI API key is available
        if not openai.api_key:
            print("🔍 FLOW TRACE [generate_mentor_response] - ⚠️ OpenAI API key not set, falling back to mock responses")
            # Fall back to mock response generation
            mock_response = generate_mock_response(mentor, text)
            return jsonify({"text": mock_response})
        
        try:
            # Create system prompt based on mentor
            system_prompt = create_system_prompt(mentor)
            
            # Prepare messages for the OpenAI API
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": text}
            ]
            
            # Add conversation history if available
            if conversation_history:
                for i, message in enumerate(conversation_history):
                    role = "assistant" if i % 2 == 1 else "user"
                    messages.append({"role": role, "content": message})
            
            print(f"🔍 FLOW TRACE [generate_mentor_response] - Sending request to OpenAI API with {len(messages)} messages")
            
            # Make request to OpenAI API
            response = openai.chat.completions.create(
                model="gpt-4",  # Use GPT-4 for high quality responses
                messages=messages,
                temperature=0.7,
                max_tokens=400,
                top_p=1.0
            )
            
            # Extract the response text
            response_text = response.choices[0].message.content
            print(f"🔍 FLOW TRACE [generate_mentor_response] - Received response from OpenAI: {response_text[:100]}...")
            
            # Apply sanitization to remove acknowledgment phrases
            sanitized_response = sanitize_response(response_text)
            print(f"🔍 FLOW TRACE [generate_mentor_response] - BEFORE sanitization: {response_text[:100]}...")
            print(f"🔍 FLOW TRACE [generate_mentor_response] - AFTER sanitization: {sanitized_response[:100]}...")
            
            # Return the sanitized response
            return jsonify({"text": sanitized_response})
            
        except Exception as e:
            print(f"🔍 FLOW TRACE [generate_mentor_response] - ❌ OpenAI API Error: {str(e)}")
            print("🔍 FLOW TRACE [generate_mentor_response] - Falling back to mock response")
            
            # Fall back to mock response generation
            mock_response = generate_mock_response(mentor, text)
            return jsonify({"text": mock_response})
    
    except Exception as e:
        print(f"🔍 FLOW TRACE [generate_mentor_response] - ❌ Error: {str(e)}")
        return jsonify({"error": str(e)}), 500

def create_system_prompt(mentor):
    """Create a system prompt based on the mentor personality."""
    base_prompt = "You are a Stoic philosopher and mentor, providing guidance based on Stoic principles. "
    
    if mentor == "Marcus":
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
    
    elif mentor == "Seneca":
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
    
    else:  # Epictetus
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

def generate_mock_response(mentor, text):
    """Generate a mock response when OpenAI API is unavailable."""
    # Extract the user's actual question
    user_question = text
    if "[CRITICAL:" in text:
        # Remove the instruction part if present
        user_question = text.split("\n\n", 1)[1] if "\n\n" in text else text
    
    print(f"🔍 FLOW TRACE [generate_mock_response] - User's actual question: {user_question[:100]}...")
    
    # Custom response based on user input
    # Check for specific keywords in the user's question
    user_question_lower = user_question.lower()
    
    if "how are you" in user_question_lower or "how do you feel" in user_question_lower:
        if mentor == "Marcus":
            response_text = "The state of your soul determines the state of your being. Focus not on how I am, but on your own virtue."
        elif mentor == "Seneca":
            response_text = "A wise man is content with his fate, neither rejoicing excessively nor lamenting needlessly."
        else:  # Epictetus
            response_text = "What matters is not my condition, but how one responds to circumstances. This is the essence of Stoic practice."
    
    elif "stoicism" in user_question_lower or "philosophy" in user_question_lower:
        if mentor == "Marcus":
            response_text = "Stoicism teaches that virtue alone is sufficient for happiness. External events are neither good nor bad; our judgments make them so."
        elif mentor == "Seneca":
            response_text = "Philosophy is not mere words but action. Stoicism guides us to distinguish between what we can control and what we cannot."
        else:  # Epictetus
            response_text = "True freedom comes from understanding what is within our control. Our opinions, impulses, desires, and aversions are in our power; everything else is not."
    
    elif "death" in user_question_lower or "dying" in user_question_lower:
        if mentor == "Marcus":
            response_text = "Death is a natural process. Think of the vastness of eternity past and future, and how infinitesimal our lives are. Fear not what is merely nature's way."
        elif mentor == "Seneca":
            response_text = "Death is neither good nor evil; it simply is. It is not death that matters, but how we lived."
        else:  # Epictetus
            response_text = "When death appears fearsome, remember that the terror comes not from death but from your judgment about death. Remove your judgment and death is merely another natural process."
    
    elif "happiness" in user_question_lower or "joy" in user_question_lower:
        if mentor == "Marcus":
            response_text = "True happiness flows from your own actions, not external events. Virtue is sufficient for happiness."
        elif mentor == "Seneca":
            response_text = "Happiness comes not from what happens to you, but from how you respond. The wise person finds joy in virtue alone."
        else:  # Epictetus
            response_text = "Happiness depends on the quality of your thoughts and choices, not on possessions or circumstances."
    
    else:
        # Fallback responses for general questions
        fallback_responses = {
            "Marcus": [
                "Remember that all is as thinking makes it so.",
                "The universe is change; our life is what our thoughts make it.",
                "The art of living is more like wrestling than dancing.",
                "Waste no more time arguing about what a good person should be. Be one."
            ],
            "Seneca": [
                "We suffer more often in imagination than in reality.",
                "It is not the man who has too little, but the man who craves more, that is poor.",
                "Luck is what happens when preparation meets opportunity.",
                "No person has the power to have everything they want, but it is in their power not to want what they don't have."
            ],
            "Epictetus": [
                "It's not what happens to you, but how you react to it that matters.",
                "Make the best use of what is in your power, and take the rest as it happens.",
                "Freedom is the only worthy goal in life.",
                "Wealth consists not in having great possessions, but in having few wants."
            ]
        }
        
        # Get the appropriate mentor responses or default to Marcus
        mentor_responses = fallback_responses.get(mentor, fallback_responses["Marcus"])
        response_text = random.choice(mentor_responses)
    
    # Apply sanitization to remove acknowledgment phrases
    sanitized_response = sanitize_response(response_text)
    
    return sanitized_response

def sanitize_response(text):
    """Sanitize the response to remove acknowledgment phrases."""
    print(f"🔍 FLOW TRACE [sanitize_response] - Starting with text: {text[:50]}...")
    
    # List of patterns to look for and remove
    patterns_to_avoid = [
        r"^I understand what you're saying about",
        r"^I understand what you are saying about",
        r"^I understand your question about",
        r"^I see what you're saying about",
        r"^I see what you are saying about",
        r"^Let me think about that from",
        r"^Thank you for your question",
        r"^I appreciate your question",
        r"^As a Stoic philosopher",
        r"^From a Stoic perspective",
        r"^Looking at this from a Stoic perspective",
        r"^Speaking as a Stoic",
        r"^I understand you're asking about",
        r"^I understand you are asking about",
        r"^I am here",
        r"^Yes, I am here",
        r"^Indeed I am",
        r"^Present and attentive",
        r"^Present and listening",
        r"^Yes, at your service",
        r"^Indeed\.",
    ]
    
    # Check if the response contains any patterns to avoid
    original_text = text
    for pattern in patterns_to_avoid:
        if re.search(pattern, text, re.IGNORECASE):
            print(f"🔍 FLOW TRACE [sanitize_response] - Found pattern: {pattern}")
            # Remove the pattern and any text before the next sentence
            text = re.sub(pattern + r"[^.!?]*[.!?]", "", text, flags=re.IGNORECASE)
            # Remove any leading whitespace
            text = text.strip()
    
    if original_text != text:
        print("🔍 FLOW TRACE [sanitize_response] - Text was modified")
    else:
        print("🔍 FLOW TRACE [sanitize_response] - No patterns found, text unchanged")
    
    print(f"🔍 FLOW TRACE [sanitize_response] - Final text: {text[:50]}...")
    return text

@app.route('/api/stream', methods=['POST'])
def stream_audio():
    """Placeholder for streaming API."""
    return jsonify({"message": "Streaming not yet implemented"}), 501

@app.route('/api/test', methods=['GET'])
def test_route():
    """Simple test endpoint to verify that the API is working."""
    print("======= /api/test endpoint called =======")
    return jsonify({"status": "success", "message": "Test route is working"})

if __name__ == '__main__':
    print("Starting mock API server on port 5002...")
    app.run(debug=True, host='0.0.0.0', port=5002) 