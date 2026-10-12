import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import './index.css';
import App from './App';

const PUBLISHABLE_KEY = import.meta.env.REACT_APP_CLERK_PUBLISHABLE_KEY;
if (!PUBLISHABLE_KEY) {
  throw new Error("Missing REACT_APP_CLERK_PUBLISHABLE_KEY in .env.local");
}

// When running as an installed PWA (home-screen icon, standalone display),
// suppress iOS pinch-to-zoom and double-tap-to-zoom so the app feels native.
// We don't do this in regular Safari tabs — pinch-zoom is expected web behavior
// there, and Safari can ignore it anyway as an accessibility measure.
const isStandalonePWA =
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true);

if (isStandalonePWA) {
  const preventGesture = (e: Event) => e.preventDefault();
  document.addEventListener("gesturestart", preventGesture);
  document.addEventListener("gesturechange", preventGesture);
  document.addEventListener("gestureend", preventGesture);
}

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      appearance={{ baseTheme: undefined }}
    >
      <App />
    </ClerkProvider>
  </React.StrictMode>
);
