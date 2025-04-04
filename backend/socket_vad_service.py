"""
Socket-based Voice Activity Detection (VAD) Service

This module provides a WebSocket interface for real-time audio processing
and voice activity detection. It integrates with AudioAnalysisService for
advanced audio analysis capabilities.
"""

import base64
import numpy as np
import time
import webrtcvad
import threading
import uuid
from typing import Dict, Any, Optional, List, Tuple
from audio_analysis_service import AudioAnalysisService, AudioAnalysisEvent
from dataclasses import dataclass

# Default configuration
DEFAULT_SOCKET_VAD_CONFIG = {
    'sample_rate': 16000,  # WebRTC VAD requires 8000, 16000, 32000, or 48000 Hz
    'frame_duration_ms': 30,  # WebRTC VAD accepts 10, 20, or 30 ms
    'aggressiveness': 2,  # WebRTC VAD aggressiveness (0-3)
    'use_webrtc_vad': True,
    'use_rms_vad': True,
    'webrtc_weight': 0.7,  # Weight for WebRTC VAD result in ensemble
    'rms_weight': 0.3,  # Weight for RMS VAD result in ensemble
    'session_timeout_ms': 300000,  # 5 minutes
    'buffer_size': 1024,  # Buffer size for audio processing
    'debug': False
}

@dataclass
class AudioFrame:
    """Represents a frame of audio data for processing."""
    data: bytes
    rms_level: float
    timestamp: int
    is_speech_rms: bool = False
    is_speech_webrtc: bool = False
    is_speech_ensemble: bool = False

class UserSession:
    """Manages a single user's VAD session and state."""
    
    def __init__(self, session_id: str, config: Optional[Dict[str, Any]] = None):
        """
        Initialize a new user session with configuration.
        
        Args:
            session_id: Unique identifier for this session
            config: Configuration options, will be merged with defaults
        """
        self.session_id = session_id
        self.created_at = int(time.time() * 1000)
        self.last_activity = self.created_at
        self.config = DEFAULT_SOCKET_VAD_CONFIG.copy()
        if config:
            self.config.update(config)
        
        # Audio analysis service for RMS-based VAD
        self.audio_service = AudioAnalysisService({
            'debug': self.config['debug']
        })
        
        # WebRTC VAD if enabled
        self.webrtc_vad = None
        if self.config['use_webrtc_vad']:
            self.webrtc_vad = webrtcvad.Vad(self.config['aggressiveness'])
        
        # Session state
        self.is_speaking = False
        self.speech_start_time = 0
        self.speech_end_time = 0
        self.frames: List[AudioFrame] = []
        self.max_frames = 100  # Keep last 100 frames for analysis
        
        # Debug stats
        self.total_frames = 0
        self.speech_frames = 0
        
        # Calculate frame size in bytes based on sample rate and frame duration
        bytes_per_sample = 2  # 16-bit audio = 2 bytes per sample
        self.frame_size = int(self.config['sample_rate'] * 
                             (self.config['frame_duration_ms'] / 1000.0) * 
                             bytes_per_sample)
                             
        if self.config['debug']:
            print(f"[UserSession] Created new session {session_id}")
            print(f"[UserSession] Frame size: {self.frame_size} bytes")
    
    def is_expired(self) -> bool:
        """Check if this session has expired based on inactivity."""
        now = int(time.time() * 1000)
        return (now - self.last_activity) > self.config['session_timeout_ms']
    
    def update_activity(self) -> None:
        """Update the last activity timestamp."""
        self.last_activity = int(time.time() * 1000)
    
    def process_audio_chunk(self, audio_data: bytes) -> Dict[str, Any]:
        """
        Process an incoming audio chunk and determine VAD status.
        
        Args:
            audio_data: Base64-encoded PCM audio data
            
        Returns:
            Dictionary with VAD results
        """
        self.update_activity()
        timestamp = int(time.time() * 1000)
        
        # Decode base64 audio data
        try:
            decoded_audio = base64.b64decode(audio_data)
        except Exception as e:
            if self.config['debug']:
                print(f"[UserSession] Error decoding audio: {e}")
            return {"error": "Invalid audio data format"}
        
        # Process the audio frame by frame
        results = []
        for i in range(0, len(decoded_audio), self.frame_size):
            if i + self.frame_size <= len(decoded_audio):
                frame_data = decoded_audio[i:i+self.frame_size]
                result = self._process_frame(frame_data, timestamp)
                results.append(result)
        
        # Determine overall speech state from the frame results
        if results:
            # Count speech frames
            speech_frames = sum(1 for r in results if r['is_speech'])
            speech_ratio = speech_frames / len(results)
            
            new_is_speaking = speech_ratio > 0.5  # More than half of frames have speech
            
            # Handle state transitions
            if new_is_speaking and not self.is_speaking:
                self.is_speaking = True
                self.speech_start_time = timestamp
                return {
                    "event": "speech_start",
                    "timestamp": timestamp,
                    "confidence": speech_ratio,
                    "session_id": self.session_id
                }
            elif not new_is_speaking and self.is_speaking:
                self.is_speaking = False
                self.speech_end_time = timestamp
                return {
                    "event": "speech_end",
                    "timestamp": timestamp,
                    "duration_ms": self.speech_end_time - self.speech_start_time,
                    "session_id": self.session_id
                }
        
        # Return regular update if no state change
        return {
            "event": "vad_update",
            "timestamp": timestamp,
            "is_speaking": self.is_speaking,
            "session_id": self.session_id
        }
    
    def _process_frame(self, frame_data: bytes, timestamp: int) -> Dict[str, Any]:
        """
        Process a single frame of audio.
        
        Args:
            frame_data: PCM audio data for a single frame
            timestamp: Current timestamp in milliseconds
            
        Returns:
            Frame processing results
        """
        self.total_frames += 1
        
        # Calculate RMS level for this frame
        pcm_data = np.frombuffer(frame_data, dtype=np.int16)
        rms_level = np.sqrt(np.mean(pcm_data.astype(np.float32) ** 2)) / 32768.0  # Normalize to 0-1
        
        # Process with AudioAnalysisService (RMS-based)
        rms_result = self.audio_service.add_audio_sample(rms_level, timestamp)
        is_speech_rms = rms_result['is_speech']
        
        # Process with WebRTC VAD if enabled
        is_speech_webrtc = False
        if self.webrtc_vad and len(frame_data) == self.frame_size:
            try:
                is_speech_webrtc = self.webrtc_vad.is_speech(frame_data, self.config['sample_rate'])
            except Exception as e:
                if self.config['debug']:
                    print(f"[UserSession] WebRTC VAD error: {e}")
        
        # Combine results if using both methods
        is_speech_ensemble = False
        if self.config['use_webrtc_vad'] and self.config['use_rms_vad']:
            ensemble_score = (
                (is_speech_webrtc * self.config['webrtc_weight']) + 
                (is_speech_rms * self.config['rms_weight'])
            )
            is_speech_ensemble = ensemble_score > 0.5
        else:
            # Use whichever method is enabled
            is_speech_ensemble = is_speech_rms if self.config['use_rms_vad'] else is_speech_webrtc
        
        # Create frame record
        frame = AudioFrame(
            data=frame_data,
            rms_level=rms_level,
            timestamp=timestamp,
            is_speech_rms=is_speech_rms,
            is_speech_webrtc=is_speech_webrtc,
            is_speech_ensemble=is_speech_ensemble
        )
        
        # Store frame in history
        self.frames.append(frame)
        if len(self.frames) > self.max_frames:
            self.frames.pop(0)  # Remove oldest frame
        
        # Update statistics
        if is_speech_ensemble:
            self.speech_frames += 1
        
        return {
            "is_speech": is_speech_ensemble,
            "rms_level": rms_level,
            "threshold": rms_result['threshold'],
            "timestamp": timestamp
        }
    
    def get_noise_profile(self) -> Dict[str, Any]:
        """Get the current audio noise profile from the RMS analysis."""
        return self.audio_service.get_noise_profile()
    
    def force_recalibration(self) -> None:
        """Force recalibration of the audio analysis."""
        self.audio_service.force_recalibration()
    
    def update_vad_config(self, config: Dict[str, Any]) -> None:
        """Update the VAD configuration."""
        if config:
            # Update user session config
            prev_webrtc_config = {
                'use_webrtc_vad': self.config['use_webrtc_vad'],
                'aggressiveness': self.config['aggressiveness']
            }
            
            self.config.update(config)
            
            # Check if WebRTC VAD settings changed
            if (self.config['use_webrtc_vad'] != prev_webrtc_config['use_webrtc_vad'] or
                self.config['aggressiveness'] != prev_webrtc_config['aggressiveness']):
                
                # Reinitialize WebRTC VAD if needed
                if self.config['use_webrtc_vad']:
                    self.webrtc_vad = webrtcvad.Vad(self.config['aggressiveness'])
                else:
                    self.webrtc_vad = None
            
            # Update AudioAnalysisService config as well
            if 'rms_vad_config' in config:
                self.audio_service.update_config(config['rms_vad_config'])
    
    def get_debug_state(self) -> Dict[str, Any]:
        """Get the debug state for this session."""
        rms_debug = self.audio_service.get_debug_state() or {}
        
        return {
            "session_id": self.session_id,
            "created_at": self.created_at,
            "last_activity": self.last_activity,
            "is_speaking": self.is_speaking,
            "total_frames": self.total_frames,
            "speech_frames": self.speech_frames,
            "speech_ratio": self.speech_frames / max(1, self.total_frames),
            "rms_vad": rms_debug,
            "webrtc_vad": {
                "enabled": self.config['use_webrtc_vad'],
                "aggressiveness": self.config['aggressiveness'] if self.config['use_webrtc_vad'] else None
            },
            "ensemble": {
                "rms_weight": self.config['rms_weight'],
                "webrtc_weight": self.config['webrtc_weight']
            },
            "config": self.config
        }

class SocketVADService:
    """
    Main service for socket-based VAD handling.
    Manages user sessions and dispatches audio processing.
    """
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """
        Initialize the SocketVADService.
        
        Args:
            config: Configuration options
        """
        self.config = DEFAULT_SOCKET_VAD_CONFIG.copy()
        if config:
            self.config.update(config)
        
        # User sessions dictionary keyed by session ID
        self.sessions: Dict[str, UserSession] = {}
        
        # Session cleanup thread
        self.cleanup_thread = threading.Thread(target=self._cleanup_expired_sessions)
        self.cleanup_thread.daemon = True
        self.cleanup_thread.start()
        
        if self.config['debug']:
            print(f"[SocketVADService] Initialized with config: {self.config}")
    
    def get_or_create_session(self, session_id: Optional[str] = None) -> Tuple[str, UserSession]:
        """
        Get an existing session or create a new one.
        
        Args:
            session_id: Optional session ID to retrieve
            
        Returns:
            Tuple of (session_id, UserSession)
        """
        # Generate a new session ID if none provided
        if not session_id:
            session_id = str(uuid.uuid4())
        
        # Create new session if it doesn't exist
        if session_id not in self.sessions:
            self.sessions[session_id] = UserSession(session_id, self.config)
            
        return session_id, self.sessions[session_id]
    
    def process_audio(self, session_id: str, audio_data: bytes) -> Dict[str, Any]:
        """
        Process audio data for a specific session.
        
        Args:
            session_id: Session identifier
            audio_data: Base64-encoded audio data
            
        Returns:
            Processing result
        """
        # Get or create session
        _, session = self.get_or_create_session(session_id)
        
        # Process the audio
        return session.process_audio_chunk(audio_data)
    
    def _cleanup_expired_sessions(self) -> None:
        """Background thread to clean up expired sessions."""
        while True:
            try:
                # Find expired sessions
                now = int(time.time() * 1000)
                expired_sessions = [
                    sid for sid, session in self.sessions.items()
                    if session.is_expired()
                ]
                
                # Remove expired sessions
                for sid in expired_sessions:
                    if self.config['debug']:
                        session = self.sessions[sid]
                        print(f"[SocketVADService] Removing expired session {sid} "
                              f"(inactive for {now - session.last_activity}ms)")
                    del self.sessions[sid]
                
                # Sleep for a while
                time.sleep(60)  # Check every minute
                
            except Exception as e:
                print(f"[SocketVADService] Error in cleanup thread: {e}")
                time.sleep(60)  # Sleep and retry
    
    def get_session_count(self) -> int:
        """Get the number of active sessions."""
        return len(self.sessions)
    
    def get_session(self, session_id: str) -> Optional[UserSession]:
        """Get a session by ID."""
        return self.sessions.get(session_id)
    
    def remove_session(self, session_id: str) -> bool:
        """
        Remove a session by ID.
        
        Returns:
            True if session was removed, False if not found
        """
        if session_id in self.sessions:
            del self.sessions[session_id]
            return True
        return False

# Create global instance
socket_vad_service = SocketVADService() 