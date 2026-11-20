import React from 'react';

/**
 * EduForge AI — Editorial Architectural Backdrop
 * Human-first, distraction-free matte canvas with ultra-subtle hairline grid
 * and soft ambient vignette. Zero CPU/GPU overhead, zero AI particle gimmicks.
 */
export default function NeuralBackdrop({ theme = 'dark' }) {
  return (
    <div className="editorial-backdrop" aria-hidden="true">
      <div className="editorial-grid" />
      <div className="editorial-vignette" />
    </div>
  );
}
