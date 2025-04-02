import React, { useEffect, useRef } from 'react';

interface WaveformVisualizerProps {
  audioLevel: number;
  isActive: boolean;
  color?: string;
  height?: number;
  width?: number;
}

const WaveformVisualizer: React.FC<WaveformVisualizerProps> = ({
  audioLevel,
  isActive,
  color = '#4F46E5',
  height = 100,
  width = 300,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameId = useRef<number | null>(null);
  const dataPoints = useRef<number[]>([]);
  
  // Update the waveform
  const updateWaveform = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Add new data point
    dataPoints.current.push(audioLevel);
    
    // Keep only the last 50 data points
    if (dataPoints.current.length > 50) {
      dataPoints.current.shift();
    }
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Set up drawing style
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    
    // Draw waveform
    ctx.beginPath();
    
    const step = width / (dataPoints.current.length - 1);
    const middle = height / 2;
    
    dataPoints.current.forEach((point, index) => {
      const x = index * step;
      const y = middle + (point * middle);
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.stroke();
    
    // Continue animation if active
    if (isActive) {
      animationFrameId.current = requestAnimationFrame(updateWaveform);
    }
  };
  
  // Start/stop animation based on isActive
  useEffect(() => {
    if (isActive) {
      animationFrameId.current = requestAnimationFrame(updateWaveform);
    } else {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
      }
    }
    
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isActive]);
  
  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="border border-gray-200 rounded-md"
    />
  );
};

export default WaveformVisualizer; 