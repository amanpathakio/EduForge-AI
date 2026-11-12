import React, { useState, useEffect } from 'react';
import BrandMark from './BrandMark';
import ThemeToggle from './ThemeToggle';
import NeuralBackdrop from './NeuralBackdrop';

const LANDING_WAVE_BARS = [30, 62, 44, 88, 52, 94, 46, 76, 84, 58, 92, 48, 70, 82, 40];

const PREVIEW_CHUNKS = [
  {
    id: 'chunk-p14',
    source: 'CS301_Operating_Systems_Principles.pdf · Page 14',
    shortLabel: 'OS_Principles.pdf · p.14',
    distance: 0.1842,
    similarityPct: 82,
    excerpt:
      '"Round Robin (RR) assigns a fixed time quantum q (typically 10–100 ms) to each ready process in a circular FIFO queue. Because every runnable process receives CPU time within (n - 1) × q units, indefinite blocking of low-priority jobs cannot occur."',
  },
  {
    id: 'chunk-p15',
    source: 'CS301_Operating_Systems_Principles.pdf · Page 15',
    shortLabel: 'OS_Principles.pdf · p.15',
    distance: 0.2194,
    similarityPct: 78,
    excerpt:
      '"Selecting q requires balancing responsiveness against overhead: if q is very large, RR degenerates into FCFS; if q is too small, frequent context switches consume significant CPU cycles without useful progress."',
  },
];

const PREVIEW_SLIDES = [
  {
    num: '01',
    title: 'CPU Scheduling Objectives',
    bullets: [
      'Maximize CPU utilization and throughput across ready queues.',
      'Minimize turnaround time, waiting time, and interactive response latency.',
      'Enforce starvation-free fairness for background and interactive threads.',
    ],
    page: 'Page 11',
  },
  {
    num: '02',
    title: 'Circular Ready Queue Mechanics',
    bullets: [
      'Scheduler pops head process for at most one time quantum q.',
      'Timer interrupt preempts running thread if burst exceeds q.',
      'Remaining CPU burst rejoins the tail of the FIFO ready queue.',
    ],
    page: 'Page 13',
  },
  {
    num: '03',
    title: 'Selecting an Optimal Time Quantum',
    bullets: [
      'Too large (q → ∞): scheduling degrades toward First-Come, First-Served behavior.',
      'Too small (q < 10 ms): excessive context switching lowers CPU utilization.',
      'Target heuristic: keep 80% of CPU bursts shorter than one time quantum.',
    ],
    page: 'Page 15',
  },
];

const PIPELINE_STEPS = [
  {
    num: '01',
    tech: 'STAGE 01 · INGESTION',
    title: 'Page-Preserving PDF Ingest',
    desc: 'Extracts uploaded syllabi and lecture notes page by page, tagging every fragment with filename, document ID, and exact page number.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
        <path d="M14 2H7a2 2 0 00-2 2v16a2 2 0 002 2h10a2 2 0 002-2V7l-5-5z" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M14 2v5h5M9 13h6M9 17h4" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    num: '02',
    tech: 'STAGE 02 · SEMANTIC INDEX',
    title: 'Contextual Knowledge Indexing',
    desc: 'Segments course readings with overlap windows and indexes semantic representations tuned for academic terminology and formulas.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
        <rect x="7" y="7" width="10" height="10" rx="2" strokeWidth="1.8" />
        <path d="M9 2v3m6-3v3M9 19v3m6-3v3M2 9h3m-3 6h3M19 9h3m-3 6h3" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    num: '03',
    tech: 'STAGE 03 · COURSE VAULT',
    title: 'Course-Scoped Retrieval',
    desc: 'Queries persistent per-course knowledge vaults with strict relevance margin filtering so sibling courses never bleed across answers.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
        <ellipse cx="12" cy="6" rx="7" ry="3" strokeWidth="1.8" />
        <path d="M5 6v6c0 1.66 3.13 3 7 3s7-1.34 7-3V6" strokeWidth="1.8" />
        <path d="M5 12v6c0 1.66 3.13 3 7 3s7-1.34 7-3v-6" strokeWidth="1.8" />
      </svg>
    ),
  },
  {
    num: '04',
    tech: 'STAGE 04 · VERIFIED SYNTHESIS',
    title: 'Cite Evidence or Decline',
    desc: 'Synthesizes narrated lectures, answers, and quizzes strictly from retrieved passages—attaching page citations or refusing unsupported queries.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
        <path d="M12 3l7 3v5c0 4.5-3 8.4-7 10-4-1.6-7-5.5-7-10V6l7-3z" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M9.5 12.2l1.8 1.8 3.6-3.8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

const SAFEGUARDS = [
  {
    tag: 'PROMPT GUARDRAIL',
    title: 'Strict Context-Only Grounding',
    body: 'Synthesis guardrails prevent inventing external facts. When uploaded course material lacks evidence, EduForge declines cleanly.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
        <rect x="5" y="11" width="14" height="9" rx="2" strokeWidth="1.8" />
        <path d="M8 11V7a4 4 0 018 0v4" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    tag: 'RELEVANCE THRESHOLD',
    title: 'Pre-Generation Confidence Gate',
    body: 'Queries that fall below the similarity threshold inside the course vault stop cleanly at retrieval before response synthesis runs.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
        <path d="M4 17l5-5 4 3 7-8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3 20h18" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    tag: 'CHUNK AUDITOR',
    title: 'Inspectable Page Provenance',
    body: 'Every tutor reply and lecture slide links to clickable citation badges revealing the exact extracted excerpt and similarity score.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
        <circle cx="11" cy="11" r="6" strokeWidth="1.8" />
        <path d="M16 16l4.5 4.5" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function LandingPage({ theme, onToggleTheme, onOpenAuth }) {
  const [activePreviewTab, setActivePreviewTab] = useState('tutor');
  const [tutorScenario, setTutorScenario] = useState('grounded');
  const [selectedChunkIdx, setSelectedChunkIdx] = useState(0);
  const [activeSlideIdx, setActiveSlideIdx] = useState(2);
  const [previewQuizPublished, setPreviewQuizPublished] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const selectedChunk = PREVIEW_CHUNKS[selectedChunkIdx];
  const selectedSlide = PREVIEW_SLIDES[activeSlideIdx];

  useEffect(() => {
    const els = document.querySelectorAll('.reveal-section');
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
      { threshold: 0.12 }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const handlePointerMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - rect.top}px`);
  };

  const scrollToSection = (id) => {
    setMobileMenuOpen(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="landing-page" onPointerMove={handlePointerMove}>
      <NeuralBackdrop theme={theme} />
      {/* Spatial Architectural Backdrop */}
      <div className="landing-ambient" aria-hidden="true">
        <div className="landing-grid-bg" />
        <div className="auth-spotlight" />
        <div className="landing-horizon-beam" />
        <div className="landing-glow landing-glow-primary" />
        <div className="landing-glow landing-glow-teal" />
      </div>

      {/* Floating Navigation */}
      <header className="landing-nav-wrap">
        <nav className="landing-nav" aria-label="Primary navigation">
          <a
            href="#top"
            className="landing-brand-link"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            <BrandMark size="sm" />
          </a>

          <div className="landing-nav-links">
            <button type="button" onClick={() => scrollToSection('pipeline')}>
              RAG Pipeline
            </button>
            <button type="button" onClick={() => scrollToSection('workspaces')}>
              Workspaces
            </button>
            <button type="button" onClick={() => scrollToSection('safeguards')}>
              Grounding
            </button>
          </div>

          <div className="landing-nav-actions">
            <ThemeToggle theme={theme} onToggle={onToggleTheme} compact />
            <button
              type="button"
              className="button button-secondary landing-btn-signin"
              onClick={() => onOpenAuth('login')}
            >
              Sign In
            </button>
            <button
              type="button"
              className="button button-primary landing-btn-cta"
              onClick={() => onOpenAuth('signup')}
            >
              Get Started <span className="btn-arrow">→</span>
            </button>
          </div>

          <button
            type="button"
            className="landing-mobile-trigger"
            aria-expanded={mobileMenuOpen}
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            onClick={() => setMobileMenuOpen((v) => !v)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              {mobileMenuOpen ? (
                <path strokeWidth="2" strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeWidth="2" strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
              )}
            </svg>
          </button>
        </nav>

        {mobileMenuOpen && (
          <div className="landing-mobile-drawer">
            <button type="button" onClick={() => scrollToSection('pipeline')}>
              RAG Pipeline
            </button>
            <button type="button" onClick={() => scrollToSection('workspaces')}>
              Workspaces
            </button>
            <button type="button" onClick={() => scrollToSection('safeguards')}>
              Grounding Safeguards
            </button>
            <div className="landing-mobile-controls">
              <ThemeToggle theme={theme} onToggle={onToggleTheme} />
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenAuth('login');
                }}
              >
                Sign In
              </button>
            </div>
            <button
              type="button"
              className="button button-primary"
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenAuth('signup');
              }}
            >
              Create Account →
            </button>
          </div>
        )}
      </header>

      <main id="top" className="landing-main">
        {/* HERO SECTION */}
        <section className="landing-hero">
          <div className="hero-copy-col">
            <div className="hero-kicker">
              <span className="kicker-pulse" aria-hidden="true" />
              <span>COURSE-GROUNDED ACADEMIC INTELLIGENCE</span>
            </div>

            <h1 className="hero-headline">
              Course intelligence,{' '}
              <em className="hero-serif-accent">strictly anchored</em> to your syllabus.
            </h1>

            <p className="hero-lead">
              EduForge AI turns professor-uploaded lecture PDFs into course-isolated
              knowledge vaults—synthesizing voice-narrated lecture studios, cited student Q&amp;A,
              and source-verified assessments where every claim traces back to a page number.
            </p>

            <div className="hero-cta-row">
              <button
                type="button"
                className="button button-primary hero-cta-primary"
                onClick={() => onOpenAuth('signup')}
              >
                <span>Create Academic Account</span>
                <span className="btn-arrow" aria-hidden="true">→</span>
              </button>
              <button
                type="button"
                className="button button-secondary hero-cta-secondary"
                onClick={() => onOpenAuth('login')}
              >
                Sign In to Workspace
              </button>
            </div>

            <div className="hero-stack-strip" aria-label="Core platform capabilities">
              <div className="stack-chip">
                <span className="stack-dot indigo" aria-hidden="true" />
                <div>
                  <b>Page-Exact Ingest</b>
                  <small>Syllabus &amp; PDF indexing</small>
                </div>
              </div>
              <div className="stack-chip">
                <span className="stack-dot violet" aria-hidden="true" />
                <div>
                  <b>Voice Lecture Studio</b>
                  <small>Educator narration synthesis</small>
                </div>
              </div>
              <div className="stack-chip">
                <span className="stack-dot teal" aria-hidden="true" />
                <div>
                  <b>Course-Isolated Vault</b>
                  <small>Zero cross-course leakage</small>
                </div>
              </div>
              <div className="stack-chip">
                <span className="stack-dot cyan" aria-hidden="true" />
                <div>
                  <b>Role-Enforced Auth</b>
                  <small>Professor &amp; student separation</small>
                </div>
              </div>
            </div>
          </div>

          {/* INTERACTIVE LIVE WORKBENCH PREVIEW */}
          <div className="hero-workbench-col">
            <div className="workbench-aurora-wrap">
              <div className="workbench-frame">
                <div className="workbench-chrome">
                  <div className="workbench-dots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                  <span className="workbench-path">CS301 · Operating Systems Principles</span>
                  <span className="workbench-badge">
                    <i aria-hidden="true" />
                    LIVE WORKSPACE
                  </span>
                </div>

                <div className="workbench-tabs" role="tablist" aria-label="Platform capabilities preview">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activePreviewTab === 'tutor'}
                    className={activePreviewTab === 'tutor' ? 'active' : ''}
                    onClick={() => setActivePreviewTab('tutor')}
                  >
                    Ask Course Tutor
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activePreviewTab === 'studio'}
                    className={activePreviewTab === 'studio' ? 'active' : ''}
                    onClick={() => setActivePreviewTab('studio')}
                  >
                    Lecture Studio
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activePreviewTab === 'quiz'}
                    className={activePreviewTab === 'quiz' ? 'active' : ''}
                    onClick={() => setActivePreviewTab('quiz')}
                  >
                    Architect &amp; Quiz
                  </button>
                </div>

                {activePreviewTab === 'tutor' && (
                  <div className="workbench-body">
                    <div className="wb-scenario-bar" role="group" aria-label="Test retrieval scenario">
                      <span>Try query:</span>
                      <button
                        type="button"
                        className={tutorScenario === 'grounded' ? 'active' : ''}
                        onClick={() => setTutorScenario('grounded')}
                      >
                        In-Syllabus (Cited)
                      </button>
                      <button
                        type="button"
                        className={tutorScenario === 'declined' ? 'active' : ''}
                        onClick={() => setTutorScenario('declined')}
                      >
                        Off-Topic (Guardrail)
                      </button>
                    </div>

                    {tutorScenario === 'grounded' ? (
                      <>
                        <div className="wb-user-msg">
                          How does Round Robin prevent starvation compared to strict priority queues?
                        </div>

                        <div className="wb-ai-msg">
                          <p>
                            Round Robin enforces a bounded <strong>time quantum (q)</strong> per
                            ready process in a circular FIFO queue, guaranteeing every runnable
                            process receives CPU cycles within <code>(n - 1) × q</code> time units.
                          </p>
                          <div className="wb-citations-row">
                            <span className="wb-cit-label">Click a citation to inspect source chunk:</span>
                            <div className="wb-cit-pills">
                              {PREVIEW_CHUNKS.map((chunk, idx) => (
                                <button
                                  key={chunk.id}
                                  type="button"
                                  className={`wb-cit-pill ${selectedChunkIdx === idx ? 'selected' : ''}`}
                                  onClick={() => setSelectedChunkIdx(idx)}
                                >
                                  {chunk.shortLabel}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="wb-auditor-box">
                          <div className="wb-auditor-head">
                            <span>SOURCE CHUNK AUDITOR · {selectedChunk.source}</span>
                            <code>distance: {selectedChunk.distance.toFixed(4)}</code>
                          </div>
                          <div className="wb-auditor-meter" aria-hidden="true">
                            <div style={{ width: `${selectedChunk.similarityPct}%` }} />
                          </div>
                          <blockquote>{selectedChunk.excerpt}</blockquote>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="wb-user-msg">
                          Predict Apple&apos;s Q4 stock valuation for CS301 exam prep.
                        </div>

                        <div className="wb-ai-msg wb-guardrail-msg">
                          <div className="wb-guardrail-tag">CONFIDENCE GATE TRIGGERED · GENERATION HALTED</div>
                          <p>
                            The uploaded CS301 course material does not contain information about
                            equity valuations or financial forecasts. Ask a question covered in your
                            course PDFs.
                          </p>
                        </div>

                        <div className="wb-auditor-box wb-auditor-declined">
                          <div className="wb-auditor-head">
                            <span>RELEVANCE GATE · MAX DISTANCE EXCEEDED</span>
                            <code>distance: 0.8124</code>
                          </div>
                          <div className="wb-auditor-meter declined" aria-hidden="true">
                            <div style={{ width: '19%' }} />
                          </div>
                          <blockquote>
                            No passages inside the CS301 course vault passed the minimum
                            semantic similarity cutoff, so synthesis was blocked cleanly.
                          </blockquote>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {activePreviewTab === 'studio' && (
                  <div className="workbench-body">
                    <div className="wb-slide-card">
                      <div className="wb-slide-top">
                        <span>LECTURE STUDIO · DECK 04</span>
                        <span>SLIDE {selectedSlide.num} / 03</span>
                      </div>
                      <h3>{selectedSlide.title}</h3>
                      <ul>
                        {selectedSlide.bullets.map((bullet, i) => (
                          <li key={i}>{bullet}</li>
                        ))}
                      </ul>
                      <div className="wb-slide-foot">
                        <span className="wb-coverage-pill">Evidence Coverage Verified</span>
                        <span>Grounded in {selectedSlide.page}</span>
                      </div>
                    </div>

                    <div className="wb-slide-rail" role="tablist" aria-label="Preview slides">
                      {PREVIEW_SLIDES.map((slide, idx) => (
                        <button
                          key={slide.num}
                          type="button"
                          role="tab"
                          aria-selected={activeSlideIdx === idx}
                          className={`wb-slide-thumb ${activeSlideIdx === idx ? 'active' : ''}`}
                          onClick={() => setActiveSlideIdx(idx)}
                        >
                          <b>{slide.num}</b>
                          <span>{slide.page}</span>
                        </button>
                      ))}
                    </div>

                    <div className="wb-voice-mini">
                      <span className="wb-voice-label">NARRATION WAVEFORM</span>
                      <div className="voice-wave-bars compact" aria-hidden="true">
                        {LANDING_WAVE_BARS.map((height, idx) => (
                          <span
                            key={idx}
                            style={{
                              '--bar-h': `${height}%`,
                              '--bar-delay': `${(idx * 0.08).toFixed(2)}s`,
                            }}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="wb-regen-strip">
                      <span>AI Slide Refine:</span>
                      <em>&ldquo;Add a comparison table with SJF latency&rdquo;</em>
                    </div>
                  </div>
                )}

                {activePreviewTab === 'quiz' && (
                  <div className="workbench-body">
                    <div className="wb-architect-steps">
                      <div className="wb-step done">
                        <span>✓</span>
                        <div>
                          <b>Course Architect Blueprint</b>
                          <small>4 modules mapped across pages 1–38</small>
                        </div>
                      </div>
                      <div className="wb-step done">
                        <span>✓</span>
                        <div>
                          <b>Assessment Draft Ready</b>
                          <small>5 source-cited questions prepared for review</small>
                        </div>
                      </div>
                    </div>

                    <div className="wb-quiz-preview">
                      <div className="wb-quiz-meta">
                        <span>QUESTION 01 · SOURCE PAGE 14</span>
                        <span className={`wb-status ${previewQuizPublished ? 'published' : 'draft'}`}>
                          {previewQuizPublished ? 'PUBLISHED' : 'PROFESSOR REVIEW'}
                        </span>
                      </div>
                      <strong>
                        What happens to Round Robin response time as the number of ready processes n increases?
                      </strong>
                      <div className="wb-quiz-footer">
                        <small>Grounded explanation verified from textbook text</small>
                        <button
                          type="button"
                          className="button button-primary button-xs"
                          onClick={() => setPreviewQuizPublished((v) => !v)}
                        >
                          {previewQuizPublished ? 'Published to Students ✓' : 'Approve & Publish'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 1: 4-STAGE PIPELINE */}
        <section id="pipeline" className="landing-section reveal-section">
          <div className="section-intro">
            <span className="eyebrow">ARCHITECTURE FLOW</span>
            <h2>From raw PDFs to audited academic outputs.</h2>
            <p>
              Every course maintains an isolated retrieval pipeline so cross-course material never bleeds across answers.
            </p>
          </div>

          <div className="pipeline-grid">
            <div className="pipeline-connector" aria-hidden="true">
              <span className="pipeline-packet" />
            </div>
            {PIPELINE_STEPS.map((step) => (
              <article key={step.num} className="pipeline-card">
                <div className="pipeline-card-top">
                  <div className="pipeline-icon-box">{step.icon}</div>
                  <span className="pipeline-num">{step.num}</span>
                </div>
                <code className="pipeline-tech">{step.tech}</code>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </article>
            ))}
          </div>
        </section>

        {/* SECTION 2: ROLE-SEPARATED BENTO WORKSPACES */}
        <section id="workspaces" className="landing-section reveal-section">
          <div className="section-intro">
            <span className="eyebrow">ROLE-AWARE PLATFORM</span>
            <h2>Built cleanly for both sides of the lecture hall.</h2>
            <p>
              Professor authoring tools and student study spaces share the same verified knowledge base with strict role boundaries.
            </p>
          </div>

          <div className="workspaces-bento">
            <article className="workspace-showcase professor">
              <div className="ws-badge-row">
                <span className="ws-role-pill">EDUCATOR COMMAND CENTER</span>
                <span className="ws-tag">Course Architect + Lecture Studio</span>
              </div>
              <h3>Design courses, approve blueprints, and publish verified assessments.</h3>

              <div className="bento-mini-preview">
                <div className="bento-flow-node done">Course Blueprint · 4 Modules</div>
                <i aria-hidden="true">→</i>
                <div className="bento-flow-node active">Lecture Studio · Citations</div>
                <i aria-hidden="true">→</i>
                <div className="bento-flow-node gate">Draft Quiz Gate</div>
              </div>

              <ul className="ws-feature-list">
                <li>
                  <b>Evidence-First Course Architect</b>
                  <span>Organizes uploaded PDFs into teachable modules with explicit source page mappings before drafting.</span>
                </li>
                <li>
                  <b>Slide-by-Slide Lecture Studio</b>
                  <span>Synthesizes structured slides with speaker notes, evidence coverage indicators, and targeted per-slide edits.</span>
                </li>
                <li>
                  <b>Human-in-the-Loop Quizzes</b>
                  <span>Every AI-generated assessment stays in draft status with citation metadata until a professor approves release.</span>
                </li>
              </ul>
            </article>

            <article className="workspace-showcase student">
              <div className="ws-badge-row">
                <span className="ws-role-pill teal">STUDENT LEARNING SPACE</span>
                <span className="ws-tag">Course Tutor + Practice Arena</span>
              </div>
              <h3>Study with a cited tutor and practice directly from approved material.</h3>

              <div className="bento-mini-preview student">
                <div className="bento-cite-chip">OS_Principles.pdf · p.14</div>
                <div className="bento-match-meter">
                  <span>Similarity Match</span>
                  <b>82%</b>
                </div>
                <div className="bento-flow-node gate teal">Published Practice Quiz</div>
              </div>

              <ul className="ws-feature-list">
                <li>
                  <b>Course-Isolated Grounded Chat</b>
                  <span>Select any enrolled course and ask conceptual or exam-prep questions answered only from course uploads.</span>
                </li>
                <li>
                  <b>One-Click Citation Inspector</b>
                  <span>Audit the exact PDF filename, page number, chunk text, and semantic distance score behind any response.</span>
                </li>
                <li>
                  <b>Published Practice Quizzes</b>
                  <span>Test mastery on professor-approved assessments with instant explanations grounded to specific source pages.</span>
                </li>
              </ul>
            </article>
          </div>
        </section>

        {/* SECTION 3: GROUNDING SAFEGUARDS */}
        <section id="safeguards" className="landing-section reveal-section">
          <div className="safeguards-banner">
            <div className="safeguards-header">
              <span className="eyebrow">HALLUCINATION MITIGATION</span>
              <h2>Engineered to reduce hallucination risk—by design.</h2>
              <p>
                No LLM pipeline eliminates hallucination completely, so EduForge pairs strict system prompting with pre-generation distance thresholds and transparent chunk inspection.
              </p>
              <div className="safeguard-formula">
                <code>Distance &lt; Threshold</code>
                <span aria-hidden="true">→</span>
                <code>Context-Only Prompt</code>
                <span aria-hidden="true">→</span>
                <code>Clickable Page Citations</code>
              </div>
            </div>
            <div className="safeguards-grid">
              {SAFEGUARDS.map((item) => (
                <article key={item.tag} className="safeguard-card">
                  <div className="safeguard-card-top">
                    <div className="safeguard-icon">{item.icon}</div>
                    <span className="safeguard-tag">{item.tag}</span>
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* BOTTOM CTA */}
        <section className="landing-cta-band reveal-section">
          <div className="cta-band-content">
            <span className="eyebrow">READY TO BEGIN</span>
            <h2>Step inside your grounded academic workspace.</h2>
            <p>
              Sign in with your verified academic account or register a workspace to upload syllabi, synthesize narrated lectures, and launch cited student tutoring.
            </p>
            <div className="cta-band-actions">
              <button
                type="button"
                className="button button-primary"
                onClick={() => onOpenAuth('signup')}
              >
                Create Account <span className="btn-arrow" aria-hidden="true">→</span>
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => onOpenAuth('login')}
              >
                Sign In
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <BrandMark size="sm" sublabel="© 2026 EduForge AI · Course-Grounded Teaching & Learning Platform" />
          <div className="landing-footer-links">
            <button type="button" onClick={() => scrollToSection('pipeline')}>Pipeline</button>
            <button type="button" onClick={() => scrollToSection('workspaces')}>Workspaces</button>
            <button type="button" onClick={() => scrollToSection('safeguards')}>Grounding</button>
            <button type="button" onClick={() => onOpenAuth('login')}>Sign In</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
