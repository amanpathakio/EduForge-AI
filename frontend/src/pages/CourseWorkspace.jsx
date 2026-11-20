import React, { useState, useEffect, useCallback } from 'react';
import UploadPanel from '../components/UploadPanel';
import ChatPanel from '../components/ChatPanel';
import QuizPanel from '../components/QuizPanel';
import StudentQuizPlayer from '../components/StudentQuizPlayer';
import CourseArchitectPanel from '../components/CourseArchitectPanel';
import VoiceLectureChat from '../components/VoiceLectureChat';
import VideoLecturePlayer from '../components/VideoLecturePlayer';
import VoiceCloneModal from '../components/VoiceCloneModal';
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
  const [showReaderVoiceChat, setShowReaderVoiceChat] = useState(true);
  const [documents, setDocuments] = useState([]);
  const [lectures, setLectures] = useState([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [isLoadingLectures, setIsLoadingLectures] = useState(false);

  // Student read-only lecture reader state
  const [readingLecture, setReadingLecture] = useState(null);
  const [readingSlideIdx, setReadingSlideIdx] = useState(0);
  const [isLoadingReader, setIsLoadingReader] = useState(false);
  const [publishingLectureId, setPublishingLectureId] = useState(null);
  const [videoLectureTarget, setVideoLectureTarget] = useState(null);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState(null);

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

  // Auto-refresh relevant data whenever switching tabs so user never needs a browser refresh
  useEffect(() => {
    if (activeTab === 'lectures') {
      loadLectures();
    } else if (activeTab === 'documents') {
      loadDocuments();
    } else if (activeTab === 'roster' && canManage) {
      loadRosterAndInvites();
    }
  }, [activeTab, loadLectures, loadDocuments, loadRosterAndInvites, canManage]);

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
          <div className="course-meta-topline">
            <button
              className="back-btn"
              onClick={onBackToCourses}
              title="Back to Courses"
            >
              ← {canManage ? 'All Courses' : 'My Courses'}
            </button>
            <span className="badge course-badge">{canManage ? 'Educator Workspace' : 'Enrolled Course'}</span>
          </div>
          <h1 className="course-main-title">{course.title}</h1>
          {course.description && (
            <p className="course-main-desc">{course.description}</p>
          )}
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
            Course Planner
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
                  <div className="action-icon-svg indigo">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  </div>
                  <h3>Upload PDFs</h3>
                  <p>Ground tutor &amp; slides in course PDFs.</p>
                  <span className="action-link">Manage Documents →</span>
                </div>
              )}

              <div className="action-card glass-card" onClick={() => setActiveTab('ask-ai')}>
                <div className="action-icon-svg blue">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <h3>Course Tutor</h3>
                <p>Page-cited Q&amp;A scoped to this syllabus.</p>
                <span className="action-link">Open Tutor →</span>
              </div>

              {canManage ? (
                <>
                  <div className="action-card glass-card" onClick={() => onOpenStudioForCourse(course)}>
                    <div className="action-icon-svg violet">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      </svg>
                    </div>
                    <h3>Lecture Studio</h3>
                    <p>Build grounded decks &amp; speaker notes.</p>
                    <span className="action-link">Open Studio →</span>
                  </div>
                  <div className="action-card glass-card" onClick={() => setActiveTab('architect')}>
                    <div className="action-icon-svg amber">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="12 2 2 7 12 12 22 7 12 2" />
                        <polyline points="2 17 12 22 22 17" />
                        <polyline points="2 12 12 17 22 12" />
                      </svg>
                    </div>
                    <h3>Course Planner</h3>
                    <p>Structure syllabus modules &amp; slide drafts.</p>
                    <span className="action-link">Open Planner →</span>
                  </div>
                  <div className="action-card glass-card" onClick={() => setActiveTab('roster')}>
                    <div className="action-icon-svg emerald">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                    </div>
                    <h3>Roster &amp; Invites</h3>
                    <p>Share invite codes &amp; track progress.</p>
                    <span className="action-link">Open Roster →</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="action-card glass-card" onClick={() => setActiveTab('lectures')}>
                    <div className="action-icon-svg violet">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                        <line x1="8" y1="21" x2="16" y2="21" />
                        <line x1="12" y1="17" x2="12" y2="21" />
                      </svg>
                    </div>
                    <h3>Published Lectures</h3>
                    <p>Review professor-approved decks.</p>
                    <span className="action-link">View Lectures →</span>
                  </div>
                  <div className="action-card glass-card" onClick={() => setActiveTab('quizzes')}>
                    <div className="action-icon-svg emerald">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <h3>Practice Quizzes</h3>
                    <p>Test understanding with cited feedback.</p>
                    <span className="action-link">Start Practice →</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {activeTab === 'architect' && canManage && (
          <CourseArchitectPanel
            courseId={course.id}
            documentCount={documents.length}
            onOpenQuizzes={() => setActiveTab('quizzes')}
            onOpenLectures={() => {
              loadLectures();
              setActiveTab('lectures');
            }}
            onOpenDocuments={() => {
              loadDocuments();
              setActiveTab('documents');
            }}
            onCourseUpdated={() => {
              loadLectures();
              loadDocuments();
            }}
          />
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                    <button
                      type="button"
                      className="button button-sm button-primary"
                      onClick={() => setVideoLectureTarget({ id: readingLecture.id, title: readingLecture.title })}
                      title="Watch full synchronized 16:9 video lecture"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 5 }}>
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                      Watch Video
                    </button>
                    <button
                      type="button"
                      className={`button button-sm ${showReaderVoiceChat ? 'button-primary' : 'button-secondary'}`}
                      onClick={() => setShowReaderVoiceChat((v) => !v)}
                    >
                      {showReaderVoiceChat ? 'Hide Voice Chat' : 'Voice Chat'}
                    </button>
                    <span className="meta-pill">
                      Slide {readingSlideIdx + 1} / {readingLecture.slides?.length || 0}
                    </span>
                  </div>
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

                {showReaderVoiceChat && activeSlide && (
                  <VoiceLectureChat
                    key={`student-voice-${readingLecture.id}-${activeSlide.id || readingSlideIdx}`}
                    courseId={course.id}
                    lectureTitle={readingLecture.title}
                    slide={activeSlide}
                    roleLabel="LECTURE VOICE CHAT"
                    onOpenCitation={onOpenCitation}
                    onClose={() => setShowReaderVoiceChat(false)}
                  />
                )}
              </div>
            ) : (
              <>
                <div className="lectures-view-header">
                  <div>
                    <h3>{canManage ? 'Course Lectures' : 'Published Lectures'}</h3>
                    <p>
                      {canManage
                        ? 'Drafts & published modules.'
                        : 'Approved decks from your professor.'}
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
                  <div className="empty-substate glass-card clean-empty">
                    <div className="empty-svg-badge" aria-hidden="true">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      </svg>
                    </div>
                    <h4>{canManage ? 'No lectures yet' : 'No published lectures yet'}</h4>
                    <p className="clean-empty-sub">
                      {canManage
                        ? 'Synthesize a grounded slide deck from course PDFs.'
                        : 'Check back once your professor publishes a deck.'}
                    </p>
                    {canManage && (
                      <button
                        className="button button-primary"
                        onClick={() => onOpenStudioForCourse(course)}
                      >
                        Generate Lecture
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
                            {lec.duration_minutes}m · {lec.slide_count || 0} slides
                          </span>
                          <div style={{ display: 'flex', gap: '0.45rem' }}>
                            <button
                              type="button"
                              className="button button-secondary button-sm"
                              onClick={() => setVideoLectureTarget({ id: lec.id, title: lec.title })}
                              title="Watch Synchronized Video Lecture"
                            >
                              ▶ Video
                            </button>
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
                <p className="sub-text">No active codes yet.</p>
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
                <p className="sub-text">No learners enrolled yet.</p>
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
        {/* VIDEO LECTURE PLAYER & VOICE MODAL */}
        {videoLectureTarget && (
          <VideoLecturePlayer
            lectureId={videoLectureTarget.id}
            lectureTitle={videoLectureTarget.title}
            initialVoiceId={selectedVoice?.voice_id}
            onClose={() => setVideoLectureTarget(null)}
            onOpenVoiceModal={canManage ? () => setShowVoiceModal(true) : null}
          />
        )}

        {showVoiceModal && (
          <VoiceCloneModal
            isOpen={showVoiceModal}
            onClose={() => setShowVoiceModal(false)}
            selectedVoiceId={selectedVoice?.voice_id}
            onSelectVoice={(v) => setSelectedVoice(v)}
          />
        )}
      </div>
    </div>
  );
}
