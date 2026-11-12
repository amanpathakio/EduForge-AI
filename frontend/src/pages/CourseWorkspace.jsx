import React, { useState, useEffect, useCallback } from 'react';
import UploadPanel from '../components/UploadPanel';
import ChatPanel from '../components/ChatPanel';
import QuizPanel from '../components/QuizPanel';
import StudentQuizPlayer from '../components/StudentQuizPlayer';
import CourseArchitectPanel from '../components/CourseArchitectPanel';
import {
  getCourseDocuments,
  uploadCourseDocument,
  getCourseLectures,
  getLecture,
  publishLecture,
  sendCourseChatMessage,
  getCourseInvites,
  createCourseInvite,
  revokeCourseInvite,
  getCourseStudents,
  removeCourseStudent,
} from '../services/api';

export default function CourseWorkspace({
  course,
  isEducator = false,
  onBackToCourses,
  onOpenStudioForCourse,
  onOpenCitation,
  onOpenLecture,
}) {
  const canManage = Boolean(isEducator || course?.my_role === 'professor');
  const [activeTab, setActiveTab] = useState('overview');
  const [documents, setDocuments] = useState([]);
  const [lectures, setLectures] = useState([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [isLoadingLectures, setIsLoadingLectures] = useState(false);

  // Student read-only lecture reader state
  const [readingLecture, setReadingLecture] = useState(null);
  const [readingSlideIdx, setReadingSlideIdx] = useState(0);
  const [isLoadingReader, setIsLoadingReader] = useState(false);
  const [publishingLectureId, setPublishingLectureId] = useState(null);

  // Educator invites & roster state
  const [invites, setInvites] = useState([]);
  const [students, setStudents] = useState([]);
  const [isLoadingRoster, setIsLoadingRoster] = useState(false);
  const [copiedCodeId, setCopiedCodeId] = useState(null);
  const [rosterError, setRosterError] = useState('');

  const loadDocuments = useCallback(async () => {
    try {
      setIsLoadingDocs(true);
      const docs = await getCourseDocuments(course.id);
      setDocuments(docs);
    } catch (err) {
      console.warn('Failed to load course documents:', err);
    } finally {
      setIsLoadingDocs(false);
    }
  }, [course.id]);

  const loadLectures = useCallback(async () => {
    try {
      setIsLoadingLectures(true);
      const lecs = await getCourseLectures(course.id);
      setLectures(lecs);
    } catch (err) {
      console.warn('Failed to load course lectures:', err);
    } finally {
      setIsLoadingLectures(false);
    }
  }, [course.id]);

  const loadRosterAndInvites = useCallback(async () => {
    if (!canManage) return;
    try {
      setIsLoadingRoster(true);
      setRosterError('');
      const [invList, studList] = await Promise.all([
        getCourseInvites(course.id),
        getCourseStudents(course.id),
      ]);
      setInvites(invList);
      setStudents(studList);
    } catch (err) {
      setRosterError(err.message || 'Could not load roster or invite codes.');
    } finally {
      setIsLoadingRoster(false);
    }
  }, [canManage, course.id]);

  useEffect(() => {
    setReadingLecture(null);
    setActiveTab('overview');
    loadDocuments();
    loadLectures();
    if (canManage) {
      loadRosterAndInvites();
    }
  }, [loadDocuments, loadLectures, loadRosterAndInvites, canManage]);

  const handleDocumentUploaded = () => {
    loadDocuments();
  };

  const handleCourseUpload = (file, onProgress) => {
    return uploadCourseDocument(course.id, file, onProgress);
  };

  const handleCourseChat = (queryText) => {
    return sendCourseChatMessage(course.id, queryText);
  };

  const handlePublishLecture = async (lectureId) => {
    try {
      setPublishingLectureId(lectureId);
      await publishLecture(lectureId);
      await loadLectures();
    } catch (err) {
      console.warn('Failed to publish lecture:', err);
    } finally {
      setPublishingLectureId(null);
    }
  };

  const handleOpenStudentLecture = async (lectureId) => {
    try {
      setIsLoadingReader(true);
      const full = await getLecture(lectureId);
      setReadingLecture(full);
      setReadingSlideIdx(0);
    } catch (err) {
      console.warn('Failed to load published lecture:', err);
    } finally {
      setIsLoadingReader(false);
    }
  };

  const handleCreateInvite = async () => {
    try {
      setRosterError('');
      await createCourseInvite(course.id);
      await loadRosterAndInvites();
    } catch (err) {
      setRosterError(err.message || 'Could not create invite code.');
    }
  };

  const handleCopyInvite = async (invite) => {
    try {
      await navigator.clipboard.writeText(invite.code);
      setCopiedCodeId(invite.id);
      window.setTimeout(() => setCopiedCodeId(null), 1800);
    } catch {
      setCopiedCodeId(invite.id);
    }
  };

  const handleRevokeInvite = async (inviteId) => {
    try {
      await revokeCourseInvite(course.id, inviteId);
      await loadRosterAndInvites();
    } catch (err) {
      setRosterError(err.message || 'Could not revoke invite code.');
    }
  };

  const handleRemoveStudent = async (userId) => {
    try {
      await removeCourseStudent(course.id, userId);
      await loadRosterAndInvites();
    } catch (err) {
      setRosterError(err.message || 'Could not remove student.');
    }
  };

  const activeSlide = readingLecture?.slides?.[readingSlideIdx] || null;

  return (
    <div className="course-workspace-container">
      {/* Course Top Header */}
      <div className="course-header glass-card">
        <div className="course-header-left">
          <button
            className="back-btn"
            onClick={onBackToCourses}
            title="Back to Courses"
          >
            ← {canManage ? 'All Courses' : 'My Courses'}
          </button>
          <div className="course-title-section">
            <span className="badge course-badge">{canManage ? 'Educator Workspace' : 'Enrolled Course'}</span>
            <h1 className="course-main-title">{course.title}</h1>
            {course.description && (
              <p className="course-main-desc">{course.description}</p>
            )}
          </div>
        </div>

        {canManage && (
          <div className="course-header-actions">
            <button
              className="button button-secondary"
              onClick={() => setActiveTab('roster')}
            >
              Invite Students
            </button>
            <button
              className="button button-primary"
              onClick={() => onOpenStudioForCourse(course)}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ width: 18, height: 18, marginRight: 6 }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
              </svg>
              Generate Lecture
            </button>
          </div>
        )}
      </div>

      {/* Workspace Tabs Navigation */}
      <div className="workspace-tabs-bar">
        <button
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        {canManage && (
          <button
            className={`tab-btn ${activeTab === 'documents' ? 'active' : ''}`}
            onClick={() => setActiveTab('documents')}
          >
            Documents ({documents.length})
          </button>
        )}
        <button
          className={`tab-btn ${activeTab === 'ask-ai' ? 'active' : ''}`}
          onClick={() => setActiveTab('ask-ai')}
        >
          Ask AI (Course Tutor)
        </button>
        <button
          className={`tab-btn ${activeTab === 'lectures' ? 'active' : ''}`}
          onClick={() => setActiveTab('lectures')}
        >
          {canManage ? `Lectures (${lectures.length})` : `Published Lectures (${lectures.length})`}
        </button>
        {canManage && (
          <button className={`tab-btn ${activeTab === 'architect' ? 'active' : ''}`} onClick={() => setActiveTab('architect')}>
            Course Architect
          </button>
        )}
        <button className={`tab-btn ${activeTab === 'quizzes' ? 'active' : ''}`} onClick={() => setActiveTab('quizzes')}>
          {canManage ? 'Quizzes' : 'Practice Quizzes'}
        </button>
        {canManage && (
          <button className={`tab-btn ${activeTab === 'roster' ? 'active' : ''}`} onClick={() => setActiveTab('roster')}>
            Roster &amp; Invites ({students.length})
          </button>
        )}
      </div>

      {/* Tab Contents */}
      <div className="workspace-tab-content">
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="overview-tab-view">
            <div className="overview-stats-grid">
              <div className="stat-card glass-card">
                <span className="stat-label">Course Resources</span>
                <span className="stat-value">{documents.length}</span>
                <span className="stat-sub">PDF lecture materials indexed</span>
              </div>
              <div className="stat-card glass-card">
                <span className="stat-label">{canManage ? 'Course Lectures' : 'Published Lectures'}</span>
                <span className="stat-value">{lectures.length}</span>
                <span className="stat-sub">{canManage ? 'Drafts & published modules' : 'Approved by professor'}</span>
              </div>
              <div className="stat-card glass-card">
                <span className="stat-label">{canManage ? 'Enrolled Students' : 'Source Pages Indexed'}</span>
                <span className="stat-value">
                  {canManage ? students.length : documents.reduce((acc, d) => acc + (d.pages_count || 0), 0)}
                </span>
                <span className="stat-sub">{canManage ? 'Active learners in course' : 'Verified pages available for citations'}</span>
              </div>
            </div>

            <div className="overview-actions-grid">
              {canManage && (
                <div className="action-card glass-card" onClick={() => setActiveTab('documents')}>
                  <div className="action-icon">📄</div>
                  <h3>Upload Course Materials</h3>
                  <p>Drag and drop lecture PDFs to ground student questions and lecture synthesis.</p>
                  <span className="action-link">Manage Documents →</span>
                </div>
              )}

              <div className="action-card glass-card" onClick={() => setActiveTab('ask-ai')}>
                <div className="action-icon">💬</div>
                <h3>Ask Course Tutor</h3>
                <p>Chat with AI grounded strictly in this course&apos;s documents with verified page citations.</p>
                <span className="action-link">Open Tutor →</span>
              </div>

              {canManage ? (
                <>
                  <div className="action-card glass-card" onClick={() => onOpenStudioForCourse(course)}>
                    <div className="action-icon">🎙️</div>
                    <h3>AI Lecture Studio</h3>
                    <p>Synthesize grounded, slide-by-slide lectures with speaker notes and citations.</p>
                    <span className="action-link">Open Studio →</span>
                  </div>
                  <div className="action-card glass-card" onClick={() => setActiveTab('roster')}>
                    <div className="action-icon">🔑</div>
                    <h3>Invite &amp; Manage Students</h3>
                    <p>Share invite codes like EF-XXXXXX and monitor enrolled learners&apos; quiz accuracy.</p>
                    <span className="action-link">Open Roster →</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="action-card glass-card" onClick={() => setActiveTab('lectures')}>
                    <div className="action-icon">📑</div>
                    <h3>Review Published Lectures</h3>
                    <p>Study slide decks approved by your professor with direct page-source citations.</p>
                    <span className="action-link">View Lectures →</span>
                  </div>
                  <div className="action-card glass-card" onClick={() => setActiveTab('quizzes')}>
                    <div className="action-icon">✓</div>
                    <h3>Practice Quizzes</h3>
                    <p>Complete professor-approved assessments and verify explanations from course pages.</p>
                    <span className="action-link">Start Practice →</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {activeTab === 'architect' && canManage && (
          <CourseArchitectPanel courseId={course.id} documentCount={documents.length} onOpenQuizzes={() => setActiveTab('quizzes')} />
        )}

        {/* DOCUMENTS TAB */}
        {activeTab === 'documents' && canManage && (
          <div className="documents-tab-view">
            <div className="workspace-doc-layout">
              <div className="doc-upload-col">
                <UploadPanel
                  onUploadSuccess={handleDocumentUploaded}
                  customUploader={handleCourseUpload}
                />
              </div>

              <div className="doc-list-col glass-card">
                <div className="doc-list-header">
                  <h3>Indexed Course Documents</h3>
                  <span className="meta-pill">{documents.length} files</span>
                </div>

                {isLoadingDocs ? (
                  <div className="loading-state">Loading documents...</div>
                ) : documents.length === 0 ? (
                  <div className="empty-substate">
                    <p>No documents uploaded to this course yet.</p>
                    <p className="sub-text">Upload a PDF on the left to index course content.</p>
                  </div>
                ) : (
                  <div className="doc-items-container">
                    {documents.map((doc) => (
                      <div key={doc.id} className="doc-item-row">
                        <div className="doc-icon-badge">PDF</div>
                        <div className="doc-info-block">
                          <span className="doc-filename">{doc.filename}</span>
                          <span className="doc-meta-info">
                            {doc.pages_count} pages · {doc.chunks_count} vector chunks · Uploaded {new Date(doc.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <span className="doc-status-badge">Indexed</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ASK AI TAB */}
        {activeTab === 'ask-ai' && (
          <div className="ask-ai-tab-view">
            <ChatPanel
              onOpenCitation={onOpenCitation}
              customChatSender={handleCourseChat}
              courseContext={course}
            />
          </div>
        )}

        {/* LECTURES TAB */}
        {activeTab === 'lectures' && (
          <div className="lectures-tab-view">
            {readingLecture && !canManage ? (
              <div className="glass-card published-lecture-reader">
                <div className="reader-head">
                  <button type="button" className="back-btn" onClick={() => setReadingLecture(null)}>
                    ← All Published Lectures
                  </button>
                  <span className="meta-pill">
                    Slide {readingSlideIdx + 1} / {readingLecture.slides?.length || 0}
                  </span>
                </div>
                <h2>{readingLecture.title}</h2>
                {activeSlide ? (
                  <div className="reader-slide-box">
                    <div className="reader-slide-meta">
                      <span>SLIDE {String(activeSlide.slide_number).padStart(2, '0')}</span>
                      <span>{readingLecture.difficulty}</span>
                    </div>
                    <h3>{activeSlide.title}</h3>
                    <ul className="reader-bullets">
                      {(activeSlide.content || []).map((pt, idx) => (
                        <li key={idx}>{pt}</li>
                      ))}
                    </ul>
                    {activeSlide.citations?.length > 0 && (
                      <div className="reader-citations">
                        <span>Grounded Sources:</span>
                        {activeSlide.citations.map((cit) => (
                          <button
                            key={cit.id}
                            type="button"
                            className="wb-cit-pill"
                            onClick={() => onOpenCitation && onOpenCitation(cit)}
                          >
                            {cit.filename} · p.{cit.page_number || '?'}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="reader-nav">
                      <button
                        type="button"
                        className="button button-secondary"
                        disabled={readingSlideIdx <= 0}
                        onClick={() => setReadingSlideIdx((i) => Math.max(0, i - 1))}
                      >
                        ← Previous Slide
                      </button>
                      <button
                        type="button"
                        className="button button-primary"
                        disabled={!readingLecture.slides || readingSlideIdx >= readingLecture.slides.length - 1}
                        onClick={() => setReadingSlideIdx((i) => i + 1)}
                      >
                        Next Slide →
                      </button>
                    </div>
                  </div>
                ) : (
                  <p>No slides found in this lecture.</p>
                )}
              </div>
            ) : (
              <>
                <div className="lectures-view-header">
                  <div>
                    <h3>{canManage ? 'Course Lectures' : 'Published Lectures'}</h3>
                    <p>
                      {canManage
                        ? 'Draft and publish lectures generated from course documents.'
                        : 'Lectures reviewed and published by your professor.'}
                    </p>
                  </div>
                  {canManage && (
                    <button
                      className="button button-primary"
                      onClick={() => onOpenStudioForCourse(course)}
                    >
                      + New Lecture
                    </button>
                  )}
                </div>

                {isLoadingLectures || isLoadingReader ? (
                  <div className="loading-state">Loading lectures...</div>
                ) : lectures.length === 0 ? (
                  <div className="empty-substate glass-card">
                    <div className="empty-icon">🎙️</div>
                    <h4>{canManage ? 'No Lectures Generated Yet' : 'No Published Lectures Yet'}</h4>
                    <p>
                      {canManage
                        ? 'Use Lecture Studio to synthesize a full slide deck with citations from your course PDFs.'
                        : 'Your professor has not published a lecture deck for this course yet.'}
                    </p>
                    {canManage && (
                      <button
                        className="button button-primary"
                        onClick={() => onOpenStudioForCourse(course)}
                        style={{ marginTop: '1rem' }}
                      >
                        Generate First Lecture
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="lectures-grid">
                    {lectures.map((lec) => (
                      <div key={lec.id} className="lecture-card glass-card">
                        <div className="lecture-card-body">
                          <div className="lec-status-bar">
                            <span className={`badge lec-badge ${lec.status === 'published' ? 'published' : ''}`}>
                              {lec.status || 'draft'}
                            </span>
                            <span className="meta-pill">{lec.difficulty}</span>
                          </div>
                          <h4 className="lec-title">{lec.title}</h4>
                          <p className="lec-topic">Topic: {lec.topic}</p>
                          {lec.learning_objectives && lec.learning_objectives.length > 0 && (
                            <ul className="lec-objectives-preview">
                              {lec.learning_objectives.slice(0, 2).map((obj, i) => (
                                <li key={i}>{obj}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <div className="lecture-card-footer">
                          <span className="meta-pill">
                            ⏱️ {lec.duration_minutes} min · 📑 {lec.slide_count || 0} slides
                          </span>
                          <div style={{ display: 'flex', gap: '0.45rem' }}>
                            {canManage && lec.status !== 'published' && (
                              <button
                                className="button button-primary button-sm"
                                disabled={publishingLectureId === lec.id}
                                onClick={() => handlePublishLecture(lec.id)}
                              >
                                {publishingLectureId === lec.id ? 'Publishing…' : 'Publish'}
                              </button>
                            )}
                            <button
                              className="button button-secondary"
                              onClick={() =>
                                canManage ? onOpenLecture(lec.id, course) : handleOpenStudentLecture(lec.id)
                              }
                            >
                              {canManage ? 'Open Editor →' : 'Open Deck →'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* QUIZZES TAB */}
        {activeTab === 'quizzes' && (
          canManage ? (
            <QuizPanel courseId={course.id} onOpenCourseArchitect={() => setActiveTab('architect')} />
          ) : (
            <StudentQuizPlayer course={course} />
          )
        )}

        {/* ROSTER & INVITES TAB (Educator Only) */}
        {activeTab === 'roster' && canManage && (
          <div className="roster-grid">
            <section className="glass-card roster-panel">
              <div className="roster-panel-head">
                <div>
                  <span className="eyebrow">COURSE INVITE CODES</span>
                  <h3>Share with students to join</h3>
                </div>
                <button type="button" className="button button-primary" onClick={handleCreateInvite}>
                  + New Invite Code
                </button>
              </div>
              {rosterError && <div className="error-banner">{rosterError}</div>}
              {isLoadingRoster ? (
                <div className="loading-state">Loading invite codes...</div>
              ) : invites.length === 0 ? (
                <p className="sub-text">No active invite codes yet. Generate one so students can join this course.</p>
              ) : (
                <div className="invite-code-list">
                  {invites.map((inv) => (
                    <div key={inv.id} className="invite-code-row">
                      <div>
                        <code className="invite-code-chip">{inv.code}</code>
                        <small>{inv.uses_count} enrollment{inv.uses_count === 1 ? '' : 's'}</small>
                      </div>
                      <div className="invite-row-actions">
                        <button
                          type="button"
                          className="button button-secondary button-sm"
                          onClick={() => handleCopyInvite(inv)}
                        >
                          {copiedCodeId === inv.id ? 'Copied ✓' : 'Copy Code'}
                        </button>
                        <button
                          type="button"
                          className="button button-danger button-sm"
                          onClick={() => handleRevokeInvite(inv.id)}
                        >
                          Revoke
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="glass-card roster-panel">
              <div className="roster-panel-head">
                <div>
                  <span className="eyebrow">ENROLLED LEARNERS</span>
                  <h3>Class Roster ({students.length})</h3>
                </div>
              </div>
              {isLoadingRoster ? (
                <div className="loading-state">Loading roster...</div>
              ) : students.length === 0 ? (
                <p className="sub-text">No students have joined yet. Share an invite code on the left to enroll students.</p>
              ) : (
                <div className="student-roster-list">
                  {students.map((st) => (
                    <div key={st.user_id} className="roster-student-row">
                      <div>
                        <b>{st.full_name || st.email}</b>
                        <small>
                          {st.email} · {st.quiz_attempts_count} quiz answer{st.quiz_attempts_count === 1 ? '' : 's'} ({st.correct_answers_count} correct)
                        </small>
                      </div>
                      <button
                        type="button"
                        className="button button-secondary button-sm"
                        onClick={() => handleRemoveStudent(st.user_id)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
