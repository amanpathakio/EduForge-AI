import React from 'react';

const DEFAULT_SUGGESTIONS = [
  'What is the difference between a process and a thread?',
  'Explain the process lifecycle states.',
  'What is CPU scheduling and why is it needed?',
  'Explain virtual memory and page faults.',
];

export default function StarterPrompts({ isVisible, onSelectPrompt }) {
  if (!isVisible) return null;

  return (
    <div id="suggestions-container" className="suggestions-container">
      <p className="suggestion-label">Suggested Questions:</p>
      <div id="suggestion-pills" className="suggestion-pills">
        {DEFAULT_SUGGESTIONS.map((question, index) => (
          <button
            key={index}
            className="suggestion-pill"
            type="button"
            onClick={() => onSelectPrompt(question)}
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  );
}
