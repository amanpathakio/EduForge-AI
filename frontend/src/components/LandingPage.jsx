import React, { useState, useEffect } from 'react';
import BrandMark from './BrandMark';
import ThemeToggle from './ThemeToggle';
import NeuralBackdrop from './NeuralBackdrop';

// Clean, bespoke monochrome SVG icons (Zero consumer emojis)
function FileTextIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function SlidesIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function ShieldCheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  );
}

function LayersIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </svg>
  );
}

const PREVIEW_CITATIONS = [
  {
    id: 'p14',
    label: 'Page 14 · §3.2',
    doc: 'CS301_OS_Principles.pdf',
    page: 14,
    distance: '0.142',
    match: '98.6%',
    quote:
      'Round Robin assigns a fixed time quantum q to each ready process in a circular FIFO queue, preventing thread starvation by preempting long-running tasks.',
  },
  {
    id: 'p15',
    label: 'Page 15 · §3.4',
    doc: 'CS301_OS_Principles.pdf',
    page: 15,
    distance: '0.185',
    match: '97.2%',
    quote:
      'If quantum q is too large, Round Robin degrades into FCFS; if too small, excessive context-switch overhead degrades total CPU efficiency.',
  },
];

const WAVE_BARS = [
  28, 56, 40, 82, 64, 94, 48, 72, 88, 54, 96, 62,
  44, 78, 90, 52, 68, 86, 42, 74, 58, 80, 46, 34,
];

const PREVIEW_SLIDES = [
  {
    number: '01',
    title: 'CPU Scheduling Objectives',
    sourceRef: 'Chapter 3 · Page 11',
    quotePreview: 'Round Robin assigns a fixed time quantum q to each ready process in a circular queue, preventing starvation.',
    bullets: [
      'Maximize CPU utilization across active and background queues.',
      'Minimize turnaround latency for batch workloads.',
      'Enforce fair CPU share allocation to prevent thread starvation.',
    ],
    speakerNotes:
      'Begin by contrasting batch workloads with interactive desktop systems. Ask students why optimizing for turnaround time can inadvertently hurt interactive response time.',
  },
  {
    number: '02',
    title: 'The Circular Ready Queue & Time Quantum',
    sourceRef: 'Chapter 3 · Page 13',
    quotePreview: 'Context switch cost sets the practical lower bound for quantum duration without degrading total CPU efficiency.',
    bullets: [
      'Dispatch head process for at most one bounded time quantum q.',
      'Preempt immediately on hardware timer interrupt and requeue at tail.',
      'Context switch cost sets the practical lower bound for quantum duration.',
    ],
    speakerNotes:
      'Highlight how timer interrupts enforce preemption without cooperation from the running process. Point out that Linux default quantums typically range from 10ms to 100ms.',
  },
];

const SAMPLE_QUESTIONS = [
  {
    prompt: 'How does Round Robin scheduling prevent thread starvation?',
    response:
      'Round Robin enforces a bounded time quantum q per dispatch cycle in a circular FIFO queue. Once a thread exceeds its allocated quantum, a hardware timer interrupt preempts it and returns it to the queue tail, guaranteeing that every runnable process receives deterministic CPU time.',
    citations: ['CS301_OS_Principles.pdf · Page 14', 'CS301_OS_Principles.pdf · Page 15'],
    latency: '142ms',
  },
  {
    prompt: 'What occurs during a Virtual Memory page fault exception?',
    response:
      'The Memory Management Unit (MMU) encounters an invalid page table descriptor and raises a page fault trap to the kernel. The operating system pauses the thread, identifies an available physical frame, retrieves the requested page from secondary storage, updates the page table mapping, and restarts the instruction.',
    citations: ['CS301_OS_Principles.pdf · Page 48', 'CS301_OS_Principles.pdf · Page 50'],
    latency: '186ms',
  },
  {
    prompt: 'What are the four necessary Coffman conditions for system deadlock?',
    response:
      'System deadlock requires the simultaneous presence of: 1) Mutual Exclusion, 2) Hold and Wait, 3) No Preemption, and 4) Circular Wait. Eliminating any one of these four conditions guarantees that deadlock cannot form.',
    citations: ['CS301_OS_Principles.pdf · Page 72'],
    latency: '115ms',
  },
];

export default function LandingPage({ theme, onToggleTheme, onOpenAuth }) {
  const [activeTab, setActiveTab] = useState('studio');
  const [activeCitationIdx, setActiveCitationIdx] = useState(0);
  const [activeSlideIdx, setActiveSlideIdx] = useState(0);
  const [showNotes, setShowNotes] = useState(true);
  const [isPlayingVoice, setIsPlayingVoice] = useState(false);

  // Typewriter streaming effect in the interactive sandbox
  const [activeQuestionIdx, setActiveQuestionIdx] = useState(0);
  const [displayedResponse, setDisplayedResponse] = useState(SAMPLE_QUESTIONS[0].response);
  const [isTyping, setIsTyping] = useState(false);

  const selectedCitation = PREVIEW_CITATIONS[activeCitationIdx];
  const selectedSlide = PREVIEW_SLIDES[activeSlideIdx];
  const selectedQuestion = SAMPLE_QUESTIONS[activeQuestionIdx];

  // Progressive scroll-driven reveal
  useEffect(() => {
    const els = document.querySelectorAll('.editorial-reveal');
    if (!els.length || typeof IntersectionObserver === 'undefined') {
      els.forEach((el) => el.classList.add('is-visible'));
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08 }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // Spatial mouse lighting coordinates
  const handlePointerMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - rect.top}px`);
  };

  // Smooth typing stream when switching questions in sandbox
  const handleSelectQuestion = (idx) => {
    if (idx === activeQuestionIdx && !isTyping) return;
    setActiveQuestionIdx(idx);
    setIsTyping(true);
    const targetText = SAMPLE_QUESTIONS[idx].response;
    setDisplayedResponse('');

    let charIdx = 0;
    const step = Math.max(1, Math.floor(targetText.length / 32));
    const timer = setInterval(() => {
      charIdx += step;
      if (charIdx >= targetText.length) {
        setDisplayedResponse(targetText);
        setIsTyping(false);
        clearInterval(timer);
      } else {
        setDisplayedResponse(targetText.slice(0, charIdx));
      }
    }, 20);
  };

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="editorial-landing" onPointerMove={handlePointerMove}>
      <NeuralBackdrop theme={theme} />

      {/* Clean, Architectural Navigation */}
      <header className="editorial-nav-wrap">
        <nav className="editorial-nav" aria-label="Main Navigation">
          <a
            href="#top"
            className="editorial-brand"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            <BrandMark size="sm" />
          </a>

          <div className="editorial-nav-links">
            <button type="button" onClick={() => scrollTo('architecture')}>
              Architecture
            </button>
            <button type="button" onClick={() => scrollTo('sandbox')}>
              Interactive Audit
            </button>
            <button type="button" onClick={() => scrollTo('workspaces')}>
              Workspaces
            </button>
          </div>

          <div className="editorial-nav-actions">
            <ThemeToggle theme={theme} onToggle={onToggleTheme} compact />
            <button
              type="button"
              className="editorial-btn-text"
              onClick={() => onOpenAuth('login')}
            >
              Sign In
            </button>
            <button
              type="button"
              className="editorial-btn-solid"
              onClick={() => onOpenAuth('signup')}
            >
              <span>Get Started</span>
              <ArrowRightIcon />
            </button>
          </div>
        </nav>
      </header>

      <main className="editorial-main">
        {/* HERO SECTION — Quiet, Confident, Human-Crafted */}
        <section className="editorial-hero">
          <div className="hero-content">
            <div className="hero-eyebrow">
              <span className="eyebrow-rule" />
              <span>ACADEMIC WORKSPACE &amp; LECTURE STUDIO</span>
            </div>

            <h1 className="hero-title">
              Turn course literature into{' '}
              <em className="hero-title-italic">verified lectures &amp; study tools.</em>
            </h1>

            <p className="hero-description">
              EduForge AI binds language models strictly to your uploaded syllabi, textbooks, and
              lecture notes. Professors author slide decks with presenter notes; students study
              with mathematically verifiable citations.
            </p>

            <div className="hero-actions">
              <button
                type="button"
                className="editorial-btn-solid large"
                onClick={() => onOpenAuth('signup')}
              >
                <span>Launch Educator Studio</span>
                <ArrowRightIcon />
              </button>
              <button
                type="button"
                className="editorial-btn-outline large"
                onClick={() => onOpenAuth('login')}
              >
                <span>Student Portal</span>
              </button>
            </div>

            <div className="hero-trust-list">
              <div className="trust-item">
                <ShieldCheckIcon />
                <span>Page-level citations</span>
              </div>
              <div className="trust-item">
                <LayersIcon />
                <span>Isolated course vector stores</span>
              </div>
              <div className="trust-item">
                <FileTextIcon />
                <span>Zero hallucination fallback</span>
              </div>
            </div>
          </div>

          {/* AUTHENTIC DESKTOP WORKSPACE VIEWPORT WITH TACTILE SPRING MOTION */}
          <div className="editorial-window-container">
            <div className="editorial-window spatial-glow">
              {/* Window Titlebar */}
              <div className="window-titlebar">
                <div className="window-controls">
                  <span className="window-dot red" />
                  <span className="window-dot yellow" />
                  <span className="window-dot green" />
                </div>
                <div className="window-breadcrumb">
                  <span>Courses</span>
                  <span className="sep">/</span>
                  <span className="active-path">CS301 Operating Systems Principles</span>
                </div>
                <div className="window-status">
                  <span className="status-indicator-dot" />
                  <span>ChromaDB Synced</span>
                </div>
              </div>

              {/* Segmented Workspace Mode Switcher with Fluid Spring Slider */}
              <div className="window-toolbar">
                <div className="segmented-control" role="tablist">
                  <div
                    className={`segmented-slider ${activeTab === 'studio' ? 'is-studio' : 'is-tutor'}`}
                    aria-hidden="true"
                  />
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'studio'}
                    className={`segment-btn ${activeTab === 'studio' ? 'active' : ''}`}
                    onClick={() => setActiveTab('studio')}
                  >
                    <SlidesIcon />
                    <span>AI Lecture Studio</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'tutor'}
                    className={`segment-btn ${activeTab === 'tutor' ? 'active' : ''}`}
                    onClick={() => setActiveTab('tutor')}
                  >
                    <FileTextIcon />
                    <span>Course Tutor &amp; Citations</span>
                  </button>
                </div>
              </div>

              {/* Window Body: Mode-Dependent Presentation */}
              {activeTab === 'studio' ? (
                <div className="window-body studio-mode">
                  {/* Slide Outline Rail & Actions */}
                  <div className="studio-subbar">
                    <div className="slide-pills-row" role="tablist">
                      {PREVIEW_SLIDES.map((slide, idx) => (
                        <button
                          key={slide.number}
                          type="button"
                          role="tab"
                          aria-selected={activeSlideIdx === idx}
                          className={`slide-pill ${activeSlideIdx === idx ? 'active' : ''}`}
                          onClick={() => setActiveSlideIdx(idx)}
                        >
                          <span className="slide-pill-num">{slide.number}</span>
                          <span className="slide-pill-title">{slide.title}</span>
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="notes-toggle-link"
                      onClick={() => setShowNotes((v) => !v)}
                    >
                      {showNotes ? 'Hide Speaker Notes' : 'Show Speaker Notes'}
                    </button>
                  </div>

                  {/* Clean Animated Slide Presentation Canvas */}
                  <div key={activeSlideIdx} className="slide-canvas slide-stage-in">
                    <div className="slide-meta-row">
                      <span className="slide-index-label">SLIDE {selectedSlide.number} OF 02</span>
                      <span className="slide-source-label">Source: {selectedSlide.sourceRef}</span>
                    </div>

                    <h2 className="slide-heading">{selectedSlide.title}</h2>

                    <ul className="slide-bullet-list">
                      {selectedSlide.bullets.map((bullet, i) => (
                        <li key={i}>{bullet}</li>
                      ))}
                    </ul>

                    {showNotes && (
                      <div className="speaker-notes-drawer">
                        <div className="speaker-notes-title">
                          <span>Presenter Speaker Notes (Grounded in Syllabus):</span>
                        </div>
                        <p className="speaker-notes-text">{selectedSlide.speakerNotes}</p>
                      </div>
                    )}
                  </div>

                  {/* Flagship Neural Voice Synthesis Visualizer (Auth-grade Kinetic Waveform) */}
                  <div className="landing-voice-card">
                    <div className="landing-voice-top">
                      <div className="voice-narrator-info">
                        <button
                          type="button"
                          className={`voice-play-trigger ${isPlayingVoice ? 'is-playing' : ''}`}
                          onClick={() => setIsPlayingVoice((v) => !v)}
                          aria-label={isPlayingVoice ? 'Pause audio lecture narration' : 'Play audio lecture narration'}
                        >
                          {isPlayingVoice ? <PauseIcon /> : <PlayIcon />}
                          <span>{isPlayingVoice ? 'Pause Narration' : 'Preview Professor Voice'}</span>
                        </button>
                        <span className="narrator-spec">Prof. Brian · Neural Academic Synthesis</span>
                      </div>
                      <div className="voice-status-pill">
                        <span className={`live-dot ${isPlayingVoice ? 'active' : ''}`} />
                        <code>{isPlayingVoice ? 'ACTIVE STREAM' : 'SYNTHESIS READY'}</code>
                      </div>
                    </div>

                    <div className={`voice-wave-bars compact ${isPlayingVoice ? 'active' : 'paused'}`} aria-hidden="true">
                      {WAVE_BARS.map((height, idx) => (
                        <span
                          key={idx}
                          style={{
                            '--bar-h': isPlayingVoice ? `${height}%` : '22%',
                            '--bar-delay': `${(idx * 0.06).toFixed(2)}s`,
                            animationPlayState: isPlayingVoice ? 'running' : 'paused',
                          }}
                        />
                      ))}
                    </div>

                    <div className="voice-caption-bar">
                      <span className="caption-tag">SLIDE {selectedSlide.number}</span>
                      <p>&ldquo;{selectedSlide.quotePreview}&rdquo;</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="window-body tutor-mode">
                  <div className="tutor-chat-stream">
                    <div className="chat-entry question">
                      <span className="entry-role">Student Query</span>
                      <p className="entry-text">
                        How does Round Robin scheduling prevent thread starvation?
                      </p>
                    </div>

                    <div className="chat-entry response">
                      <span className="entry-role">Course Tutor</span>
                      <p className="entry-text">
                        Round Robin assigns a bounded <strong>time quantum (q)</strong> to each
                        runnable process in a circular FIFO queue. Once the timer expires, the thread
                        is preempted and returned to the queue tail, ensuring that every runnable task
                        receives deterministic CPU time.
                      </p>

                      <div className="citations-tray">
                        <span className="tray-label">Cited Documents:</span>
                        <div className="tray-pills">
                          {PREVIEW_CITATIONS.map((cit, idx) => (
                            <button
                              key={cit.id}
                              type="button"
                              className={`citation-token ${activeCitationIdx === idx ? 'active' : ''}`}
                              onClick={() => setActiveCitationIdx(idx)}
                            >
                              <span>{cit.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Exact Vector Citation Inspector */}
                    <div key={activeCitationIdx} className="citation-inspector-card citation-reveal">
                      <div className="inspector-head">
                        <div className="inspector-source">
                          <FileTextIcon />
                          <span>{selectedCitation.doc} · Page {selectedCitation.page}</span>
                        </div>
                        <div className="inspector-stats">
                          <span className="stat-tag">Vector Distance: {selectedCitation.distance}</span>
                          <span className="stat-tag match">Confidence: {selectedCitation.match}</span>
                        </div>
                      </div>
                      <blockquote className="inspector-excerpt">
                        "{selectedCitation.quote}"
                      </blockquote>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ARCHITECTURAL SPECIFICATION */}
        <section id="architecture" className="editorial-section editorial-reveal">
          <div className="section-intro">
            <span className="section-label">SYSTEM ARCHITECTURE</span>
            <h2 className="section-heading">Engineered for Academic Integrity</h2>
            <p className="section-subtext">
              Generic chatbots guess. NotebookLM is locked into a personal consumer notebook.
              EduForge AI is a structured, course-isolated teaching platform built on open foundations.
            </p>
          </div>

          <div className="architecture-grid">
            <article className="arch-card spatial-card">
              <div className="arch-number">01</div>
              <h3 className="arch-title">Document Ingestion &amp; Chunking</h3>
              <p className="arch-desc">
                Course PDFs are ingested via PyMuPDF with layout and page boundary retention. Texts
                are split using boundary-aware semantic chunkers (800 characters, 150 overlap).
              </p>
              <div className="arch-meta">
                <span>PyMuPDF</span>
                <span>Recursive Splitting</span>
              </div>
            </article>

            <article className="arch-card spatial-card">
              <div className="arch-number">02</div>
              <h3 className="arch-title">Dense Embeddings &amp; Vector Store</h3>
              <p className="arch-desc">
                Text chunks are mapped into 384-dimensional dense vectors using the open-source
                BAAI/bge-small-en-v1.5 model and indexed in course-scoped ChromaDB collections.
              </p>
              <div className="arch-meta">
                <span>BAAI/bge-small-en</span>
                <span>ChromaDB</span>
              </div>
            </article>

            <article className="arch-card spatial-card">
              <div className="arch-number">03</div>
              <h3 className="arch-title">AI Lecture Studio &amp; Slide Generator</h3>
              <p className="arch-desc">
                Synthesize multi-slide presentations directly from assigned chapters. Includes
                learning goals, structured bullet points, presenter notes, and targeted slide regeneration.
              </p>
              <div className="arch-meta">
                <span>FastAPI</span>
                <span>Targeted Regeneration</span>
              </div>
            </article>

            <article className="arch-card spatial-card">
              <div className="arch-number">04</div>
              <h3 className="arch-title">Classroom Isolation &amp; RBAC</h3>
              <p className="arch-desc">
                Role-based access control separates instructors from enrolled students. Course
                materials remain strictly isolated, completely preventing cross-course leakage.
              </p>
              <div className="arch-meta">
                <span>Access Codes</span>
                <span>Metadata Scoping</span>
              </div>
            </article>
          </div>
        </section>

        {/* INTERACTIVE SYLLABUS AUDIT SANDBOX WITH LIVE STREAMING TYPING */}
        <section id="sandbox" className="editorial-section editorial-reveal">
          <div className="section-intro">
            <span className="section-label">INTERACTIVE AUDIT</span>
            <h2 className="section-heading">Verify Grounded Answer Synthesis</h2>
            <p className="section-subtext">
              Select an exam question below to examine how the system constructs answers strictly
              from verified syllabus chunks with page citations in real time.
            </p>
          </div>

          <div className="sandbox-panel spatial-glow">
            <div className="sandbox-question-selector">
              {SAMPLE_QUESTIONS.map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`question-select-btn ${activeQuestionIdx === idx ? 'active' : ''}`}
                  onClick={() => handleSelectQuestion(idx)}
                >
                  <span className="q-num">Q{idx + 1}</span>
                  <span className="q-title">{q.prompt}</span>
                </button>
              ))}
            </div>

            <div className="sandbox-result-view">
              <div className="result-header">
                <div className="result-header-left">
                  <span className="result-label">SYNTHESIZED GROUNDED RESPONSE</span>
                  <span className="result-latency">Retrieved in {selectedQuestion.latency}</span>
                </div>
                <span className="result-source-status">
                  <span className="status-indicator-dot small" />
                  Evidence Verified in ChromaDB
                </span>
              </div>

              <div className="result-content">
                <p className="result-text">
                  {displayedResponse}
                  {isTyping && <span className="streaming-cursor" aria-hidden="true">|</span>}
                </p>

                <div className="result-citations-list">
                  <span className="citations-header">Retrieved Evidence Sources:</span>
                  <div className="citations-tags">
                    {selectedQuestion.citations.map((c, i) => (
                      <span key={i} className="citation-tag">
                        <FileTextIcon />
                        <span>{c}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ROLE SELECTION */}
        <section id="workspaces" className="editorial-section editorial-reveal">
          <div className="section-intro">
            <span className="section-label">CLASSROOM ACCESS</span>
            <h2 className="section-heading">Designed for Educators and Students</h2>
          </div>

          <div className="workspaces-split">
            <div className="workspace-column educator spatial-card">
              <div className="workspace-header">
                <span className="workspace-type">FOR EDUCATORS &amp; INSTRUCTORS</span>
                <h3 className="workspace-title">Author, narrate, and administer courses</h3>
              </div>
              <ul className="workspace-benefits">
                <li>Ingest textbooks, syllabi, and lecture transcripts into course-isolated vector stores.</li>
                <li>Generate multi-slide lectures with structured outlines and presenter speaker notes.</li>
                <li>Issue course enrollment codes and review student comprehension metrics.</li>
              </ul>
              <button
                type="button"
                className="editorial-btn-solid"
                onClick={() => onOpenAuth('signup')}
              >
                <span>Launch Educator Studio</span>
                <ArrowRightIcon />
              </button>
            </div>

            <div className="workspace-column student spatial-card">
              <div className="workspace-header">
                <span className="workspace-type">FOR STUDENTS &amp; LEARNERS</span>
                <h3 className="workspace-title">Study from assigned literature without guessing</h3>
              </div>
              <ul className="workspace-benefits">
                <li>Enter your course code to unlock your instructor's approved literature.</li>
                <li>Query course materials with verified page-level citations for every response.</li>
                <li>Test your mastery with practice assessments grounded in assigned readings.</li>
              </ul>
              <button
                type="button"
                className="editorial-btn-outline"
                onClick={() => onOpenAuth('login')}
              >
                <span>Enter Student Portal</span>
                <ArrowRightIcon />
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="editorial-footer">
        <div className="footer-container">
          <div className="footer-left">
            <BrandMark size="sm" sublabel="Course-Grounded Academic Workspace" />
            <p className="footer-note">
              An open, verifiable academic platform for curriculum authoring and syllabus-grounded tutoring.
            </p>
          </div>
          <div className="footer-nav">
            <button type="button" onClick={() => scrollTo('architecture')}>Architecture</button>
            <button type="button" onClick={() => scrollTo('sandbox')}>Interactive Audit</button>
            <button type="button" onClick={() => onOpenAuth('login')}>Sign In</button>
            <button type="button" onClick={() => onOpenAuth('signup')}>Create Account</button>
          </div>
        </div>
        <div className="footer-copyright">
          <span>&copy; 2026 EduForge AI. Designed with academic integrity.</span>
          <span className="footer-tagline">Open-source RAG architecture.</span>
        </div>
      </footer>
    </div>
  );
}
