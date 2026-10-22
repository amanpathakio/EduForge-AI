import React, { useState, useEffect, useCallback } from 'react';
import { getCourseDocuments, uploadCourseDocument } from '../services/api';
import UploadPanel from '../components/UploadPanel';

export default function DocumentsView({ courses, onSelectCourse }) {
  const [selectedCourseId, setSelectedCourseId] = useState(
    courses.length > 0 ? courses[0].id : ''
  );
  const [documents, setDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadDocs = useCallback(async () => {
    if (!selectedCourseId) {
      setDocuments([]);
      return;
    }
    try {
      setIsLoading(true);
      const docs = await getCourseDocuments(selectedCourseId);
      setDocuments(docs);
    } catch (err) {
      console.warn('Failed to load documents for course:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedCourseId]);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  const handleUpload = (file, onProgress) => {
    return uploadCourseDocument(selectedCourseId, file, onProgress);
  };

  return (
    <div className="documents-view-container">
      <div className="view-header">
        <div>
          <h1 className="view-title">Course Documents</h1>
          <p className="view-subtitle">
            Upload and view indexed PDFs that ground your courses, AI tutor responses, and lectures.
          </p>
        </div>

        {courses.length > 0 && (
          <div className="course-filter-selector">
            <label htmlFor="doc-course-filter">Course:</label>
            <select
              id="doc-course-filter"
              value={selectedCourseId}
              onChange={(e) => {
                setSelectedCourseId(e.target.value);
                if (onSelectCourse) onSelectCourse(e.target.value);
              }}
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {courses.length === 0 ? (
        <div className="empty-substate glass-card">
          <p>No courses available. Please create a course first to upload documents.</p>
        </div>
      ) : (
        <div className="documents-page-grid">
          <div className="doc-uploader-pane">
            <UploadPanel
              onUploadSuccess={loadDocs}
              customUploader={handleUpload}
            />
          </div>

          <div className="doc-table-pane glass-card">
            <div className="doc-pane-header">
              <h3>Indexed PDF Materials</h3>
              <span className="meta-pill">{documents.length} files</span>
            </div>

            {isLoading ? (
              <div className="loading-state">Loading materials...</div>
            ) : documents.length === 0 ? (
              <div className="empty-substate">
                <p>No PDF documents uploaded for this course yet.</p>
                <p className="sub-text">Drag and drop course lecture notes on the left.</p>
              </div>
            ) : (
              <div className="doc-items-container">
                {documents.map((doc) => (
                  <div key={doc.id} className="doc-item-row">
                    <div className="doc-icon-badge">PDF</div>
                    <div className="doc-info-block">
                      <span className="doc-filename">{doc.filename}</span>
                      <span className="doc-meta-info">
                        {doc.pages_count} pages · {doc.chunks_count} vector chunks · Added {new Date(doc.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <span className="doc-status-badge">Indexed in ChromaDB</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
