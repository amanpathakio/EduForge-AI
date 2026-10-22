import React from 'react';

function SparkBars() {
  return <div className="signal-bars" aria-hidden="true">
    {[31, 54, 42, 71, 58, 83, 67, 92, 78, 96, 86, 100].map((height, index) => <span key={index} style={{ height: `${height}%` }} />)}
  </div>;
}

export default function DashboardOverview({ courses, chunkCount, onNavigate, onOpenCourse, onOpenStudio }) {
  const lectureCount = courses.reduce((sum, course) => sum + (course.lecture_count || 0), 0);
  const documentCount = courses.reduce((sum, course) => sum + (course.document_count || 0), 0);
  const featuredCourse = courses[0];

  return (
    <div className="command-center">
      <header className="command-header">
        <div>
          <span className="eyebrow">TEACHING COMMAND CENTER</span>
          <h1>Make the next learning moment count.</h1>
          <p>Your courses, teaching assets, and learner signals—organized around what to create next.</p>
        </div>
        <div className="command-header-actions">
          <button className="button button-secondary" onClick={() => onNavigate('documents')}>Add material</button>
          <button className="button button-primary" onClick={() => onNavigate('courses')}>Create course <span>→</span></button>
        </div>
      </header>

      <section className="command-metrics" aria-label="Workspace metrics">
        <article><span>COURSES</span><b>{courses.length}</b><small>{courses.length === 1 ? 'workspace' : 'workspaces'} ready</small></article>
        <article><span>SOURCE LIBRARY</span><b>{documentCount}</b><small>{chunkCount} indexed evidence blocks</small></article>
        <article><span>LECTURE DRAFTS</span><b>{lectureCount}</b><small>ready to refine</small></article>
        <article className="metric-live"><span>AI STATUS</span><b><i />Ready</b><small>grounded generation online</small></article>
      </section>

      <section className="command-main-grid">
        <div className="course-command-card glass-card">
          <div className="command-card-heading">
            <div><span className="eyebrow">COURSE WORKSPACE</span><h2>Pick up where teaching left off</h2></div>
            <button className="text-action" onClick={() => onNavigate('courses')}>View all courses →</button>
          </div>
          {courses.length === 0 ? (
            <div className="command-empty-course">
              <div className="empty-orbit"><span>+</span></div>
              <div><h3>Start with one source of truth</h3><p>Create a course, add material, then generate assets from evidence instead of a blank page.</p></div>
              <button className="button button-primary" onClick={() => onNavigate('courses')}>Create your first course</button>
            </div>
          ) : (
            <div className="course-command-list">
              {courses.slice(0, 4).map((course, index) => <button className={`command-course ${index === 0 ? 'featured' : ''}`} key={course.id} onClick={() => onOpenCourse(course)}>
                <span className="command-course-mark">{course.title.slice(0, 1).toUpperCase()}</span>
                <span className="command-course-info"><b>{course.title}</b><small>{course.document_count || 0} source files · {course.lecture_count || 0} lecture drafts</small></span>
                <span className="command-course-state">{course.document_count ? 'Ready' : 'Needs material'}</span>
                <i>→</i>
              </button>)}
            </div>
          )}
        </div>

        <aside className="next-run-card glass-card">
          <div className="next-run-glow" />
          <span className="eyebrow">CREATE NEXT</span>
          <h2>Run an AI teaching task</h2>
          <p>Start with the output you need. Every run stays connected to your course evidence.</p>
          <div className="next-run-actions">
            <button onClick={() => onOpenStudio(featuredCourse)}><span className="run-icon">✦</span><span><b>Draft a lecture</b><small>slides + speaker notes</small></span><i>→</i></button>
            <button onClick={() => featuredCourse ? onOpenCourse(featuredCourse) : onNavigate('courses')}><span className="run-icon quiz">?</span><span><b>Generate a quiz</b><small>source-grounded assessment</small></span><i>→</i></button>
            <button onClick={() => onNavigate('documents')}><span className="run-icon doc">↗</span><span><b>Bring in material</b><small>PDFs, readings, evidence</small></span><i>→</i></button>
          </div>
        </aside>
      </section>

      <details className="command-details">
        <summary><span>Workspace intelligence</span><small>Learning signals and asset pipeline</small><i>+</i></summary>
        <section className="command-lower-grid">
          <article className="learning-radar glass-card">
            <div className="command-card-heading">
              <div><span className="eyebrow">LEARNER INTELLIGENCE</span><h2>Learning radar</h2></div>
              <span className="coming-soon">ADAPTIVE</span>
            </div>
            <div className="radar-content">
              <div className="radar-chart"><SparkBars /><div className="radar-line" /></div>
              <div className="radar-copy"><b>Signals appear as students learn.</b><p>Quiz attempts will surface mastery, at-risk topics, and the next best study action here.</p><button className="text-action" onClick={() => onNavigate('student-learning')}>Open student space →</button></div>
            </div>
          </article>
          <article className="asset-stack glass-card">
            <div className="command-card-heading"><div><span className="eyebrow">ASSET PIPELINE</span><h2>From evidence to teaching</h2></div></div>
            <div className="asset-steps"><span className="asset-complete"><i>✓</i> Source material</span><span><i>02</i> Lecture drafts</span><span><i>03</i> Assessments</span><span><i>04</i> Learning signals</span></div>
            <p>Everything starts with your material, then becomes a reviewable teaching asset.</p>
          </article>
        </section>
      </details>
    </div>
  );
}
