import React from 'react';
import UploadPanel from '../components/UploadPanel';
import StatsCard from '../components/StatsCard';
import GroundingRulesCard from '../components/GroundingRulesCard';
import ChatPanel from '../components/ChatPanel';

export default function StudentTutor({ chunkCount, onUploadSuccess, onCitationClick }) {
  return (
    <main className="dashboard-grid">
      {/* Left Column: Control and Document Management */}
      <section className="control-panel">
        <UploadPanel onUploadSuccess={onUploadSuccess} />
        <StatsCard chunkCount={chunkCount} />
        <GroundingRulesCard />
      </section>

      {/* Right Column: Grounded Chat Workspace */}
      <ChatPanel chunkCount={chunkCount} onCitationClick={onCitationClick} />
    </main>
  );
}
