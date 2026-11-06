import React from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { App } from './App';

const theme = createTheme({
  palette: { mode: 'light', primary: { main: '#5546d9' }, warning: { main: '#a64b00' }, background: { default: '#f7f8fc' } },
  shape: { borderRadius: 12 },
  typography: { fontFamily: 'Inter, system-ui, sans-serif' },
  components: {
    MuiButton: {
      styleOverrides: {
        contained: {
          '&.Mui-disabled': {
            // MUI fades disabled contained buttons to a low-contrast tint.
            // Keep the disabled state semantic while preserving readable text.
            backgroundColor: '#5546d9',
            color: '#fff',
          },
        },
      },
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
