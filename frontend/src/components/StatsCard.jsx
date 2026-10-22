import React from 'react';

export default function StatsCard({ chunkCount = 0 }) {
  return (
    <div className="glass-card stats-card">
      <h2 className="card-title">
        <svg className="title-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M4 7v10c0 2.21 3.58 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.58 4 8 4s8-1.79 8-4M4 7c0-2.21 3.58-4 8-4s8 1.79 8 4m0 5c0 2.21-3.58 4-8 4s-8-1.79-8-4"
          />
        </svg>
        Vector Store & RAG Stats
      </h2>

      <div className="stats-grid">
        <div className="stat-item">
          <span className="stat-label">Total Indexed Chunks</span>
          <span id="stat-chunks" className="stat-value">
            {chunkCount}
          </span>
        </div>
        <div className="stat-item">
          <span className="stat-label">DB Storage Path</span>
          <span id="stat-db-path" className="stat-value-sub">
            chroma_db
          </span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Embedding Model</span>
          <span className="stat-value-sub text-highlight">
            bge-small-en-v1.5
          </span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Retrieval Strategy</span>
          <span className="stat-value-sub">Dense Vector Similarity</span>
        </div>
      </div>
    </div>
  );
}
