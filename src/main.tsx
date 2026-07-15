import React from 'react';
import ReactDOM from 'react-dom/client';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { InsightProvider } from '@semoss/sdk-react';
import App from './App';
import './index.css';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#36c7b0' },
    error: { main: '#f05267' },
    warning: { main: '#f0b866' },
    background: { default: '#0b1118', paper: '#111a24' },
    divider: '#2a3a4a',
  },
  typography: { fontFamily: 'Inter, system-ui, sans-serif' },
  shape: { borderRadius: 6 },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <InsightProvider>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <App />
      </ThemeProvider>
    </InsightProvider>
  </React.StrictMode>,
);
