
import os
os.environ['DISABLE_TRITON'] = '1'
os.environ['NO_TORCH_COMPILE'] = '1'

from dataclasses import dataclass
import torch
import torchaudio

@dataclass
class Segment:
    speaker: int
    text: str
    audio: torch.Tensor

class MockGenerator:
    def __init__(self):
        self.sample_rate = 24000
        self.device = "cpu"
    
    def generate(self, text, speaker, context=None, max_audio_length_ms=5000, temperature=0.9, topk=50):
        print(f"Mock generating audio for: {text}")
        # Generate a simple tone based on speaker ID
        duration_sec = min(max_audio_length_ms / 1000, 10)
        samples = int(duration_sec * self.sample_rate)
        t = torch.linspace(0, duration_sec, samples, device=self.device)
        
        # Different frequency for each speaker
        freq = 440 if speaker == 0 else (392 if speaker == 1 else 349)
        audio = torch.sin(2 * 3.14159 * freq * t)
        
        # Add some variation
        audio = audio * (0.5 + 0.5 * torch.sin(2 * 3.14159 * 0.5 * t))
        
        return audio

def load_csm_1b(device="cpu"):
    return MockGenerator()
