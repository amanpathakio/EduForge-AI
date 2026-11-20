import React, { useState } from 'react';
import StudentQuizPlayer from '../components/StudentQuizPlayer';

export default function StudentLearningView({
  courses,
  currentUser,
  onOpenCourse,
  onOpenTutor,
  onJoinCourse,
}) {
  const [practiceCourse, setPracticeCourse] = useState(null);
  const [inviteCode, setInviteCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinMsg, setJoinMsg] = useState('');
  const [joinErr, setJoinErr] = useState('');

  const displayName = currentUser?.full_name || currentUser?.email?.split('@')[0] || 'Learner';

  const submitJoin = async (e) => {
    e.preventDefault();
    if (!inviteCode.trim() || !onJoinCourse) return;
    try {
      setJoining(true);
      setJoinErr('');
      setJoinMsg('');
      const joined = await onJoinCourse(inviteCode.trim());
      setInviteCode('');
      setJoinMsg(`Successfully enrolled in "${joined.title}". You now have access to published lectures.`);
    } catch (err) {
      setJoinErr(err.message || 'Invalid or inactive invite code.');
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="student-space clean-student">
      {/* Sleek Top Learning Banner */}
      <header className="student-top-bar glass-card">
        <div>
          <div className="studio-beacon-row">
            <span className="live-status-dot emerald" aria-hidden="true" />
            <span className="eyebrow">STUDENT LEARNING SPACE</span>
          </div>
          <h1 className="student-heading">
            Welcome, <em className="auth-title-italic">{displayName}</em>
          </h1>
          <p className="student-header-lead">
            Your personalized academic space for neural video lectures, syllabus-grounded Q&amp;A, and practice assessments.
          </p>
        </div>
        <div className="student-top-actions">
          {onJoinCourse && (
            <form onSubmit={submitJoin} className="join-inline-form">
              <input
                type="text"
                placeholder="Code (e.g. EF-XXXXXX)"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                aria-label="Course invite code"
              />
              <button
                type="submit"
                className="button button-secondary"
                disabled={joining || !inviteCode.trim()}
              >
                {joining ? 'Enrolling…' : 'Join Course'}
              </button>
            </form>
          )}
          <button className="button button-primary" onClick={onOpenTutor}>
            Ask AI Tutor →
          </button>
        </div>
      </header>

      {(joinErr || joinMsg) && (
        <div className={`auth-alert ${joinErr ? 'auth-alert-error' : 'auth-alert-success'}`}>
          <span>{joinErr ? '⚠' : '✓'}</span>
          <p>{joinErr || joinMsg}</p>
        </div>
      )}

      {/* Flagship Visual Learning Workflow Pills */}
      <div className="student-pill-strip" aria-label="Study workflow">
        <div className="workflow-pill glass-card">
          <span className="wp-num">01</span>
          <div>
            <b>Neural Video Lectures</b>
            <small>Professor voice, synced slides &amp; scene cards</small>
          </div>
        </div>
        <div className="workflow-pill glass-card">
          <span className="wp-num teal">02</span>
          <div>
            <b>100% Grounded AI Tutor</b>
            <small>Answers with exact textbook page citations</small>
          </div>
        </div>
        <div className="workflow-pill glass-card">
          <span className="wp-num indigo">03</span>
          <div>
            <b>Mastery Practice Arena</b>
            <small>Source-grounded quizzes with instant feedback</small>
          </div>
        </div>
      </div>

      {/* Enrolled Courses Grid */}
      <section className="student-courses glass-card">
        <div className="command-card-heading">
          <div>
            <span className="eyebrow">ENROLLED WORKSPACES</span>
            <h2>Your Courses ({courses.length})</h2>
          </div>
        </div>

        {courses.length === 0 ? (
          <div className="student-empty clean-empty">
            <div className="empty-orbit"><span>⌘</span></div>
            <div>
              <h3>No courses enrolled yet</h3>
              <p>Paste the invite code provided by your professor in the top bar to unlock lectures and practice assessments.</p>
            </div>
          </div>
        ) : (
          <div className="student-courses-grid-modern">
            {courses.map((course) => {
              const pubCount = course.published_lecture_count ?? course.lecture_count ?? 0;
              return (
                <article key={course.id} className="modern-course-tile glass-card">
                  <div className="modern-course-head">
                    <span className="student-course-icon">
                      {course.title.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="modern-course-meta">
                      <h3>{course.title}</h3>
                      <span>
                        {course.document_count || 0} cited sources · {pubCount} published deck{pubCount === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>
                  <div className="modern-course-actions">
                    {onOpenCourse && (
                      <button
                        type="button"
                        className="button button-primary button-sm"
                        onClick={() => onOpenCourse(course)}
                      >
                        Launch Course Studio →
                      </button>
                    )}
                    <button
                      type="button"
                      className="button button-secondary button-sm"
                      onClick={() => setPracticeCourse(course)}
                    >
                      Practice Quiz
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Inline Quiz Player if triggered */}
      {practiceCourse && (
        <section className="student-practice-wrapper glass-card">
          <div className="practice-head">
            <div>
              <span className="eyebrow">PRACTICE ARENA</span>
              <h2>{practiceCourse.title} Assessment</h2>
            </div>
            <button
              type="button"
              className="text-action"
              onClick={() => setPracticeCourse(null)}
            >
              Close Assessment ✕
            </button>
          </div>
          <StudentQuizPlayer course={practiceCourse} />
        </section>
      )}
    </div>
  );
}
