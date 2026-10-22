import React, { useState } from 'react';

export default function CoursesView({ courses, onOpenCourse, onCreateCourse, onDeleteCourse, isLoading }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    try {
      setIsSubmitting(true);
      setErrorMsg('');
      await onCreateCourse({ title: title.trim(), description: description.trim() });
      setTitle('');
      setDescription('');
      setIsModalOpen(false);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to create course');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="courses-view-container">
      <div className="view-header">
        <div>
          <h1 className="view-title">Courses</h1>
          <p className="view-subtitle">
            Manage your academic courses, uploaded materials, and AI-generated lectures.
          </p>
        </div>
        <button
          className="button button-primary"
          onClick={() => setIsModalOpen(true)}
        >
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ width: 18, height: 18, marginRight: 6 }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          Create Course
        </button>
      </div>

      {isLoading ? (
        <div className="courses-loading">
          <div className="spinner" />
          <p>Loading your courses...</p>
        </div>
      ) : courses.length === 0 ? (
        <div className="empty-courses-state glass-card">
          <div className="empty-icon">🎓</div>
          <h3>No Courses Found</h3>
          <p>Create your first course to upload lecture PDFs, ask grounded questions, and generate lectures in Lecture Studio.</p>
          <button
            className="button button-primary"
            onClick={() => setIsModalOpen(true)}
            style={{ marginTop: '1rem' }}
          >
            Create Course Now
          </button>
        </div>
      ) : (
        <div className="courses-grid">
          {courses.map((course) => (
            <div key={course.id} className="course-card glass-card">
              <div className="course-card-body">
                <div className="course-card-top">
                  <span className="badge course-badge">Course</span>
                  <button
                    className="course-del-btn"
                    title="Delete course"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`Are you sure you want to delete course "${course.title}" and its materials?`)) {
                        onDeleteCourse(course.id);
                      }
                    }}
                  >
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
                <h3 className="course-title">{course.title}</h3>
                <p className="course-desc">
                  {course.description || 'No description provided.'}
                </p>
              </div>

              <div className="course-card-footer">
                <div className="course-stats-meta">
                  <span className="meta-pill">
                    📄 {course.document_count || 0} doc{(course.document_count === 1) ? '' : 's'}
                  </span>
                  <span className="meta-pill">
                    🎙️ {course.lecture_count || 0} lecture{(course.lecture_count === 1) ? '' : 's'}
                  </span>
                </div>
                <button
                  className="button button-secondary open-course-btn"
                  onClick={() => onOpenCourse(course)}
                >
                  Open Workspace →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Course Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create New Course</h3>
              <button
                className="icon-button close-btn"
                onClick={() => setIsModalOpen(false)}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleSubmit} className="modal-form">
              {errorMsg && <div className="error-banner">{errorMsg}</div>}
              <div className="form-group">
                <label htmlFor="course-title">Course Title *</label>
                <input
                  id="course-title"
                  type="text"
                  placeholder="e.g. Operating Systems CS301"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label htmlFor="course-desc">Description (Optional)</label>
                <textarea
                  id="course-desc"
                  rows="3"
                  placeholder="e.g. Core concepts: CPU scheduling, concurrency, virtual memory, file systems."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={isSubmitting || !title.trim()}
                >
                  {isSubmitting ? 'Creating...' : 'Create Course'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
