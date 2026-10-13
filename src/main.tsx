import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { config } from 'zod';
import { App } from './app/App';
import '@fontsource-variable/geist/wght.css';
import '@fontsource-variable/geist-mono/wght.css';
import './styles/app.css';
// Sem geração de código em tempo de execução (compatível com a CSP).
config({ jitless: true });
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
