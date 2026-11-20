import React, { useEffect, useState } from 'react';
import UploadPanel from '../components/UploadPanel';
import StatsCard from '../components/StatsCard';
import ChatPanel from '../components/ChatPanel';
import { uploadCourseDocument, sendCourseChatMessage } from '../services/api';

export default function StudentTutor({
  courses = [],
  activeCourse = null,
  isEducator = false,
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
      <div className="empty-courses-state glass-card clean-empty">
        <div className="empty-svg-badge" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <h3>{isEducator ? 'Create a course first' : 'Join a course to unlock Tutor AI'}</h3>
        <p className="clean-empty-sub">
          {isEducator ? 'Course sources keep citations isolated.' : 'Use your professor invite code.'}
        </p>
        {onNavigateCourses && (
          <button
            type="button"
            className="button button-primary"
            onClick={onNavigateCourses}
          >
            {isEducator ? 'Open Courses →' : 'Browse Courses →'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="tutor-view-wrapper clean-tutor">
      <div className="tutor-course-bar glass-card compact-tutor-bar">
        <div className="tutor-bar-copy">
          <span className="eyebrow">COURSE-GROUNDED TUTOR</span>
          <h2>{selectedCourse ? selectedCourse.title : 'Select Course'}</h2>
        </div>

        <div className="course-filter-selector">
          <label htmlFor="tutor-course-select">Course</label>
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
                {c.title} · {c.document_count || 0} PDFs
              </option>
            ))}
          </select>
        </div>
      </div>

      {isEducator ? (
        <section className="tutor-educator-grid">
          <aside className="tutor-source-rail">
            <UploadPanel
              onUploadSuccess={onUploadSuccess}
              customUploader={(file, onProgress) =>
                uploadCourseDocument(selectedCourseId, file, onProgress)
              }
            />
            <StatsCard chunkCount={chunkCount} />
          </aside>

          <ChatPanel
            key={selectedCourseId}
            chunkCount={(selectedCourse?.document_count || 0) > 0 ? Math.max(chunkCount, 1) : 0}
            onCitationClick={onCitationClick}
            customChatSender={(queryText) => sendCourseChatMessage(selectedCourseId, queryText)}
            courseContext={selectedCourse}
          />
        </section>
      ) : (
        <section className="tutor-student-shell">
          <ChatPanel
            key={selectedCourseId}
            chunkCount={(selectedCourse?.document_count || 0) > 0 ? Math.max(chunkCount, 1) : 0}
            onCitationClick={onCitationClick}
            customChatSender={(queryText) => sendCourseChatMessage(selectedCourseId, queryText)}
            courseContext={selectedCourse}
          />
        </section>
      )}
    </div>
  );
}
