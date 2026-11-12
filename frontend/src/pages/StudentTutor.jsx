import React, { useEffect, useState } from 'react';
import UploadPanel from '../components/UploadPanel';
import StatsCard from '../components/StatsCard';
import GroundingRulesCard from '../components/GroundingRulesCard';
import ChatPanel from '../components/ChatPanel';
import { uploadCourseDocument, sendCourseChatMessage } from '../services/api';

export default function StudentTutor({
  courses = [],
  activeCourse = null,
  onSelectCourse,
  chunkCount = 0,
  onUploadSuccess,
  onCitationClick,
  onNavigateCourses,
}) {
  const [selectedCourseId, setSelectedCourseId] = useState(
    activeCourse?.id || (courses.length > 0 ? courses[0].id : '')
  );

  useEffect(() => {
    if (activeCourse?.id && activeCourse.id !== selectedCourseId) {
      setSelectedCourseId(activeCourse.id);
      return;
    }
    if (!selectedCourseId && courses.length > 0) {
      setSelectedCourseId(courses[0].id);
    }
  }, [activeCourse, courses, selectedCourseId]);

  const selectedCourse = courses.find((c) => c.id === selectedCourseId) || null;

  if (courses.length === 0) {
    return (
      <div className="empty-courses-state glass-card">
        <div className="empty-icon" aria-hidden="true">📚</div>
        <h3>Create a Course to Start Asking Questions</h3>
        <p>
          EduForge isolates retrieval and citations per course so materials from one syllabus never mix with another.
        </p>
        {onNavigateCourses && (
          <button
            type="button"
            className="button button-primary"
            style={{ marginTop: '1rem' }}
            onClick={onNavigateCourses}
          >
            Go to Courses →
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="tutor-view-wrapper">
      <div className="tutor-course-bar glass-card">
        <div className="tutor-bar-copy">
          <span className="eyebrow">COURSE-SCOPED RAG TUTOR</span>
          <h2>{selectedCourse ? selectedCourse.title : 'Select a Course'}</h2>
        </div>

        <div className="course-filter-selector">
          <label htmlFor="tutor-course-select">Active Course:</label>
          <select
            id="tutor-course-select"
            value={selectedCourseId}
            onChange={(e) => {
              const nextId = e.target.value;
              setSelectedCourseId(nextId);
              if (onSelectCourse) onSelectCourse(nextId);
            }}
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} ({c.document_count || 0} docs)
              </option>
            ))}
          </select>
        </div>
      </div>

      <section className="dashboard-grid">
        {/* Left Column: Course Upload & RAG Stats */}
        <section className="control-panel">
          <UploadPanel
            onUploadSuccess={onUploadSuccess}
            customUploader={(file, onProgress) =>
              uploadCourseDocument(selectedCourseId, file, onProgress)
            }
          />
          <StatsCard chunkCount={chunkCount} />
          <GroundingRulesCard />
        </section>

        {/* Right Column: Course-Isolated Grounded Chat */}
        <ChatPanel
          key={selectedCourseId}
          chunkCount={(selectedCourse?.document_count || 0) > 0 ? Math.max(chunkCount, 1) : 0}
          onCitationClick={onCitationClick}
          customChatSender={(queryText) => sendCourseChatMessage(selectedCourseId, queryText)}
          courseContext={selectedCourse}
        />
      </section>
    </div>
  );
}
