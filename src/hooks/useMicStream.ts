import { useState, useEffect, useCallback, useRef } from 'react';
import { checkAudioSupport, createAudioContext } from '../utils/audioUtils';

interface UseMicStreamResult {
  isRecording: boolean;
  audioLevel: number;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  getAudioBlob: () => Promise<Blob | null>;
}

export const useMicStream = (): UseMicStreamResult => {
  // State for component re-renders
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  
  // Use refs for maintaining state between renders
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const isCleaningUpRef = useRef(false);
  
  // Clean up all resources
  const cleanupResources = useCallback(() => {
    if (isCleaningUpRef.current) return;
    isCleaningUpRef.current = true;
    console.log("Cleaning up all media resources");
    
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
        audioContextRef.current.close();
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
      } catch (error) {
        console.warn('Error stopping MediaRecorder:', error);
      }
    }
    
    // Stop all media tracks
    if (streamRef.current) {
      console.log("Stopping all media tracks");
      streamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (error) {
          console.warn('Error stopping track:', error);
        }
      });
      streamRef.current = null;
    }
    
    setIsRecording(false);
    isCleaningUpRef.current = false;
  }, []);
  
  // Clean up resources on unmount
  useEffect(() => {
    return () => {
      console.log("Component unmounting, cleaning up resources");
      cleanupResources();
    };
  }, [cleanupResources]);
  
  // Start recording
  const startRecording = useCallback(async () => {
    console.log("startRecording called");
    
    // Clean up any existing resources first
    cleanupResources();
    
    if (!checkAudioSupport()) {
      console.error("Audio API not supported in this browser");
      throw new Error('Audio API not supported in this browser');
    }
    
    try {
      // Reset audio chunks
      audioChunksRef.current = [];
      
      console.log("Requesting microphone permission...");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log("Microphone permission granted, stream tracks:", stream.getAudioTracks().length);
      
      // Save stream reference
      streamRef.current = stream;
      
      // Set up audio context and analyser
      console.log("Creating AudioContext");
      const ctx = createAudioContext();
      audioContextRef.current = ctx;
      
      const source = ctx.createMediaStreamSource(stream);
      const analyserNode = ctx.createAnalyser();
      analyserNode.fftSize = 2048;
      source.connect(analyserNode);
      
      // Set up media recorder with explicit MIME type
      console.log("Creating MediaRecorder");
      let mimeType = 'audio/webm';
      
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
        console.log("MediaRecorder data available, size:", event.data.size);
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      recorder.onstop = () => {
        console.log("MediaRecorder stopped, chunks collected:", audioChunksRef.current.length);
      };
      
      mediaRecorderRef.current = recorder;
      
      // Start recording
      recorder.start(100); // Collect data every 100ms
      console.log("MediaRecorder started");
      setIsRecording(true);
      
      // Start monitoring audio level
      const updateAudioLevel = () => {
        if (!analyserNode || !isRecording) return;
        
        const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
        analyserNode.getByteFrequencyData(dataArray);
        
        // Calculate average level
        const average = dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length;
        setAudioLevel(average / 128); // Normalize to 0-1 range
        
        animationFrameIdRef.current = requestAnimationFrame(updateAudioLevel);
      };
      
      updateAudioLevel();
      console.log("Audio level monitoring started");
      
    } catch (error) {
      console.error('Error accessing microphone:', error);
      cleanupResources();
      throw error;
    }
  }, [cleanupResources]);
  
  // Stop recording
  const stopRecording = useCallback(() => {
    console.log("stopRecording called", mediaRecorderRef.current ? `mediaRecorder state: ${mediaRecorderRef.current.state}` : "no mediaRecorder");
    
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
        
        // Leave the stream open until getAudioBlob is called
        
      } catch (error) {
        console.error("Error stopping MediaRecorder:", error);
        cleanupResources();
      }
    } else {
      console.log("MediaRecorder not active or null, can't stop");
      setIsRecording(false);
    }
  }, [cleanupResources]);
  
  // Get the recorded audio as a blob
  const getAudioBlob = useCallback(async (): Promise<Blob | null> => {
    console.log("getAudioBlob called, chunks:", audioChunksRef.current.length);
    
    try {
      if (audioChunksRef.current.length === 0) {
        console.warn("No audio chunks recorded");
        return null;
      }
      
      const totalSize = audioChunksRef.current.reduce((total, chunk) => total + chunk.size, 0);
      console.log("Creating audio blob from chunks, total size:", totalSize, "bytes");
      
      // Create blob with the detected MIME type
      let mimeType = 'audio/webm';
      if (mediaRecorderRef.current) {
        mimeType = mediaRecorderRef.current.mimeType || mimeType;
      }
      
      const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
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
  };
}; 