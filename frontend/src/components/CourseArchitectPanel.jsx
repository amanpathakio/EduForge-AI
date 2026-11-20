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
  onCourseUpdated,
}) {
  const [runs, setRuns] = useState([]);
  const [blueprint, setBlueprint] = useState(null);
  const [goal, setGoal] = useState(
    'Organize this course into a progressive, multi-week syllabus with clear module objectives and practice assessments.'
  );
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

  const handleGenerateCurriculum = async () => {
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
      setError(e.message || 'Failed to generate course curriculum.');
    } finally {
      setBusy(false);
    }
  };

  const handleSynthesizeMaterials = async () => {
    if (!blueprint?.id || busy) return;
    try {
      setBusy(true);
      setError('');
      // Auto-approve blueprint so the user never gets an approval block
      if (blueprint.status !== 'approved') {
        const approved = await approveCourseBlueprint(courseId, blueprint.id);
        setBlueprint(approved);
      }
      const queued = await produceBlueprintLessons(courseId, blueprint.id);
      setRuns((prev) => [queued, ...prev]);
      await loadData();
      onCourseUpdated?.();
    } catch (e) {
      setError(e.message || 'Failed to synthesize course materials.');
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

  const hasBlueprint = Boolean(blueprint && blueprint.modules?.length > 0);
  const hasSynthesized = Boolean(hasProducedLessons || latestRun?.result?.artifacts?.lecture_drafts > 0);

  return (
    <div className="course-architect-workspace">
      {error && <div className="error-banner">{error}</div>}

      {/* TOP DIRECTIVE SUMMARY / EDIT FORM */}
      {hasBlueprint && !isEditingPrompt ? (
        <div className="architect-directive-summary">
          <div className="directive-text-wrap">
            <span className="directive-label">Syllabus Directive</span>
            <span>{goal}</span>
          </div>
          <button
            type="button"
            className="directive-btn-link"
            onClick={() => setIsEditingPrompt(true)}
            disabled={isWorking}
          >
            Edit Directives
          </button>
        </div>
      ) : (
        <div className="architect-window-card">
          <div className="architect-card-header">
            <div className="architect-header-meta">
              <h3 className="architect-header-title">
                {hasBlueprint ? 'Modify Syllabus Directive' : 'Curriculum Architecture'}
              </h3>
            </div>
            <span className="directive-doc-indicator">
              {documentCount} source document{documentCount === 1 ? '' : 's'} indexed
            </span>
          </div>

          <div className="architect-card-body">
            <div className="architect-directive-form">
              <textarea
                className="architect-textarea"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                disabled={isWorking}
                rows={3}
                placeholder="Specify structural goals, module count, and target learning objectives..."
              />

              {documentCount === 0 ? (
                <div className="no-docs-banner">
                  <span>Upload course documents before generating curriculum architecture.</span>
                  {onOpenDocuments && (
                    <button
                      type="button"
                      className="arch-btn-secondary"
                      onClick={onOpenDocuments}
                    >
                      Upload Documents →
                    </button>
                  )}
                </div>
              ) : (
                <div className="directive-form-actions">
                  <span className="directive-hint">
                    Syllabus modules and learning goals are derived directly from course literature.
                  </span>

                  <div style={{ display: 'flex', gap: '0.65rem' }}>
                    {hasBlueprint && (
                      <button
                        type="button"
                        className="arch-btn-secondary"
                        onClick={() => setIsEditingPrompt(false)}
                        disabled={isWorking}
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      type="button"
                      className="arch-btn-primary"
                      disabled={isWorking || !documentCount || !goal.trim()}
                      onClick={handleGenerateCurriculum}
                    >
                      {isWorking ? 'Structuring Curriculum…' : hasBlueprint ? 'Update Syllabus Arc' : 'Generate Course Curriculum →'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* LIVE AGENT ACTIVITY TERMINAL (WHEN WORKING) */}
      {latestRun && (latestRun.status === 'running' || latestRun.status === 'queued' || latestRun.steps?.length > 0) && (
        <div className="architect-console-card">
          <div className="console-card-head">
            <span>Planner Agent Execution</span>
            <span>{new Date(latestRun.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>

          <div className="console-step-list">
            {latestRun.steps?.map((step) => (
              <div key={step.id || step.position} className={`console-step-item ${step.status}`}>
                <span className="console-step-dot" />
                <span>{step.title}</span>
                {step.detail && <small style={{ marginLeft: 'auto', opacity: 0.7 }}>{step.detail}</small>}
              </div>
            ))}
          </div>

          {latestRun.result?.artifacts && (
            <div className="console-artifacts-bar">
              <span>
                Generated: {latestRun.result.artifacts.modules || 4} modules,{' '}
                {latestRun.result.artifacts.lecture_drafts || 4} lecture decks,{' '}
                {latestRun.result.artifacts.quiz_drafts || 4} practice quizzes.
              </span>
            </div>
          )}
        </div>
      )}

      {/* SYLLABUS DOCUMENT & LESSON ACTIONS (MAIN WORKSPACE VIEW) */}
      {hasBlueprint ? (
        <div className="architect-window-card">
          <div className="architect-card-header">
            <div>
              <h3 className="architect-header-title">{blueprint.title || 'Course Syllabus Architecture'}</h3>
              <span className="architect-header-tag">
                {blueprint.modules.length} Modules · Grounded in course documents
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              {hasSynthesized ? (
                <>
                  {onOpenLectures && (
                    <button
                      type="button"
                      className="arch-btn-secondary"
                      onClick={onOpenLectures}
                    >
                      View Lectures ({blueprint.modules.length}) →
                    </button>
                  )}
                  {onOpenQuizzes && (
                    <button
                      type="button"
                      className="arch-btn-secondary"
                      onClick={onOpenQuizzes}
                    >
                      View Quizzes ({blueprint.modules.length}) →
                    </button>
                  )}
                  <button
                    type="button"
                    className="arch-btn-primary"
                    disabled={isWorking}
                    onClick={handleSynthesizeMaterials}
                  >
                    {isLessonProducerWorking ? 'Synthesizing…' : 'Re-synthesize Materials'}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="arch-btn-primary"
                  disabled={isWorking}
                  onClick={handleSynthesizeMaterials}
                >
                  {isLessonProducerWorking ? 'Synthesizing Lectures & Quizzes…' : 'Synthesize Lectures & Quizzes →'}
                </button>
              )}
            </div>
          </div>

          <table className="syllabus-document-table">
            <thead className="syllabus-table-head">
              <tr>
                <th>Module</th>
                <th>Syllabus Scope &amp; Learning Objectives</th>
                <th style={{ textAlign: 'right' }}>Source Citation</th>
              </tr>
            </thead>
            <tbody>
              {blueprint.modules.map((mod) => (
                <tr key={mod.id || mod.position} className="syllabus-table-row">
                  <td className="syllabus-cell-num">
                    {String(mod.position).padStart(2, '0')}
                  </td>
                  <td className="syllabus-cell-main">
                    <strong className="syllabus-module-title">{mod.title}</strong>
                    <span className="syllabus-module-obj">{mod.objective}</span>
                  </td>
                  <td className="syllabus-cell-evidence">
                    {mod.evidence_pages?.length > 0
                      ? `pp. ${mod.evidence_pages.join(', ')}`
                      : 'Source-grounded'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !isWorking && (
        <div className="architect-window-card">
          <div className="architect-empty-state">
            <h4 className="empty-state-title">No Syllabus Outline Generated</h4>
            <p className="empty-state-desc">
              Define your curriculum directives above to synthesize a structured syllabus, module learning objectives, and initial course drafts from your course literature.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
