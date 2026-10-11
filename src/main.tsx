import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/outfit';
import '@fontsource-variable/jetbrains-mono';
import App from './App.tsx';
import {ErrorBoundary} from './components/ErrorBoundary.tsx';
import {initLogger} from './lib/logger.ts';
import './index.css';

initLogger();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
