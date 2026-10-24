import React, { useEffect, useState } from 'react';
import { generateCourseQuiz, getCourseQuizzes, publishCourseQuiz } from '../services/api';

const generationSteps = ['Retrieving course evidence', 'Designing questions at the right level', 'Preparing a reviewable draft'];

export default function QuizPanel({ courseId, onOpenCourseArchitect }) {
  const [quizzes, setQuizzes] = useState([]);
  const [topic, setTopic] = useState('');
  const [questionCount, setQuestionCount] = useState(5);
  const [difficulty, setDifficulty] = useState('intermediate');
  const [error, setError] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [publishingId, setPublishingId] = useState(null);
  const [expandedQuizId, setExpandedQuizId] = useState(null);

  const load = async () => {
    try {
      setQuizzes(await getCourseQuizzes(courseId));
    } catch (err) {
      setError(err.message || 'The assessment service is unavailable. Check that the backend is running and that you are signed in.');
    }
  };

  useEffect(() => { load(); }, [courseId]);

  const generate = async (event) => {
    event.preventDefault();
    try {
      setError('');
      setIsGenerating(true);
      await generateCourseQuiz(courseId, {
        topic: topic.trim(),
        question_count: Number(questionCount),
        difficulty,
      });
      setTopic('');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const publish = async (quizId) => {
    try {
      setError('');
      setPublishingId(quizId);
      await publishCourseQuiz(courseId, quizId);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setPublishingId(null);
    }
  };

  const reviewableQuizzes = quizzes.filter((quiz) => quiz.questions.length > 0);
  const planningPlaceholders = quizzes.filter((quiz) => quiz.questions.length === 0);
  const agentQuizzes = reviewableQuizzes.filter((quiz) => quiz.module_id);

  return (
    <div className="quiz-panel">
      <div className="quiz-panel-head assessment-agent-head">
        <div>
          <span className="eyebrow">ASSESSMENT AGENT</span>
          <h3>Evidence in. Meaningful assessment out.</h3>
          <p>Course Architect creates a draft assessment for every approved module. You stay in control of the final student release.</p>
        </div>
        <div className="assessment-agent-stat" aria-label={`${agentQuizzes.length} agent-produced assessment drafts`}>
          <b>{agentQuizzes.length}</b><span>agent-produced<br />draft{agentQuizzes.length === 1 ? '' : 's'}</span>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="quiz-grid">
        <form className="quiz-generator glass-card" onSubmit={generate}>
          <div className="agent-form-heading">
            <span className="agent-pulse" aria-hidden="true" />
            <div><h4>Direct Quiz Builder</h4><p>Need a targeted check? Ask the assessment agent for one. Nothing is shared until you approve it.</p></div>
          </div>
          <label>
            What should students be assessed on?
            <input placeholder="e.g. Process scheduling and context switching" value={topic} onChange={(event) => setTopic(event.target.value)} required disabled={isGenerating} />
          </label>
          <div className="quiz-config-row">
            <label>Difficulty
              <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)} disabled={isGenerating}>
                <option value="foundational">Foundational</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </label>
            <label>Questions
              <select value={questionCount} onChange={(event) => setQuestionCount(event.target.value)} disabled={isGenerating}>
                <option value="3">3 questions</option>
                <option value="5">5 questions</option>
                <option value="8">8 questions</option>
                <option value="10">10 questions</option>
              </select>
            </label>
          </div>
          {isGenerating && <div className="quiz-generation-steps" aria-live="polite">
            {generationSteps.map((step, index) => <span key={step}><b>{index + 1}</b>{step}</span>)}
          </div>}
          <button className="button button-primary" disabled={isGenerating}>
            {isGenerating ? 'Building quiz draft…' : 'Generate quiz with AI →'}
          </button>
        </form>

        <div className="quiz-list">
          {quizzes.length === 0 ? (
            <div className="quiz-empty glass-card">
              <span className="quiz-empty-kicker">NO MODULE ASSESSMENTS YET</span>
              <strong>Let Course Architect create the first assessment set.</strong>
              <p>It maps your uploaded material into modules, then Lesson Producer creates one source-grounded quiz draft per approved module.</p>
              <button type="button" className="button button-secondary" onClick={onOpenCourseArchitect}>Open Course Architect →</button>
            </div>
          ) : <>
            {planningPlaceholders.length > 0 && <div className="quiz-placeholder-note">
              <span aria-hidden="true">i</span><p><b>{planningPlaceholders.length} old planning {planningPlaceholders.length === 1 ? 'placeholder is' : 'placeholders are'} hidden from review.</b> They contain no questions and cannot be published. New Course Architect runs create complete drafts instead.</p>
            </div>}
            {reviewableQuizzes.map((quiz) => {
            const citedQuestions = quiz.questions.filter((question) => question.source_page).length;
            const agentProduced = Boolean(quiz.module_id);
            return (
              <article className={`quiz-card glass-card ${agentProduced ? 'quiz-card-agent' : ''}`} key={quiz.id}>
                <div className="quiz-card-top"><span className={`badge ${quiz.status === 'published' ? 'quiz-published' : 'lec-badge'}`}>{quiz.status}</span><span className="quiz-ai-label">{agentProduced ? 'Course Architect output' : 'Direct Quiz Builder'}</span></div>
                <h4>{quiz.title}</h4>
                <p>{quiz.questions.length} questions · {citedQuestions || quiz.questions.length} source-linked · {quiz.status === 'published' ? 'available to students' : 'professor review required'}</p>
                <div className="quiz-card-actions">
                  <button className="text-action" onClick={() => setExpandedQuizId(expandedQuizId === quiz.id ? null : quiz.id)}>{expandedQuizId === quiz.id ? 'Hide draft' : 'Review questions'}</button>
                  {quiz.status !== 'published' && <button className="button button-secondary" onClick={() => publish(quiz.id)} disabled={publishingId === quiz.id}>{publishingId === quiz.id ? 'Publishing…' : 'Approve & publish to students'}</button>}
                </div>
                {expandedQuizId === quiz.id && <div className="quiz-review-list">
                  {quiz.questions.map((question, index) => <section className="quiz-review-question" key={question.id}>
                    <div className="quiz-review-meta">QUESTION {index + 1}{question.source_page ? ` · SOURCE PAGE ${question.source_page}` : ''}</div>
                    <strong>{question.prompt}</strong>
                    <ol type="A">{question.options.map((option, optionIndex) => <li className={optionIndex === question.correct_option ? 'correct-option' : ''} key={`${question.id}-${optionIndex}`}>{option}</li>)}</ol>
                    <p><b>Why:</b> {question.explanation}</p>
                  </section>)}
                </div>}
              </article>
            );
            })}
          </>}
        </div>
      </div>
    </div>
  );
}
