import React from 'react';

function SparkBars() {
  const bars = [32, 54, 40, 78, 64, 92, 74, 98, 80, 100, 84, 90];
  return (
    <div className="signal-bars live-pulse" aria-hidden="true">
      {bars.map((height, index) => (
        <span
          key={index}
          style={{
            height: `${height}%`,
            '--bar-delay': `${(index * 0.07).toFixed(2)}s`,
          }}
        />
      ))}
    </div>
  );
}

export default function DashboardOverview({
  courses,
  chunkCount,
  currentUser,
  onNavigate,
  onOpenCourse,
  onOpenStudio,
}) {
  const lectureCount = courses.reduce((sum, c) => sum + (c.lecture_count || 0), 0);
  const documentCount = courses.reduce((sum, c) => sum + (c.document_count || 0), 0);
  const featuredCourse = courses[0];
  const displayName = currentUser?.full_name || currentUser?.email?.split('@')[0] || 'Educator';

  return (
    <div className="command-center clean-studio">
      {/* Editorial Header */}
      <header className="command-header compact-header glass-card">
        <div>
          <div className="studio-beacon-row">
            <span className="live-status-dot" aria-hidden="true" />
            <span className="eyebrow">EDUCATOR STUDIO COMMAND CENTER</span>
          </div>
          <h1 className="studio-heading">
            Welcome back, <span>{displayName}</span>
          </h1>
          <p className="command-header-lead">
            Orchestrate cited course materials, synthesize voice-narrated video decks, and audit student assessments.
          </p>
        </div>
        <div className="command-header-actions">
          <button className="button button-secondary" onClick={() => onNavigate('documents')}>
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ width: 16, height: 16, marginRight: 6 }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5-5 5 5M12 5v12" />
            </svg>
            Upload Syllabus PDF
          </button>
          <button className="button button-primary" onClick={() => onNavigate('courses')}>
            + New Course Workspace
          </button>
        </div>
      </header>

      {/* Flagship KPI Strip */}
      <section className="kpi-strip" aria-label="Studio telemetry">
        <article className="kpi-tile glass-card">
          <div className="kpi-icon indigo">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <div>
            <span>COURSES</span>
            <b>{courses.length}</b>
            <small>Active teaching spaces</small>
          </div>
        </article>

        <article className="kpi-tile glass-card">
          <div className="kpi-icon blue">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <span>SOURCE PDFS</span>
            <b>{documentCount}</b>
            <small>{chunkCount} cited passages</small>
          </div>
        </article>

        <article className="kpi-tile glass-card">
          <div className="kpi-icon violet">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
            </svg>
          </div>
          <div>
            <span>SYNTHESIZED DECKS</span>
            <b>{lectureCount}</b>
            <small>With AI professor voice</small>
          </div>
        </article>

        <article className="kpi-tile glass-card live-tile">
          <div className="kpi-icon emerald">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <span>CITATION ENGINE</span>
            <b className="live-word"><i />100% Grounded</b>
            <small>Strict RAG Grounding</small>
          </div>
        </article>
      </section>

      {/* Main Grid: Active Workspaces & Studio Launchpad */}
      <section className="command-main-grid">
        <div className="course-command-card glass-card">
          <div className="command-card-heading">
            <div>
              <span className="eyebrow">STUDIO WORKSPACES</span>
              <h2>Your Active Courses ({courses.length})</h2>
            </div>
            <button className="text-action" onClick={() => onNavigate('courses')}>
              View all directory →
            </button>
          </div>

          {courses.length === 0 ? (
            <div className="command-empty-course">
              <div className="empty-orbit"><span>+</span></div>
              <div>
                <h3>No courses configured</h3>
                <p>Create your first course workspace and upload a syllabus or textbook PDF.</p>
              </div>
              <button className="button button-primary" onClick={() => onNavigate('courses')}>
                Create Course Workspace
              </button>
            </div>
          ) : (
            <div className="course-command-list">
              {courses.slice(0, 4).map((course, index) => (
                <button
                  className={`command-course ${index === 0 ? 'featured' : ''}`}
                  key={course.id}
                  onClick={() => onOpenCourse(course)}
                >
                  <span className="command-course-mark">{course.title.slice(0, 1).toUpperCase()}</span>
                  <span className="command-course-info">
                    <b>{course.title}</b>
                    <small>
                      {course.document_count || 0} PDFs · {course.lecture_count || 0} decks ·{' '}
                      {course.quiz_count || 0} quizzes
                    </small>
                  </span>
                  <span className={`command-course-state ${course.document_count ? 'ready' : ''}`}>
                    {course.document_count ? 'Vault Active' : 'Needs PDF'}
                  </span>
                  <i>→</i>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Studio Launchpad */}
        <aside className="next-run-card glass-card">
          <div className="next-run-glow" />
          <span className="eyebrow">QUICK PRODUCTION</span>
          <h2>Studio Launchpad</h2>
          <p>Accelerate your teaching pipeline with one-click neural synthesis.</p>
          <div className="next-run-actions">
            <button onClick={() => onOpenStudio(featuredCourse)}>
              <span className="run-icon">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
                </svg>
              </span>
              <span>
                <b>Synthesize Lecture Deck</b>
                <small>Auto-generate slides &amp; professor voice</small>
              </span>
              <i>→</i>
            </button>
            <button onClick={() => featuredCourse ? onOpenCourse(featuredCourse) : onNavigate('courses')}>
              <span className="run-icon quiz">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </span>
              <span>
                <b>Build &amp; Review Assessments</b>
                <small>Source-grounded quizzes with page citations</small>
              </span>
              <i>→</i>
            </button>
            <button onClick={() => onNavigate('documents')}>
              <span className="run-icon doc">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5-5 5 5M12 5v12" />
                </svg>
              </span>
              <span>
                <b>Ingest Syllabus Documents</b>
                <small>Chunk, embed &amp; isolate course vectors</small>
              </span>
              <i>→</i>
            </button>
          </div>
        </aside>
      </section>

      {/* Lower Row: Grounding Telemetry & Flow */}
      <section className="command-lower-grid compact-lower">
        <article className="learning-radar glass-card">
          <div className="command-card-heading">
            <div>
              <span className="eyebrow">RAG RETRIEVAL HEALTH</span>
              <h2>Grounding Signal</h2>
            </div>
            <span className="coming-soon">CROSS-COURSE ISOLATED</span>
          </div>
          <div className="radar-content">
            <div className="radar-chart">
              <SparkBars />
              <div className="radar-line" />
            </div>
            <div className="radar-copy">
              <b>{chunkCount > 0 ? `${chunkCount} verified source passages active` : 'Vault ready for PDF ingestion'}</b>
              <p>ChromaDB vector space strictly isolated per course ID with cosine distance thresholds.</p>
              <button className="text-action" onClick={() => onNavigate('student-learning')}>
                Preview student portal view →
              </button>
            </div>
          </div>
        </article>

        <article className="asset-stack glass-card">
          <div className="command-card-heading">
            <div>
              <span className="eyebrow">TEACHING PIPELINE</span>
              <h2>Studio Workflow</h2>
            </div>
          </div>
          <div className="asset-steps">
            <span className={documentCount > 0 ? 'asset-complete' : ''}>
              <i>01</i> PDF Vault ({documentCount})
            </span>
            <span className={lectureCount > 0 ? 'asset-complete' : ''}>
              <i>02</i> Slide Synthesis ({lectureCount})
            </span>
            <span className="asset-complete">
              <i>03</i> Quiz Review &amp; Edit
            </span>
            <span className="asset-complete">
              <i>04</i> Student Release Gate
            </span>
          </div>
          <p className="asset-hint">
            Materials remain in private draft mode until you click &quot;Approve &amp; Publish&quot;.
          </p>
        </article>
      </section>
    </div>
  );
}
