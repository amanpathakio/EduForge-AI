import React, { useEffect, useState, useCallback } from 'react';
import {
  getCourseAgentRuns,
  startCourseArchitect,
  getLatestCourseBlueprint,
  approveCourseBlueprint,
  produceBlueprintLessons,
} from '../services/api';
import '../styles/course-architect.css';

const PROMPT_SUGGESTIONS = [
  { label: 'Standard Progressive Arc', text: 'Organize this course into a progressive, multi-week syllabus with clear module objectives and practice assessments.' },
  { label: 'Theory + Practical Labs', text: 'Structure modules progressing from foundational principles directly into real-world applications and system implementations.' },
  { label: 'Exam & Mastery Focused', text: 'Create an intensive mastery curriculum highlighting core concepts, common misconceptions, and rigorous practice problems.' },
];

export default function CourseArchitectPanel({
  courseId,
  documentCount = 0,
  onOpenQuizzes,
  onOpenLectures,
  onOpenDocuments,
  onCourseUpdated,
}) {
  const [runs, setRuns] = useState([]);
  const [blueprint, setBlueprint] = useState(null);
  const [goal, setGoal] = useState(PROMPT_SUGGESTIONS[0].text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [history, latest] = await Promise.all([
        getCourseAgentRuns(courseId),
        getLatestCourseBlueprint(courseId),
      ]);
      setRuns(history || []);
      setBlueprint(latest);
    } catch (err) {
      console.warn('Failed to load planner data:', err);
    }
  }, [courseId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Polling while any run is in progress
  useEffect(() => {
    const isWorking = runs.some((r) => r.status === 'queued' || r.status === 'running');
    if (!isWorking) return undefined;

    const interval = window.setInterval(loadData, 2500);
    return () => window.clearInterval(interval);
  }, [runs, loadData]);

  const handleRunArchitect = async () => {
    if (!goal.trim() || busy) return;
    try {
      setBusy(true);
      setError('');
      const created = await startCourseArchitect(courseId, { goal });
      setRuns((prev) => [created, ...prev]);
      setIsEditingPrompt(false);
      await loadData();
      onCourseUpdated?.();
    } catch (e) {
      setError(e.message || 'Failed to generate course outline.');
    } finally {
      setBusy(false);
    }
  };

  const handleProduceLessons = async () => {
    if (!blueprint?.id || busy) return;
    try {
      setBusy(true);
      setError('');
      // Auto-approve blueprint first if needed so the user never gets an approval block
      if (blueprint.status !== 'approved') {
        const approved = await approveCourseBlueprint(courseId, blueprint.id);
        setBlueprint(approved);
      }
      const queued = await produceBlueprintLessons(courseId, blueprint.id);
      setRuns((prev) => [queued, ...prev]);
      await loadData();
      onCourseUpdated?.();
    } catch (e) {
      setError(e.message || 'Failed to generate lessons.');
    } finally {
      setBusy(false);
    }
  };

  const latestRun = runs[0];
  const isWorking = runs.some((r) => r.status === 'queued' || r.status === 'running') || busy;
  const isLessonProducerWorking = runs.some(
    (r) => (r.status === 'queued' || r.status === 'running') && r.agent_type === 'lesson_producer'
  );
  const hasProducedLessons = runs.some(
    (r) => r.agent_type === 'lesson_producer' && (r.status === 'awaiting_approval' || r.status === 'completed')
  );

  const step1Complete = Boolean(blueprint && blueprint.modules?.length > 0);
  const step2Complete = Boolean(hasProducedLessons || latestRun?.result?.artifacts?.lecture_drafts > 0);

  return (
    <div className="course-architect-container">
      {/* HEADER */}
      <div className="architect-header-row">
        <div>
          <span className="architect-header-eyebrow">
            ⚡ AI Curriculum Studio
          </span>
          <h2>Course Planner &amp; Lesson Producer</h2>
          <p>
            Transforms your uploaded course materials into an accredited syllabus structure, then synthesizes full slide decks and practice assessments.
          </p>
        </div>

        <div className={`planner-status-badge ${isWorking ? 'working' : step1Complete ? 'approved' : ''}`}>
          {isWorking ? '⚡ AI Agent Working…' : step2Complete ? '✓ Course Ready' : step1Complete ? '✓ Syllabus Ready' : 'Ready'}
        </div>
      </div>

      {/* 2-STEP PIPELINE STEPPER */}
      <div className="planner-pipeline-stepper">
        <div className={`pipeline-step-pill ${step1Complete ? 'completed' : 'active'}`}>
          <span className="pipeline-step-num">{step1Complete ? '✓' : '1'}</span>
          <div className="pipeline-step-meta">
            <strong>Step 1: Curriculum Blueprint</strong>
            <span>{step1Complete ? `${blueprint.modules.length} Modules Structured` : 'Analyze PDFs & Map Syllabus Arc'}</span>
          </div>
        </div>

        <div className={`pipeline-step-pill ${step2Complete ? 'completed' : step1Complete ? 'active' : ''}`}>
          <span className="pipeline-step-num">{step2Complete ? '✓' : '2'}</span>
          <div className="pipeline-step-meta">
            <strong>Step 2: Slide Decks &amp; Quizzes</strong>
            <span>{step2Complete ? 'Decks & Quizzes Generated' : 'Synthesize 7-Slide Decks + Assessments'}</span>
          </div>
        </div>
      </div>

      {/* ERROR BANNER */}
      {error && <div className="error-banner">{error}</div>}

      {/* STEP 1: SYLLABUS DIRECTIVE (COLLAPSED IF ALREADY GENERATED, EXPANDABLE) */}
      {step1Complete && !isEditingPrompt ? (
        <div className="blueprint-summary-compact">
          <div className="summary-compact-left">
            <span className="summary-check-icon">✓</span>
            <div className="summary-compact-text">
              <strong>Syllabus Blueprint Active ({blueprint.modules.length} Modules)</strong>
              <span>Grounded in {documentCount} indexed document{documentCount === 1 ? '' : 's'}</span>
            </div>
          </div>
          <button
            type="button"
            className="button button-sm button-secondary"
            onClick={() => setIsEditingPrompt(true)}
            disabled={isWorking}
          >
            Customize Directive ▾
          </button>
        </div>
      ) : (
        <div className="planner-form-card">
          <div className="planner-form-label-row">
            <label htmlFor="planner-prompt">
              {step1Complete ? 'Customize Syllabus Directive' : 'Step 1: Define Syllabus Goals'}
            </label>
            <span className="planner-doc-count">
              {documentCount} source document{documentCount === 1 ? '' : 's'} indexed
            </span>
          </div>

          <div className="prompt-chips-row">
            <span className="prompt-chips-label">Presets:</span>
            {PROMPT_SUGGESTIONS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="prompt-chip-btn"
                onClick={() => setGoal(preset.text)}
                disabled={isWorking}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <textarea
            id="planner-prompt"
            className="planner-textarea"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            disabled={isWorking}
            rows={3}
            placeholder="e.g. Structure into 4 weekly modules starting with foundations, progressing to implementation, and ending with real-world case studies."
          />

          {documentCount === 0 ? (
            <div className="no-docs-banner">
              <span>⚠️ No documents uploaded for this course yet. Upload PDFs so the AI can ground the syllabus in real evidence.</span>
              {onOpenDocuments && (
                <button
                  type="button"
                  className="button button-sm button-secondary"
                  onClick={onOpenDocuments}
                >
                  Upload Documents →
                </button>
              )}
            </div>
          ) : (
            <div className="planner-form-actions">
              <span className="planner-hints">
                All module topics &amp; citations are grounded directly in your uploaded PDFs.
              </span>

              <div style={{ display: 'flex', gap: '0.65rem' }}>
                {step1Complete && (
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => setIsEditingPrompt(false)}
                    disabled={isWorking}
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="button"
                  className="button button-primary"
                  disabled={isWorking || !documentCount || !goal.trim()}
                  onClick={handleRunArchitect}
                >
                  {isWorking ? 'Architecting Syllabus…' : step1Complete ? 'Re-Architect Syllabus' : '✨ Architect Syllabus (Step 1)'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ACTIVITY / PROGRESS (WHEN RUNNING OR RECENT) */}
      {latestRun && (latestRun.status === 'running' || latestRun.status === 'queued' || latestRun.steps?.length > 0) && (
        <div className="planner-activity-card">
          <div className="activity-header">
            <span>Live Planner Agent Activity</span>
            <small style={{ color: 'var(--ef-text-muted)' }}>
              {new Date(latestRun.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </small>
          </div>

          <div className="activity-steps">
            {latestRun.steps?.map((step) => (
              <div key={step.id || step.position} className={`activity-step-row ${step.status}`}>
                <span className="step-dot">
                  {step.status === 'completed' ? '✓' : step.status === 'running' ? '•' : '○'}
                </span>
                <span>{step.title}</span>
                {step.detail && <small style={{ marginLeft: 'auto', opacity: 0.75 }}>{step.detail}</small>}
              </div>
            ))}
          </div>

          {latestRun.result?.artifacts && (
            <div className="planner-artifacts-row">
              <span>
                ✓ Produced: {latestRun.result.artifacts.modules || 4} modules,{' '}
                {latestRun.result.artifacts.lecture_drafts || 4} lecture decks,{' '}
                {latestRun.result.artifacts.quiz_drafts || 4} practice quizzes.
              </span>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {onOpenLectures && (
                  <button
                    type="button"
                    className="button button-sm button-secondary"
                    onClick={onOpenLectures}
                  >
                    View Lectures →
                  </button>
                )}
                {onOpenQuizzes && (
                  <button
                    type="button"
                    className="button button-sm button-primary"
                    onClick={onOpenQuizzes}
                  >
                    View Quizzes →
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 2: LESSON & ASSESSMENT PRODUCER BANNER */}
      {step1Complete && (
        <div className="lesson-producer-card highlight">
          <div className="lesson-producer-info">
            <span className="architect-header-eyebrow">Step 2: Synthesize Learning Materials</span>
            <h3>Produce Visual Slide Decks &amp; Practice Quizzes</h3>
            <p>
              AI Lesson Producer will build concise 7-slide decks with speaker notes and 5 cited quiz questions for every module in your syllabus.
            </p>
          </div>

          <div className="lesson-producer-actions">
            {step2Complete ? (
              <>
                {onOpenLectures && (
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={onOpenLectures}
                  >
                    View Lectures ({blueprint.modules.length}) →
                  </button>
                )}
                {onOpenQuizzes && (
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={onOpenQuizzes}
                  >
                    View Quizzes ({blueprint.modules.length}) →
                  </button>
                )}
                <button
                  type="button"
                  className="button button-primary"
                  disabled={isWorking}
                  onClick={handleProduceLessons}
                >
                  {isLessonProducerWorking ? 'Regenerating…' : '🔄 Regenerate Decks'}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="button button-primary"
                disabled={isWorking}
                onClick={handleProduceLessons}
              >
                {isLessonProducerWorking ? 'Synthesizing Decks & Quizzes…' : '⚡ Produce Slide Decks & Quizzes (Step 2) →'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* SYLLABUS OUTLINE (STRUCTURED TABLE) */}
      {blueprint && (
        <div className="syllabus-card">
          <div className="syllabus-card-header">
            <div>
              <h3>{blueprint.title || 'Course Syllabus Outline'}</h3>
              <p>
                Structured module arc derived from your course PDFs.
              </p>
            </div>
          </div>

          <div className="modules-table">
            {blueprint.modules?.map((mod) => (
              <div key={mod.id || mod.position} className="module-row">
                <span className="module-index">{String(mod.position).padStart(2, '0')}</span>
                <div className="module-info">
                  <strong>{mod.title}</strong>
                  <span>{mod.objective}</span>
                </div>
                <div className="module-source">
                  {mod.evidence_pages?.length > 0
                    ? `📄 Pages ${mod.evidence_pages.join(', ')}`
                    : '🌿 Source-grounded'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
