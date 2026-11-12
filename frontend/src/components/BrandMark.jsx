import React from 'react';

export default function BrandMark({ size = 'md', sublabel = null }) {
  const iconDim = size === 'sm' ? 28 : size === 'lg' ? 38 : 34;

  return (
    <div className={`brand-lockup brand-lockup-${size}`}>
      <div
        className="brand-emblem"
        style={{ width: iconDim, height: iconDim }}
        aria-hidden="true"
      >
        <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M7 9.5C7 8.11929 8.11929 7 9.5 7H15.5V24.5H9.5C8.11929 24.5 7 23.3807 7 22V9.5Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M16.5 7H22.5C23.8807 7 25 8.11929 25 9.5V22C25 23.3807 23.8807 24.5 22.5 24.5H16.5V7Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M16 4L17.6 8.4L22 10L17.6 11.6L16 16L14.4 11.6L10 10L14.4 8.4L16 4Z"
            fill="currentColor"
            opacity="0.92"
          />
        </svg>
      </div>
      <div className="brand-text-group">
        <span className="brand-wordmark">
          EduForge<em>AI</em>
        </span>
        {sublabel && <span className="brand-sublabel">{sublabel}</span>}
      </div>
    </div>
  );
}
