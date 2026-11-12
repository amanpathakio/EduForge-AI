import React, { useState } from 'react';
import StudentQuizPlayer from '../components/StudentQuizPlayer';

export default function StudentLearningView({ courses, onOpenCourse, onOpenTutor, onJoinCourse }) {
  const [practiceCourse, setPracticeCourse] = useState(null);
  const [inviteCode, setInviteCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinMsg, setJoinMsg] = useState('');
  const [joinErr, setJoinErr] = useState('');

  const submitJoin = async (e) => {
    e.preventDefault();
    if (!inviteCode.trim() || !onJoinCourse) return;
    try {
      setJoining(true);
      setJoinErr('');
      setJoinMsg('');
      const joined = await onJoinCourse(inviteCode.trim());
      setInviteCode('');
      setJoinMsg(`Enrolled in "${joined.title}".`);
    } catch (err) {
      setJoinErr(err.message || 'Could not join course with this code.');
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="student-space">
      <section className="student-hero glass-card">
        <span className="eyebrow">STUDENT LEARNING SPACE</span>
        <h1>Study with a path, not a blank chat box.</h1>
        <p>Open a course to learn from professor-approved material, practise concepts, and use the grounded tutor when you get stuck.</p>
        <div className="student-hero-actions"><button className="button button-primary" onClick={onOpenTutor}>Ask the course tutor →</button><span>Evidence-linked explanations, not guesses.</span></div>
      </section>

      {onJoinCourse && (
        <section className="glass-card join-course-banner">
          <div>
            <span className="eyebrow">COURSE ENROLLMENT</span>
            <h3>Have an instructor invite code?</h3>
            <p>Enter a code like <code>EF-XXXXXX</code> to unlock published lectures, quizzes, and cited Q&amp;A.</p>
          </div>
          <form onSubmit={submitJoin} className="join-inline-form">
            <input
              type="text"
              placeholder="EF-XXXXXX"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              required
            />
            <button type="submit" className="button button-primary" disabled={joining || !inviteCode.trim()}>
              {joining ? 'Joining...' : 'Join Course'}
            </button>
          </form>
          {joinErr && <p className="auth-message auth-message-error">{joinErr}</p>}
          {joinMsg && <p className="auth-message auth-message-success">{joinMsg}</p>}
        </section>
      )}

      <section className="student-journey">
        <div className="student-section-heading"><div><span className="eyebrow">YOUR LEARNING LOOP</span><h2>Learn, practise, reflect</h2></div><p>Professor-approved content appears here once published.</p></div>
        <div className="student-loop-grid"><article><span>01</span><h3>Learn</h3><p>Review published lecture decks synced directly with course evidence.</p></article><article><span>02</span><h3>Practise</h3><p>Complete source-grounded quizzes and see explanations for every answer.</p></article><article><span>03</span><h3>Improve</h3><p>Ask the cited Course Tutor whenever a concept needs deeper clarification.</p></article></div>
      </section>
      <section className="student-courses glass-card">
        <div className="student-section-heading"><div><span className="eyebrow">ENROLLED COURSES</span><h2>Choose where to begin</h2></div></div>
        {courses.length === 0 ? (
          <div className="student-empty">
            <span>⌁</span>
            <div>
              <h3>No courses enrolled yet.</h3>
              <p>Use an invite code above from your professor to unlock your first course.</p>
            </div>
          </div>
        ) : (
          <div className="student-course-grid">
            {courses.map((course) => (
              <div key={course.id} className="student-course-card-wrap">
                <button className="student-course-card" onClick={() => setPracticeCourse(course)}>
                  <span className="student-course-icon">{course.title.slice(0, 1).toUpperCase()}</span>
                  <span>
                    <b>{course.title}</b>
                    <small>{course.document_count || 0} resources · {course.published_lecture_count ?? course.lecture_count ?? 0} published lectures</small>
                    <em>Open quizzes &amp; practice →</em>
                  </span>
                </button>
                {onOpenCourse && (
                  <button type="button" className="button button-secondary student-enter-btn" onClick={() => onOpenCourse(course)}>
                    Enter Course Space →
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
      {practiceCourse && <StudentQuizPlayer course={practiceCourse} />}
    </div>
  );
}
