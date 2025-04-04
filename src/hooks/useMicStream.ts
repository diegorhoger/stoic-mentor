import { useState, useEffect, useCallback, useRef } from 'react';
import { checkAudioSupport, createAudioContext } from '../utils/audioUtils';
import { useVoiceActivityDetection } from './useVoiceActivityDetection';
import { VAD_SETTINGS } from '../constants/audioThresholds';
import { calculateRMS } from '../utils/audioAnalysis';

interface UseMicStreamOptions {
  enableVAD?: boolean;
  silenceThreshold?: number;
  silenceTimeoutMs?: number;
  minSpeakingTimeMs?: number;
  onSilenceDetected?: () => void;
  onSilenceComplete?: (audioBlob: Blob) => Promise<void> | void;
}

interface UseMicStreamResult {
  isRecording: boolean;
  audioLevel: number;
  startRecording: () => Promise<boolean>;
  stopRecording: () => void;
  getAudioBlob: () => Promise<Blob | null>;
  isVADActive: boolean;
}

export function useMicStream(options: UseMicStreamOptions = {}): UseMicStreamResult {
  // Default options
  const defaultOptions: Required<UseMicStreamOptions> = {
    enableVAD: true,
    silenceThreshold: VAD_SETTINGS.SILENCE_THRESHOLD,
    silenceTimeoutMs: VAD_SETTINGS.SILENCE_TIMEOUT_MS,
    minSpeakingTimeMs: VAD_SETTINGS.MIN_SPEAKING_TIME_MS,
    onSilenceDetected: () => {},
    onSilenceComplete: () => {}
  };
  
  const opts = { ...defaultOptions, ...options };
  
  // State for component re-renders
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isPermissionGranted, setIsPermissionGranted] = useState(false);
  
  // Refs to store media related objects
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioLevelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const isCleaningUpRef = useRef(false);
  const silenceDetectedRef = useRef(false);
  
  // New refs for direct buffer monitoring
  const bufferAnalysisRef = useRef<{
    recentChunks: Array<{size: number, timestamp: number}>;
    maxChunkSize: number;
    lastUpdateTime: number;
    directAudioLevel: number;
    baselineChunkSize?: number;
  }>({
    recentChunks: [],
    maxChunkSize: 0,
    lastUpdateTime: 0,
    directAudioLevel: 0
  });
  
  // Keep track of which detection method is working
  const detectionMethodRef = useRef<{
    analyzerWorking: boolean;
    directBufferWorking: boolean;
    hybrid: boolean;
  }>({
    analyzerWorking: false,
    directBufferWorking: false,
    hybrid: true
  });
  
  // Voice Activity Detection
  const { 
    isActive: isVADActive, 
    startVAD, 
    stopVAD
  } = useVoiceActivityDetection(audioLevel, {
    silenceThreshold: opts.silenceThreshold,
    silenceTimeoutMs: opts.silenceTimeoutMs,
    minSpeakingTimeMs: opts.minSpeakingTimeMs,
    onSilence: () => {
      console.log('VAD triggered silence detection with level:', audioLevel);
      if (isRecording && opts.enableVAD) {
        console.log('VAD automatic stop triggered');
        silenceDetectedRef.current = true;
        opts.onSilenceDetected();

        // Stop recording immediately when silence is detected
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          console.log('Stopping MediaRecorder due to silence detection');
          mediaRecorderRef.current.stop();
        }
      }
    },
    onSpeech: () => {
      console.log('VAD detected speech');
    }
  });
  
  // Clean up all resources
  const cleanupResources = useCallback(async () => {
    if (isCleaningUpRef.current) return;
    isCleaningUpRef.current = true;
    console.log("Cleaning up all media resources");
    
    // Stop VAD if active
    stopVAD();
    
    // Cancel animation frame
    if (animationFrameIdRef.current) {
      console.log("Canceling animation frame:", animationFrameIdRef.current);
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }
    
    // Close audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      console.log("Closing AudioContext");
      try {
        await audioContextRef.current.close();
      } catch (error) {
        console.warn('Error closing AudioContext:', error);
      }
      audioContextRef.current = null;
    }
    
    // Stop media recorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      console.log("Stopping MediaRecorder in cleanup");
      try {
        mediaRecorderRef.current.stop();
        // Wait for the recorder to actually stop
        await new Promise<void>((resolve) => {
          if (mediaRecorderRef.current) {
            mediaRecorderRef.current.onstop = () => resolve();
          } else {
            resolve();
          }
        });
      } catch (error) {
        console.warn('Error stopping MediaRecorder:', error);
      }
    }
    
    // Stop all media tracks
    if (mediaStreamRef.current) {
      console.log("Stopping all media tracks");
      mediaStreamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (error) {
          console.warn('Error stopping track:', error);
        }
      });
      mediaStreamRef.current = null;
    }
    
    setIsRecording(false);
    isCleaningUpRef.current = false;
  }, [stopVAD]);
  
  // Clean up resources on unmount
  useEffect(() => {
    return () => {
      console.log("Component unmounting, cleaning up resources");
      cleanupResources();
    };
  }, [cleanupResources]);
  
  // Start recording
  const startRecording = useCallback(async (): Promise<boolean> => {
    console.log("startRecording called");
    
    // Clean up any existing resources first
    cleanupResources();
    
    // Reset silence detection state
    silenceDetectedRef.current = false;
    
    if (!checkAudioSupport()) {
      console.error("Audio API not supported in this browser");
      throw new Error('Audio API not supported in this browser');
    }
    
    try {
      // Reset audio chunks
      chunksRef.current = [];
      
      console.log("Requesting microphone permission...");
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1
        } 
      });
      console.log("Microphone permission granted, stream tracks:", stream.getAudioTracks().length);
      
      // Save stream reference
      mediaStreamRef.current = stream;
      
      // Set up audio context and analyser
      console.log("Creating AudioContext");
      const ctx = createAudioContext();
      audioContextRef.current = ctx;

      // BROWSER CRITICAL FIX: Force audio context to start with user interaction
      if (ctx.state === 'suspended') {
        console.log("AudioContext suspended, attempting to resume with user interaction");
        try {
          // Use a timeout to ensure this happens after the UI is updated
          setTimeout(() => {
            ctx.resume().then(() => {
              console.log("AudioContext resumed successfully after user interaction");
            }).catch(err => {
              console.error("Failed to resume AudioContext:", err);
            });
          }, 100);
        } catch (err) {
          console.error("Error trying to resume AudioContext:", err);
        }
      }
      
      // Create source node from media stream
      console.log("Creating source node from media stream");
      const source = ctx.createMediaStreamSource(stream);
      
      // Create analyser with specific settings for voice detection
      const analyserNode = ctx.createAnalyser();
      analyserNode.fftSize = 256; // Use smallest possible FFT for performance
      analyserNode.smoothingTimeConstant = 0.5; // Higher smoothing for stability
      analyserNode.minDecibels = -90;
      analyserNode.maxDecibels = -10; // Focus on speech range
      
      // CRITICAL: Make sure source is connected to analyser
      console.log("Connecting source to analyser");
      source.connect(analyserNode);
      
      // DEBUG: Create test oscillator to verify analyser is working
      try {
        const testOsc = ctx.createOscillator();
        const testGain = ctx.createGain();
        testGain.gain.value = 0.0001; // Nearly silent but detectable
        testOsc.connect(testGain);
        testGain.connect(analyserNode);
        testOsc.frequency.value = 440; // A4 note
        testOsc.start();
        setTimeout(() => testOsc.stop(), 500); // Stop after 500ms
        console.log("Created test tone to verify analyser");
      } catch (e) {
        console.warn("Could not create test tone:", e);
      }
      
      console.log("Analyser configuration:", {
        fftSize: analyserNode.fftSize,
        frequencyBinCount: analyserNode.frequencyBinCount,
        minDecibels: analyserNode.minDecibels,
        maxDecibels: analyserNode.maxDecibels,
        smoothingTimeConstant: analyserNode.smoothingTimeConstant
      });
      
      // CRITICAL: Force audio processing with silent output to ensure audio graph is active
      try {
        // Create a gain node with zero gain to avoid audible output
        const debugGain = ctx.createGain();
        debugGain.gain.value = 0; // No actual audio output
        
        // Connect source → debugGain → destination
        source.connect(debugGain);
        debugGain.connect(ctx.destination);
        console.log("Debug audio path connected to force audio processing");
      } catch (err) {
        console.warn("Could not create debug audio path:", err);
      }
      
      // Set up media recorder with explicit MIME type
      console.log("Creating MediaRecorder");
      let mimeType = 'audio/webm;codecs=opus';
      
      // Check browser support for various codecs
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = 'audio/webm';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      }
      
      console.log("Using MIME type:", mimeType);
      
      const recorder = new MediaRecorder(stream, { 
        mimeType: mimeType
      });
      
      recorder.ondataavailable = (event) => {
        console.log(`MediaRecorder data available, size: ${event.data.size}`);
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
          
          // Baseline calibration - use the first few chunks to establish a noise floor
          if (chunksRef.current.length <= 5) {
            if (chunksRef.current.length === 5) {
              // Calculate a more accurate baseline from initial silent chunks
              const sizes = chunksRef.current.map(chunk => chunk.size);
              const avgSize = sizes.reduce((a, b) => a + b, 0) / sizes.length;
              bufferAnalysisRef.current.baselineChunkSize = avgSize;
              console.log(`Setting baseline chunk size: ${avgSize}`);
            }
          } else {
            // Process chunk sizes for audio level detection (fallback method)
            // Use a longer rolling window for more stability
            const recentChunks = chunksRef.current.slice(-8);
            const avgSize = recentChunks.reduce((sum, chunk) => sum + chunk.size, 0) / recentChunks.length;
            
            // Calculate delta from baseline (how much louder than ambient noise)
            const baseline = bufferAnalysisRef.current.baselineChunkSize || 1800;
            const deltaFromBaseline = Math.max(0, avgSize - baseline);
            
            // Apply more aggressive noise floor (require stronger signal)
            // Maximum expected delta is around 1000 bytes for normal speech
            const maxExpectedDelta = 1000;
            
            // Calculate a normalized level between 0-1
            let normalizedLevel = Math.min(1.0, deltaFromBaseline / maxExpectedDelta);
            
            // Apply noise gate - treat very low levels as silence
            // This helps eliminate background noise
            if (normalizedLevel < 0.03) {
              normalizedLevel = 0;
            }
            
            // Only update if significant change or we're showing levels for the first time
            if (Math.abs(normalizedLevel - audioLevel) > 0.05 || chunksRef.current.length <= 6) {
              console.log(`FALLBACK: Chunk size ${avgSize}, baseline ${baseline}, delta ${deltaFromBaseline}, level ${normalizedLevel.toFixed(3)}`);
              
              // Apply a higher threshold for "silence" to ensure we don't show high levels when quiet
              const adjustedLevel = normalizedLevel < 0.05 ? 0 : normalizedLevel;
              setAudioLevel(adjustedLevel);
              
              bufferAnalysisRef.current.lastUpdateTime = Date.now();
              detectionMethodRef.current.directBufferWorking = true;
            }
          }
        }
      };
      
      recorder.onstop = async () => {
        console.log("MediaRecorder stopped, chunks collected:", chunksRef.current.length);
        
        if (chunksRef.current.length > 0 && silenceDetectedRef.current) {
          console.log("Silence detected stop complete, calling onSilenceComplete with audio blob");
          const blob = new Blob(chunksRef.current, { 
            type: mediaRecorderRef.current?.mimeType || 'audio/webm' 
          });
          
          silenceDetectedRef.current = false;
          
          try {
            await opts.onSilenceComplete(blob);
          } catch (error) {
            console.error("Error in onSilenceComplete callback:", error);
          }
        }
      };
      
      mediaRecorderRef.current = recorder;
      
      // Start recording
      recorder.start(100); // Collect data every 100ms
      console.log("MediaRecorder started");
      setIsRecording(true);
      
      // Start monitoring audio level with multiple detection methods
      const updateAudioLevel = () => {
        if (!analyserNode || !isRecording) return;
        
        // CRITICAL: Use all available methods to detect audio
        
        // 1. Time domain data (waveform)
        const timeData = new Uint8Array(analyserNode.fftSize);
        analyserNode.getByteTimeDomainData(timeData);
        
        // 2. Frequency domain data (spectrum)
        const freqData = new Uint8Array(analyserNode.frequencyBinCount);
        analyserNode.getByteFrequencyData(freqData);
        
        // Track and log raw time domain
        const timeRaw = timeData.slice(0, 5);
        console.log("Raw Time Domain (first 5):", Array.from(timeRaw));
        
        // Check if we're getting real data (not just silence/128 values)
        let hasMeaningfulData = false;
        for (let i = 0; i < 5; i++) {
          // Consider any deviation of more than 2 units from 128 as meaningful
          if (Math.abs(timeData[i] - 128) > 2) {
            hasMeaningfulData = true;
            break;
          }
        }
        
        if (!hasMeaningfulData) {
          console.log("TIME DOMAIN DATA SHOWS NO SIGNAL - Analyzer may not be receiving audio!");
          
          // After a few seconds, if analyzer is never working, use emergency fallback
          if (Date.now() - bufferAnalysisRef.current.lastUpdateTime > 3000 && 
             chunksRef.current.length > 3) {
            // No signal but chunks are coming in, so force a level based on chunk sizes
            detectionMethodRef.current.analyzerWorking = false;
            detectionMethodRef.current.directBufferWorking = true;
            
            // Calculate level based on chunk sizes and history
            const chunks = chunksRef.current.slice(-10); // Use last 10 chunks
            if (chunks.length > 0) {
              const avgSize = chunks.reduce((sum, chunk) => sum + chunk.size, 0) / chunks.length;
              
              // Use the same baseline approach as in ondataavailable handler
              const baseline = bufferAnalysisRef.current.baselineChunkSize || 1800;
              const deltaFromBaseline = Math.max(0, avgSize - baseline);
              const maxExpectedDelta = 1000;
              
              // Normalize based on delta from baseline
              const normalizedLevel = Math.min(1.0, deltaFromBaseline / maxExpectedDelta);
              
              // Apply a higher threshold for "silence"
              const adjustedLevel = normalizedLevel < 0.1 ? 0.05 : normalizedLevel;
              
              console.log(`EMERGENCY FALLBACK: Chunk size ${avgSize}, baseline ${baseline}, delta ${deltaFromBaseline}, level ${normalizedLevel.toFixed(3)}`);
              setAudioLevel(adjustedLevel);
            } else {
              setAudioLevel(0.05); // Minimum level when silent
            }
          }
          
          // Don't process further if there's no meaningful data
          animationFrameIdRef.current = requestAnimationFrame(updateAudioLevel);
          return;
        }
        
        // Calculate time domain displacement (raw waveform)
        let sumDisplacement = 0;
        for (let i = 0; i < timeData.length; i++) {
          const displacement = Math.abs(timeData[i] - 128);
          sumDisplacement += displacement;
        }
        const averageDisplacement = sumDisplacement / timeData.length;
        
        // Calculate RMS (root mean square) - proper audio level
        // First, convert to Float32Array for our utility function
        const float32Data = new Float32Array(timeData.length);
        for (let i = 0; i < timeData.length; i++) {
          // Convert from 0-255 to -1.0 to 1.0 range
          float32Data[i] = (timeData[i] - 128) / 128;
        }
        
        // Use our utility function for more accurate RMS calculation
        const rms = calculateRMS(float32Data);
        
        // Calculate frequency domain energy (spectrum)
        const freqSum = freqData.reduce((sum, val) => sum + val, 0);
        const freqAvg = freqSum / freqData.length;
        
        // Find peak for better visualization
        const freqPeak = Math.max(...Array.from(freqData));
        
        // CRITICAL: Calculate the best measure using multiple detection methods
        // This is a fallback system that chooses the strongest signal
        const timeDomainLevel = averageDisplacement / 128;
        const freqDomainLevel = freqAvg / 255;
        const rmsLevel = rms;
        
        // Log all detection methods for debugging
        console.log(`Audio detection: time=${timeDomainLevel.toFixed(3)}, freq=${freqDomainLevel.toFixed(3)}, rms=${rmsLevel.toFixed(3)}, peak=${freqPeak}`);
        
        // Use the highest detection value to ensure we don't miss speech
        let normalizedLevel = Math.max(
          timeDomainLevel * 1.5, // Amplify time domain
          freqDomainLevel * 2.0,  // Amplify frequency domain
          rmsLevel * 3.0          // Amplify RMS (most accurate for voice)
        );
        
        // CRITICAL: Ensure a minimum level and cap at 1.0
        normalizedLevel = Math.max(0.05, Math.min(1.0, normalizedLevel));
        
        // Flag analyzer as working if we get meaningful values
        if (normalizedLevel > 0.1) {
          detectionMethodRef.current.analyzerWorking = true;
          console.log(`Analyzer detection working`);
        }
        
        console.log(`Final audio level: ${normalizedLevel.toFixed(3)}`);
        setAudioLevel(normalizedLevel);
        
        animationFrameIdRef.current = requestAnimationFrame(updateAudioLevel);
      };
      
      updateAudioLevel();
      console.log("Audio level monitoring started");
      
      // Start VAD if enabled
      if (opts.enableVAD) {
        console.log("Starting Voice Activity Detection");
        startVAD();
      }
      
      // Return true to indicate success
      return true;
      
    } catch (error) {
      console.error('Error accessing microphone:', error);
      cleanupResources();
      return false;  // Return false on failure
    }
  }, [cleanupResources, opts.enableVAD, startVAD, opts.onSilenceComplete]);
  
  // Stop recording
  const stopRecording = useCallback(async () => {
    console.log("stopRecording called", mediaRecorderRef.current ? `mediaRecorder state: ${mediaRecorderRef.current.state}` : "no mediaRecorder");
    
    // Stop VAD
    if (isVADActive) {
      stopVAD();
    }
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      console.log("Stopping active MediaRecorder");
      
      try {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
        
        // Cancel animation frame
        if (animationFrameIdRef.current) {
          console.log("Canceling animation frame:", animationFrameIdRef.current);
          cancelAnimationFrame(animationFrameIdRef.current);
          animationFrameIdRef.current = null;
        }
        
        // Wait for cleanup to complete
        await cleanupResources();
        
      } catch (error) {
        console.error("Error stopping MediaRecorder:", error);
        await cleanupResources();
      }
    } else {
      console.log("MediaRecorder not active or null, can't stop");
      setIsRecording(false);
      await cleanupResources();
    }
  }, [cleanupResources, isVADActive, stopVAD]);
  
  // Get the recorded audio as a blob
  const getAudioBlob = useCallback(async (): Promise<Blob | null> => {
    console.log("getAudioBlob called, chunks:", chunksRef.current.length);
    
    try {
      if (chunksRef.current.length === 0) {
        console.warn("No audio chunks recorded");
        return null;
      }
      
      const totalSize = chunksRef.current.reduce((total, chunk) => total + chunk.size, 0);
      console.log("Creating audio blob from chunks, total size:", totalSize, "bytes");
      
      // Create blob with the detected MIME type
      let mimeType = 'audio/webm';
      if (mediaRecorderRef.current) {
        mimeType = mediaRecorderRef.current.mimeType || mimeType;
      }
      
      const audioBlob = new Blob(chunksRef.current, { type: mimeType });
      console.log("Audio blob created, size:", audioBlob.size, "bytes, type:", audioBlob.type);
      
      // Now clean up remaining resources
      cleanupResources();
      
      return audioBlob;
    } catch (error) {
      console.error("Error creating audio blob:", error);
      cleanupResources();
      return null;
    }
  }, [cleanupResources]);
  
  return {
    isRecording,
    audioLevel,
    startRecording,
    stopRecording,
    getAudioBlob,
    isVADActive
  };
} 