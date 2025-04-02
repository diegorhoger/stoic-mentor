import React, { useEffect } from 'react';

// This component exists solely to fix Chrome DevTools device emulation background issues
const DevToolsFix: React.FC = () => {
  useEffect(() => {
    // Create a full-page background element
    const fixElement = document.createElement('div');
    fixElement.classList.add('devtools-styling-fix');
    document.body.appendChild(fixElement);

    // Also apply styles directly to body and html
    document.documentElement.style.backgroundColor = 'white';
    document.body.style.backgroundColor = 'white';
    document.body.style.position = 'absolute';
    document.body.style.top = '0';
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.bottom = '0';
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.color = 'black';

    return () => {
      // Clean up on unmount
      if (document.body.contains(fixElement)) {
        document.body.removeChild(fixElement);
      }
    };
  }, []);

  return null; // This component doesn't render anything visible
};

export default DevToolsFix; 