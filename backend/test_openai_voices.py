import os
import requests
import json
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# API endpoint
API_URL = "http://localhost:5002/api/tts"

# Test quotes for each philosopher
philosopher_quotes = {
    "Marcus Aurelius": "You have power over your mind - not outside events. Realize this, and you will find strength.",
    "Seneca": "It is not that we have a short time to live, but that we waste a lot of it.",
    "Epictetus": "Make the best use of what is in your power, and take the rest as it happens."
}

# Test each philosopher's voice
def test_voices():
    print("Testing OpenAI voices for Stoic philosophers...")
    
    for i, (philosopher, quote) in enumerate(philosopher_quotes.items()):
        print(f"\nTesting voice for {philosopher} (Speaker ID: {i})")
        print(f"Quote: \"{quote}\"")
        
        # Prepare payload
        payload = {
            "text": quote,
            "speaker": i
        }
        
        # Make request to TTS endpoint
        try:
            response = requests.post(API_URL, json=payload)
            
            if response.status_code == 200:
                # Save audio file
                filename = f"test_{philosopher.lower().replace(' ', '_')}.mp3"
                with open(filename, "wb") as f:
                    f.write(response.content)
                print(f"✅ Success! Audio saved to {filename}")
            else:
                error_data = response.json()
                print(f"❌ Error: {error_data.get('error', 'Unknown error')}")
        
        except Exception as e:
            print(f"❌ Exception: {str(e)}")

if __name__ == "__main__":
    test_voices() 