"""
Audio Analysis Service for Voice Activity Detection (VAD)

This module provides a standalone service for analyzing audio levels
to detect speech and silence, with adaptive thresholding based on
background noise levels.
"""

import time
import math
import statistics
from typing import Dict, List, Optional, Callable, Union, Any, Tuple

# Define event types
class AudioAnalysisEvent:
    """Event types that can be emitted by the AudioAnalysisService."""
    CALIBRATION_START = 'calibration-start'
    CALIBRATION_COMPLETE = 'calibration-complete'
    SPEECH_START = 'speech-start'
    SPEECH_END = 'speech-end'
    THRESHOLD_CHANGED = 'threshold-changed'

# Default configuration
DEFAULT_CONFIG = {
    'initial_sensitivity_factor': 1.5,
    'calibration_duration_ms': 2000,
    'recalibration_interval_ms': 5000,
    'silence_duration_for_recal_ms': 2000,
    'max_sample_history': 50,
    'smoothing_factor': 0.1,
    'consecutive_frames_threshold': 2,
    'debug': False
}

class AudioAnalysisService:
    """
    A standalone service for audio level analysis and speech detection
    with adaptive thresholding.
    """
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """
        Initialize the AudioAnalysisService with optional configuration.
        
        Args:
            config: Configuration options to override defaults
        """
        # Apply configuration with defaults
        self._config = DEFAULT_CONFIG.copy()
        if config:
            self._config.update(config)
        
        # Internal state
        self._samples = []
        self._noise_floor = 0.0
        self._std_dev = 0.0
        self._sensitivity_factor = self._config['initial_sensitivity_factor']
        self._last_calibration_time = 0
        self._calibration_complete = False
        self._is_calibrating = True
        self._last_is_speech = False
        self._consecutive_speech_frames = 0
        self._consecutive_silence_frames = 0
        self._last_speech_time = 0
        self._last_silence_time = 0
        
        # Event system
        self._event_listeners = {
            AudioAnalysisEvent.CALIBRATION_START: [],
            AudioAnalysisEvent.CALIBRATION_COMPLETE: [],
            AudioAnalysisEvent.SPEECH_START: [],
            AudioAnalysisEvent.SPEECH_END: [],
            AudioAnalysisEvent.THRESHOLD_CHANGED: []
        }
        
        # Start initial calibration
        self._start_calibration()
    
    def _start_calibration(self) -> None:
        """Start the calibration process."""
        self._is_calibrating = True
        self._calibration_complete = False
        self._samples = []
        self._last_calibration_time = int(time.time() * 1000)  # Current time in ms
        
        self._emit_event(AudioAnalysisEvent.CALIBRATION_START)
        
        if self._config['debug']:
            print(f"[AudioAnalysisService] Starting calibration")
    
    def _complete_calibration(self) -> None:
        """Complete the calibration process using collected samples."""
        if len(self._samples) >= 5:
            self._noise_floor = statistics.mean(self._samples)
            self._std_dev = statistics.stdev(self._samples) if len(self._samples) > 1 else 0.01
        else:
            # Not enough samples, use default values
            self._noise_floor = 0.02
            self._std_dev = 0.01
        
        self._is_calibrating = False
        self._calibration_complete = True
        
        if self._config['debug']:
            print(f"[AudioAnalysisService] Calibration complete:")
            print(f"  Noise floor: {self._noise_floor:.4f}")
            print(f"  Standard deviation: {self._std_dev:.4f}")
            print(f"  Dynamic threshold: {self.get_current_threshold():.4f}")
        
        self._emit_event(
            AudioAnalysisEvent.CALIBRATION_COMPLETE,
            self.get_noise_profile()
        )
    
    def add_audio_sample(self, level: float, timestamp: Optional[int] = None) -> Dict[str, Any]:
        """
        Add a new audio level sample for analysis.
        
        Args:
            level: Audio level (0-1 range)
            timestamp: Optional timestamp in ms (defaults to current time)
            
        Returns:
            Analysis result
        """
        # Use current time if timestamp not provided
        if timestamp is None:
            timestamp = int(time.time() * 1000)
        
        # During calibration phase, collect samples
        if self._is_calibrating:
            self._samples.append(level)
            
            # Check if calibration duration has elapsed
            elapsed = timestamp - self._last_calibration_time
            if elapsed >= self._config['calibration_duration_ms']:
                self._complete_calibration()
                
            # Return early during calibration
            return {
                'level': level,
                'threshold': 0,
                'is_speech': False,
                'profile': self.get_noise_profile(),
                'timestamp': timestamp
            }
        
        # Add sample to history
        self._samples.append(level)
        if len(self._samples) > self._config['max_sample_history']:
            self._samples.pop(0)  # Remove oldest sample
        
        # Get current threshold
        threshold = self.get_current_threshold()
        
        # Determine if this is speech
        is_speech = level > threshold
        
        # Track consecutive frames
        if is_speech:
            self._consecutive_speech_frames += 1
            self._consecutive_silence_frames = 0
            self._last_speech_time = timestamp
        else:
            self._consecutive_speech_frames = 0
            self._consecutive_silence_frames += 1
            self._last_silence_time = timestamp
        
        # Require consecutive frames to confirm state change
        confirmed_is_speech = self._consecutive_speech_frames >= self._config['consecutive_frames_threshold']
        
        # Detect state transitions
        if confirmed_is_speech and not self._last_is_speech:
            self._last_is_speech = True
            result = {
                'level': level,
                'threshold': threshold,
                'is_speech': True,
                'profile': self.get_noise_profile(),
                'timestamp': timestamp
            }
            self._emit_event(AudioAnalysisEvent.SPEECH_START, result)
            return result
            
        elif not is_speech and self._last_is_speech and \
             self._consecutive_silence_frames >= self._config['consecutive_frames_threshold']:
            self._last_is_speech = False
            result = {
                'level': level,
                'threshold': threshold,
                'is_speech': False,
                'profile': self.get_noise_profile(),
                'timestamp': timestamp
            }
            self._emit_event(AudioAnalysisEvent.SPEECH_END, result)
            return result
        
        # Check for recalibration opportunity after extended silence
        silence_duration = timestamp - self._last_silence_time
        if not is_speech and \
           silence_duration > self._config['silence_duration_for_recal_ms'] and \
           timestamp - self._last_calibration_time > self._config['recalibration_interval_ms']:
            self._recalibrate_from_recent_silence()
        
        # Update noise floor with exponential moving average (only for quiet sounds)
        if level < self._noise_floor * 1.5:
            self._noise_floor = (self._config['smoothing_factor'] * level) + \
                               ((1 - self._config['smoothing_factor']) * self._noise_floor)
                               
            # Periodically recalculate standard deviation
            if len(self._samples) > 10:
                silent_samples = [s for s in self._samples[-10:] if s < threshold]
                if len(silent_samples) >= 5:
                    self._std_dev = statistics.stdev(silent_samples) if len(silent_samples) > 1 else self._std_dev
            
            # Notify about threshold changes
            self._emit_event(
                AudioAnalysisEvent.THRESHOLD_CHANGED,
                {'threshold': threshold, 'noise_floor': self._noise_floor}
            )
        
        # Adjust sensitivity factor based on signal consistency
        self._adjust_sensitivity_factor()
        
        # Return analysis result
        return {
            'level': level,
            'threshold': threshold,
            'is_speech': self._last_is_speech,
            'profile': self.get_noise_profile(),
            'timestamp': timestamp
        }
    
    def _recalibrate_from_recent_silence(self) -> None:
        """Recalibrate the noise profile based on recent silence."""
        # Use recent samples for recalibration
        recent_samples = self._samples[-min(20, len(self._samples)):]
        if len(recent_samples) >= 5:
            self._noise_floor = statistics.mean(recent_samples)
            self._std_dev = statistics.stdev(recent_samples) if len(recent_samples) > 1 else 0.01
            self._last_calibration_time = int(time.time() * 1000)
            
            if self._config['debug']:
                print(f"[AudioAnalysisService] Recalibrated from silence:")
                print(f"  New noise floor: {self._noise_floor:.4f}")
                print(f"  New standard deviation: {self._std_dev:.4f}")
                print(f"  New threshold: {self.get_current_threshold():.4f}")
            
            self._emit_event(
                AudioAnalysisEvent.THRESHOLD_CHANGED,
                {'threshold': self.get_current_threshold(), 'noise_floor': self._noise_floor}
            )
    
    def _adjust_sensitivity_factor(self) -> None:
        """Dynamically adjust sensitivity factor based on signal consistency."""
        if len(self._samples) >= 10:
            recent_samples = self._samples[-10:]
            mean = statistics.mean(recent_samples)
            std_dev = statistics.stdev(recent_samples) if len(recent_samples) > 1 else 0.01
            
            # Coefficient of variation (normalized measure of dispersion)
            variation_coeff = std_dev / mean if mean > 0 else 0
            
            # Adjust sensitivity based on signal stability
            if variation_coeff > 0.5:
                # High variation, increase sensitivity factor (less sensitive)
                self._sensitivity_factor = min(2.0, self._sensitivity_factor + 0.05)
            elif variation_coeff < 0.2 and self._sensitivity_factor > 1.3:
                # Low variation, decrease sensitivity factor (more sensitive)
                self._sensitivity_factor = max(1.2, self._sensitivity_factor - 0.05)
    
    def get_current_threshold(self) -> float:
        """
        Get the current dynamic threshold value.
        
        Returns:
            Current threshold (0-1)
        """
        return self._noise_floor + (self._std_dev * self._sensitivity_factor)
    
    def get_noise_profile(self) -> Dict[str, Any]:
        """
        Get the current noise profile.
        
        Returns:
            Dictionary containing current noise profile information
        """
        return {
            'noise_floor': self._noise_floor,
            'std_dev': self._std_dev,
            'samples': self._samples.copy(),
            'sensitivity_factor': self._sensitivity_factor,
            'last_calibration_time': self._last_calibration_time,
            'calibration_complete': self._calibration_complete
        }
    
    def is_speech_detected(self, level: Optional[float] = None) -> bool:
        """
        Check if the given audio level is considered speech.
        
        Args:
            level: Optional audio level to check, or use last detected state
            
        Returns:
            True if considered speech, False otherwise
        """
        if level is not None:
            return level > self.get_current_threshold()
        return self._last_is_speech
    
    def is_calibrating(self) -> bool:
        """
        Check if the service is currently calibrating.
        
        Returns:
            True if calibrating, False otherwise
        """
        return self._is_calibrating
    
    def force_recalibration(self) -> None:
        """Force a recalibration of the noise profile."""
        self._start_calibration()
    
    def update_config(self, config: Dict[str, Any]) -> None:
        """
        Update service configuration.
        
        Args:
            config: New configuration options (partial)
        """
        self._config.update(config)
    
    def add_event_listener(self, event: str, callback: Callable) -> None:
        """
        Subscribe to service events.
        
        Args:
            event: Event type to listen for
            callback: Function to call when event occurs
        """
        if event in self._event_listeners:
            self._event_listeners[event].append(callback)
    
    def remove_event_listener(self, event: str, callback: Callable) -> None:
        """
        Unsubscribe from service events.
        
        Args:
            event: Event type to unsubscribe from
            callback: Function to remove
        """
        if event in self._event_listeners and callback in self._event_listeners[event]:
            self._event_listeners[event].remove(callback)
    
    def _emit_event(self, event: str, data=None) -> None:
        """
        Emit an event to all registered listeners.
        
        Args:
            event: Event type to emit
            data: Data to pass to listeners
        """
        if event in self._event_listeners:
            for callback in self._event_listeners[event]:
                callback(data)
    
    def get_debug_state(self) -> Optional[Dict[str, Any]]:
        """
        Get the debug state log.
        Only available if debug mode is enabled.
        
        Returns:
            Debug state information or None if debug disabled
        """
        if not self._config['debug']:
            return None
            
        return {
            'config': self._config.copy(),
            'samples': self._samples.copy(),
            'noise_floor': self._noise_floor,
            'std_dev': self._std_dev,
            'sensitivity_factor': self._sensitivity_factor,
            'threshold': self.get_current_threshold(),
            'is_speech': self._last_is_speech,
            'consecutive_speech_frames': self._consecutive_speech_frames,
            'consecutive_silence_frames': self._consecutive_silence_frames,
            'calibration_complete': self._calibration_complete,
            'is_calibrating': self._is_calibrating
        }

# Create a singleton instance
audio_analysis_service = AudioAnalysisService()

# Helper functions for common calculations

def calculate_rms(samples: List[float]) -> float:
    """
    Calculate Root Mean Square (RMS) of audio samples.
    
    Args:
        samples: List of audio samples
    
    Returns:
        RMS value
    """
    if not samples:
        return 0.0
        
    sum_of_squares = sum(x*x for x in samples)
    return math.sqrt(sum_of_squares / len(samples)) 