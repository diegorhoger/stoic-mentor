import React from 'react';

interface AppLayoutProps {
  children: React.ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  return (
    <div style={{
      width: '100%',
      maxWidth: '100%',
      backgroundColor: 'white',
      color: 'black',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-start',
      minHeight: '100%',
      padding: '0',
      margin: '0'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '500px',
        padding: '0 16px',
        backgroundColor: 'white'
      }}>
        {children}
        
        <footer style={{
          width: '100%', 
          padding: '16px 0',
          textAlign: 'center'
        }}>
          <p style={{
            color: '#a3a3a3',
            fontSize: '12px'
          }}>
            © {new Date().getFullYear()} <a href="https://mementomorilabs.com" style={{ color: '#666', textDecoration: 'none', fontWeight: 'bold' }} target="_blank" rel="noopener noreferrer">MEMENTO MORI Labs</a>
          </p>
        </footer>
      </div>
    </div>
  );
};

export default AppLayout; 