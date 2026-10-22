import React, { useState, useEffect, useCallback } from 'react';
import UploadPanel from '../components/UploadPanel';
import ChatPanel from '../components/ChatPanel';
import QuizPanel from '../components/QuizPanel';
import {
  getCourseDocuments,
  uploadCourseDocument,
  getCourseLectures,
  sendCourseChatMessage,
} from '../services/api';

export default function CourseWorkspace({
  course,
  onBackToCourses,
  onOpenStudioForCourse,
  onOpenCitation,
  onOpenLecture,
}) {
  const [activeTab, setActiveTab] = useState('overview');
  const [documents, setDocuments] = useState([]);
  const [lectures, setLectures] = useState([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [isLoadingLectures, setIsLoadingLectures] = useState(false);

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

  useEffect(() => {
    loadDocuments();
    loadLectures();
  }, [loadDocuments, loadLectures]);

  const handleDocumentUploaded = () => {
    loadDocuments();
  };

  // Custom upload handler for UploadPanel adapted to course
  const handleCourseUpload = (file, onProgress) => {
    return uploadCourseDocument(course.id, file, onProgress);
  };

  // Custom chat handler for ChatPanel adapted to course
  const handleCourseChat = (queryText) => {
    return sendCourseChatMessage(course.id, queryText);
  };

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
            ← All Courses
          </button>
          <div className="course-title-section">
            <span className="badge course-badge">Course Workspace</span>
            <h1 className="course-main-title">{course.title}</h1>
            {course.description && (
              <p className="course-main-desc">{course.description}</p>
            )}
          </div>
        </div>

        <div className="course-header-actions">
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
      </div>

      {/* Workspace Tabs Navigation */}
      <div className="workspace-tabs-bar">
        <button
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          📊 Overview
        </button>
        <button
          className={`tab-btn ${activeTab === 'documents' ? 'active' : ''}`}
          onClick={() => setActiveTab('documents')}
        >
          📄 Documents ({documents.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'ask-ai' ? 'active' : ''}`}
          onClick={() => setActiveTab('ask-ai')}
        >
          💬 Ask AI (Course Tutor)
        </button>
        <button
          className={`tab-btn ${activeTab === 'lectures' ? 'active' : ''}`}
          onClick={() => setActiveTab('lectures')}
        >
          🎙️ Lectures ({lectures.length})
        </button>
        <button className={`tab-btn ${activeTab === 'quizzes' ? 'active' : ''}`} onClick={() => setActiveTab('quizzes')}>✓ Quizzes</button>
      </div>

      {/* Tab Contents */}
      <div className="workspace-tab-content">
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="overview-tab-view">
            <div className="overview-stats-grid">
              <div className="stat-card glass-card">
                <span className="stat-label">Course Documents</span>
                <span className="stat-value">{documents.length}</span>
                <span className="stat-sub">PDF lecture materials indexed</span>
              </div>
              <div className="stat-card glass-card">
                <span className="stat-label">Generated Lectures</span>
                <span className="stat-value">{lectures.length}</span>
                <span className="stat-sub">Structured lectures created</span>
              </div>
              <div className="stat-card glass-card">
                <span className="stat-label">Total Document Pages</span>
                <span className="stat-value">
                  {documents.reduce((acc, d) => acc + (d.pages_count || 0), 0)}
                </span>
                <span className="stat-sub">Pages available for grounding</span>
              </div>
            </div>

            <div className="overview-actions-grid">
              <div className="action-card glass-card" onClick={() => setActiveTab('documents')}>
                <div className="action-icon">📄</div>
                <h3>Upload Course Materials</h3>
                <p>Drag and drop lecture PDFs to ground student questions and lecture synthesis.</p>
                <span className="action-link">Manage Documents →</span>
              </div>

              <div className="action-card glass-card" onClick={() => setActiveTab('ask-ai')}>
                <div className="action-icon">💬</div>
                <h3>Ask Course Tutor</h3>
                <p>Chat with AI grounded strictly in this course's documents with verified page citations.</p>
                <span className="action-link">Open Tutor →</span>
              </div>

              <div className="action-card glass-card" onClick={() => onOpenStudioForCourse(course)}>
                <div className="action-icon">🎙️</div>
                <h3>AI Lecture Studio</h3>
                <p>Synthesize grounded, slide-by-slide lectures with speaker notes and citations.</p>
                <span className="action-link">Open Studio →</span>
              </div>
            </div>
          </div>
        )}

        {/* DOCUMENTS TAB */}
        {activeTab === 'documents' && (
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
            <div className="lectures-view-header">
              <div>
                <h3>Course Lectures</h3>
                <p>Lectures generated from this course's documents.</p>
              </div>
              <button
                className="button button-primary"
                onClick={() => onOpenStudioForCourse(course)}
              >
                + New Lecture
              </button>
            </div>

            {isLoadingLectures ? (
              <div className="loading-state">Loading lectures...</div>
            ) : lectures.length === 0 ? (
              <div className="empty-substate glass-card">
                <div className="empty-icon">🎙️</div>
                <h4>No Lectures Generated Yet</h4>
                <p>Use the AI Lecture Studio to synthesize a full slide deck with citations from your course PDFs.</p>
                <button
                  className="button button-primary"
                  onClick={() => onOpenStudioForCourse(course)}
                  style={{ marginTop: '1rem' }}
                >
                  Generate First Lecture
                </button>
              </div>
            ) : (
              <div className="lectures-grid">
                {lectures.map((lec) => (
                  <div key={lec.id} className="lecture-card glass-card">
                    <div className="lecture-card-body">
                      <div className="lec-status-bar">
                        <span className="badge lec-badge">{lec.status || 'draft'}</span>
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
                      <button
                        className="button button-secondary"
                        onClick={() => onOpenLecture(lec.id, course)}
                      >
                        Open Editor →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {activeTab === 'quizzes' && <QuizPanel courseId={course.id} />}
      </div>
    </div>
  );
}
