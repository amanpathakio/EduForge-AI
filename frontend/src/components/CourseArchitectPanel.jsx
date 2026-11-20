import React, { useEffect, useState, useCallback } from 'react';
import {
  getCourseAgentRuns,
  startCourseArchitect,
  getLatestCourseBlueprint,
  approveCourseBlueprint,
  produceBlueprintLessons,
} from '../services/api';
import '../styles/course-architect.css';

export default function CourseArchitectPanel({
  courseId,
  documentCount = 0,
  onOpenQuizzes,
  onOpenLectures,
  onOpenDocuments,
}) {
  const [runs, setRuns] = useState([]);
  const [blueprint, setBlueprint] = useState(null);
  const [goal, setGoal] = useState(
    'Organize this course into a progressive, multi-week syllabus with clear module objectives and practice assessments.'
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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
      await loadData();
    } catch (e) {
      setError(e.message || 'Failed to generate course outline.');
    } finally {
      setBusy(false);
    }
  };

  const handleApproveBlueprint = async () => {
    if (!blueprint?.id || busy) return;
    try {
      setBusy(true);
      setError('');
      const approved = await approveCourseBlueprint(courseId, blueprint.id);
      setBlueprint(approved);
    } catch (e) {
      setError(e.message || 'Failed to approve syllabus.');
    } finally {
      setBusy(false);
    }
  };

  const handleProduceLessons = async () => {
    if (!blueprint?.id || busy) return;
    try {
      setBusy(true);
      setError('');
      const queued = await produceBlueprintLessons(courseId, blueprint.id);
      setRuns((prev) => [queued, ...prev]);
      await loadData();
    } catch (e) {
      setError(e.message || 'Failed to generate lessons.');
    } finally {
      setBusy(false);
    }
  };

  const latestRun = runs[0];
  const isWorking = runs.some((r) => r.status === 'queued' || r.status === 'running') || busy;

  return (
    <div className="course-architect-container">
      {/* HEADER */}
      <div className="architect-header-row">
        <div>
          <h2>Course Planner</h2>
          <p>
            Automatically builds a structured syllabus from your indexed course documents, then drafts slide decks and quizzes.
          </p>
        </div>

        <div className={`planner-status-badge ${isWorking ? 'working' : blueprint?.status === 'approved' ? 'approved' : ''}`}>
          {isWorking ? 'Planning in progress…' : blueprint?.status === 'approved' ? 'Syllabus Approved' : blueprint ? 'Draft Ready' : 'Ready'}
        </div>
      </div>

      {/* PLANNER INPUT FORM */}
      <div className="planner-form-card">
        <div className="planner-form-label-row">
          <label htmlFor="planner-prompt">Syllabus Outline Prompt</label>
          <span className="planner-doc-count">
            {documentCount} source document{documentCount === 1 ? '' : 's'} available
          </span>
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
            <span>No documents uploaded for this course yet. Please upload course materials so the planner has source evidence.</span>
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
              All modules and slides are cited directly from your uploaded materials.
            </span>

            <button
              type="button"
              className="button button-primary"
              disabled={isWorking || !documentCount || !goal.trim()}
              onClick={handleRunArchitect}
            >
              {isWorking ? 'Generating Outline…' : 'Generate Course Outline'}
            </button>
          </div>
        )}

        {error && <div className="error-banner">{error}</div>}
      </div>

      {/* ACTIVITY / PROGRESS (WHEN RUNNING) */}
      {latestRun && (latestRun.status === 'running' || latestRun.status === 'queued' || latestRun.steps?.length > 0) && (
        <div className="planner-activity-card">
          <div className="activity-header">
            <span>Planner Activity</span>
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
                {step.detail && <small style={{ marginLeft: 'auto', opacity: 0.7 }}>{step.detail}</small>}
              </div>
            ))}
          </div>

          {latestRun.result?.artifacts && (
            <div className="planner-artifacts-row">
              <span>
                Generated: {latestRun.result.artifacts.modules} modules,{' '}
                {latestRun.result.artifacts.lecture_drafts} lecture decks,{' '}
                {latestRun.result.artifacts.quiz_drafts} quiz drafts.
              </span>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {latestRun.result.artifacts.lecture_drafts > 0 && onOpenLectures && (
                  <button
                    type="button"
                    className="button button-sm button-secondary"
                    onClick={onOpenLectures}
                  >
                    View Lectures →
                  </button>
                )}
                {latestRun.result.artifacts.quiz_drafts > 0 && onOpenQuizzes && (
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

      {/* SYLLABUS OUTLINE (STRUCTURED TABLE) */}
      {blueprint && (
        <div className="syllabus-card">
          <div className="syllabus-card-header">
            <div>
              <h3>{blueprint.title || 'Course Syllabus Outline'}</h3>
              <p>
                {blueprint.status === 'approved'
                  ? 'Syllabus approved. Ready to generate slide decks and quizzes.'
                  : 'Review the modules below. Once approved, you can create full lessons with slides and audio.'}
              </p>
            </div>

            <div className="syllabus-actions">
              {blueprint.status !== 'approved' ? (
                <button
                  type="button"
                  className="button button-primary"
                  disabled={isWorking}
                  onClick={handleApproveBlueprint}
                >
                  {busy ? 'Approving…' : 'Approve Syllabus'}
                </button>
              ) : (
                <button
                  type="button"
                  className="button button-primary"
                  disabled={isWorking}
                  onClick={handleProduceLessons}
                >
                  {isWorking ? 'Generating Lessons…' : 'Create Slide Decks & Quizzes →'}
                </button>
              )}
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
                    ? `Pages ${mod.evidence_pages.join(', ')}`
                    : 'Source-grounded'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
