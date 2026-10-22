import React, { useEffect } from 'react';

export default function CitationDrawer({ isOpen, citation, onClose }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !citation) return null;

  const { chunk, sourceTitle } = citation;
  const distanceFormatted =
    chunk.distance !== undefined && chunk.distance !== null
      ? Number(chunk.distance).toFixed(4)
      : 'N/A';

  let fillPercent = 80;
  if (chunk.distance !== undefined && chunk.distance !== null) {
    fillPercent = Math.max(0, Math.min(100, Math.round((1 - Number(chunk.distance)) * 100)));
  }

  const chunkId = chunk.id || 'N/A';
  const filePath = `data/uploads/${chunk.metadata?.source_filename || ''}`;

  return (
    <div
      id="citation-drawer"
      className="citation-drawer-overlay"
      onClick={(e) => {
        if (e.target.id === 'citation-drawer') {
          onClose();
        }
      }}
    >
      <div className="drawer-content glass-card">
        <div className="drawer-header">
          <div>
            <span className="badge citation-type-badge">Source Chunk Auditor</span>
            <h3 id="drawer-source-title" className="drawer-title">
              {sourceTitle || `${chunk.metadata?.source_filename} — Page ${chunk.metadata?.page_number}`}
            </h3>
          </div>
          <button
            id="close-drawer-btn"
            className="icon-button close-btn"
            onClick={onClose}
            title="Close Drawer"
          >
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="drawer-body">
          <div className="drawer-section">
            <h4 className="section-label">Retrieved Content Chunk:</h4>
            <blockquote id="drawer-chunk-text" className="retrieved-text-block">
              {chunk.text}
            </blockquote>
          </div>

          <div className="drawer-metadata-grid">
            <div className="meta-item">
              <span className="meta-label">Similarity Margin (Distance)</span>
              <div className="distance-progress-wrapper">
                <span id="drawer-distance-val" className="meta-value">
                  {distanceFormatted}
                </span>
                <div className="distance-bar-bg">
                  <div
                    id="drawer-distance-bar"
                    className="distance-bar-fill"
                    style={{ width: `${fillPercent}%` }}
                  ></div>
                </div>
              </div>
              <span className="meta-note">Lower values indicate higher semantic similarity.</span>
            </div>

            <div className="meta-item">
              <span className="meta-label">Chunk Coordinates</span>
              <span id="drawer-chunk-id" className="meta-value-code">
                {chunkId}
              </span>
            </div>

            <div className="meta-item">
              <span className="meta-label">Source File Location</span>
              <span id="drawer-file-path" className="meta-value-path">
                {filePath}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
