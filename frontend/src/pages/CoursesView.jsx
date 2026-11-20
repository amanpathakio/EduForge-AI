import React, { useState } from 'react';

export default function CoursesView({
  courses,
  onOpenCourse,
  onCreateCourse,
  onDeleteCourse,
  onJoinCourse,
  isEducator = false,
  isLoading,
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [courseToDelete, setCourseToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleJoinSubmit = async (e) => {
    e.preventDefault();
    if (!inviteCode.trim() || !onJoinCourse) return;
    try {
      setIsJoining(true);
      setJoinError('');
      await onJoinCourse(inviteCode.trim());
      setInviteCode('');
      setIsJoinModalOpen(false);
    } catch (err) {
      setJoinError(err.message || 'Could not join course with this code.');
    } finally {
      setIsJoining(false);
    }
  };

  const confirmDelete = async () => {
    if (!courseToDelete) return;
    try {
      setIsDeleting(true);
      setDeleteError('');
      await onDeleteCourse(courseToDelete.id);
      setCourseToDelete(null);
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete course');
    } finally {
      setIsDeleting(false);
    }
  };

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
          <h1 className="view-title">{isEducator ? 'Courses' : 'My Courses'}</h1>
          <p className="view-subtitle">
            {isEducator
              ? 'Materials, student invites, and lectures.'
              : 'Enrolled courses, decks, and practice.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
          {onJoinCourse && (
            <button
              className={`button ${isEducator ? 'button-secondary' : 'button-primary'}`}
              onClick={() => {
                setJoinError('');
                setIsJoinModalOpen(true);
              }}
            >
              Join via Invite Code
            </button>
          )}
          {isEducator && (
            <button
              className="button button-primary"
              onClick={() => setIsModalOpen(true)}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ width: 18, height: 18, marginRight: 6 }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              Create Course
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="courses-loading">
          <div className="spinner" />
          <p>Loading your courses...</p>
        </div>
      ) : courses.length === 0 ? (
        <div className="empty-courses-state glass-card clean-empty">
          <div className="empty-svg-badge" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
              <path d="M6 12v5c3 3 9 3 12 0v-5" />
            </svg>
          </div>
          <h3>{isEducator ? 'No courses yet' : 'No enrolled courses'}</h3>
          <p className="clean-empty-sub">
            {isEducator
              ? 'Create your first workspace.'
              : 'Join with an EF-XXXXXX invite code.'}
          </p>
          {isEducator ? (
            <button
              className="button button-primary"
              onClick={() => setIsModalOpen(true)}
            >
              Create Course
            </button>
          ) : (
            <button
              className="button button-primary"
              onClick={() => setIsJoinModalOpen(true)}
            >
              Join with Code
            </button>
          )}
        </div>
      ) : (
        <div className="courses-grid">
          {courses.map((course) => {
            const canManage = isEducator || course.my_role === 'professor';
            return (
              <div key={course.id} className="course-card glass-card">
                <div className="course-card-body">
                  <div className="course-card-top">
                    <span className="badge course-badge">{canManage ? 'Educator' : 'Enrolled'}</span>
                    {canManage && (
                      <button
                        className="course-del-btn"
                        title="Delete course"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteError('');
                          setCourseToDelete(course);
                        }}
                      >
                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <h3 className="course-title">{course.title}</h3>
                  <p className="course-desc">
                    {course.description || 'No description provided.'}
                  </p>
                </div>

                <div className="course-card-footer">
                  <div className="course-stats-meta">
                    <span className="meta-pill">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14 2v6h6" />
                      </svg>
                      {course.document_count || 0} PDFs
                    </span>
                    <span className="meta-pill">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 10v2a7 7 0 01-14 0v-2" />
                      </svg>
                      {course.lecture_count || 0} decks
                    </span>
                  </div>
                  <button
                    className="button button-secondary open-course-btn"
                    onClick={() => onOpenCourse(course)}
                  >
                    {canManage ? 'Workspace →' : 'Open →'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Join Course Modal */}
      {isJoinModalOpen && (
        <div className="modal-overlay" onClick={() => !isJoining && setIsJoinModalOpen(false)}>
          <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-header">
              <h3>Join Course with Invite Code</h3>
              <button
                type="button"
                className="icon-button close-btn"
                onClick={() => !isJoining && setIsJoinModalOpen(false)}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleJoinSubmit} className="modal-form">
              {joinError && <div className="error-banner">{joinError}</div>}
              <div className="form-group">
                <label htmlFor="course-invite-code">Invite Code *</label>
                <input
                  id="course-invite-code"
                  type="text"
                  placeholder="e.g. EF-8K2M9Q"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  required
                  autoFocus
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setIsJoinModalOpen(false)}
                  disabled={isJoining}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={isJoining || !inviteCode.trim()}
                >
                  {isJoining ? 'Joining...' : 'Join Course →'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {courseToDelete && (
        <div className="modal-overlay" onClick={() => !isDeleting && setCourseToDelete(null)}>
          <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="delete-course-heading">
            <div className="modal-header">
              <h3 id="delete-course-heading">Delete Course</h3>
              <button
                type="button"
                className="icon-button close-btn"
                onClick={() => !isDeleting && setCourseToDelete(null)}
                aria-label="Close modal"
              >
                ×
              </button>
            </div>
            {deleteError && <div className="error-banner">{deleteError}</div>}
            <p className="confirm-modal-copy">
              Are you sure you want to delete <strong>{courseToDelete.title}</strong>? All uploaded course materials, lectures, and assessments in this workspace will be removed.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setCourseToDelete(null)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button button-danger"
                onClick={confirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting…' : 'Delete Course'}
              </button>
            </div>
          </div>
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
