import React, { useEffect, useState } from 'react';
import { generateCourseQuiz, getCourseQuizzes, publishCourseQuiz } from '../services/api';

const generationSteps = ['Retrieving course evidence', 'Designing questions at the right level', 'Preparing a reviewable draft'];

export default function QuizPanel({ courseId }) {
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
    } catch {
      setError('The quiz service is unavailable. Start the backend to generate and publish quizzes.');
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

  return (
    <div className="quiz-panel">
      <div className="quiz-panel-head">
        <div>
          <span className="eyebrow">ASSESSMENT AGENT</span>
          <h3>Generate a source-grounded quiz</h3>
          <p>Choose the topic and difficulty. EduForge turns uploaded material into a professor-reviewable draft.</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="quiz-grid">
        <form className="quiz-generator glass-card" onSubmit={generate}>
          <div className="agent-form-heading">
            <span className="agent-pulse" aria-hidden="true" />
            <div><h4>Build from your course evidence</h4><p>Nothing is shared with students until you approve it.</p></div>
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
              <strong>Your assessment workspace is ready.</strong>
              <p>Upload course material first, then generate a quiz from a topic it covers.</p>
            </div>
          ) : quizzes.map((quiz) => {
            const citedQuestions = quiz.questions.filter((question) => question.source_page).length;
            return (
              <article className="quiz-card glass-card" key={quiz.id}>
                <div className="quiz-card-top"><span className={`badge ${quiz.status === 'published' ? 'quiz-published' : 'lec-badge'}`}>{quiz.status}</span><span className="quiz-ai-label">AI draft</span></div>
                <h4>{quiz.title}</h4>
                <p>{quiz.questions.length} questions · {citedQuestions || quiz.questions.length} source-linked · professor review required</p>
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
        </div>
      </div>
    </div>
  );
}
