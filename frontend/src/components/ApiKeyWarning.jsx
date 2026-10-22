import React from 'react';

export default function ApiKeyWarning({ isConfigured }) {
  if (isConfigured) return null;

  return (
    <div id="api-key-warning" className="api-warning-banner">
      <svg className="warning-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
      <span>
        <strong>Gemini API Key Missing:</strong> Please configure <code>GEMINI_API_KEY</code> in your <code>backend/.env</code> file to enable grounded answer generation.
      </span>
    </div>
  );
}
