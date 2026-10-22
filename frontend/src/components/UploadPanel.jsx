import React, { useState, useRef } from 'react';
import { uploadDocument } from '../services/api';

export default function UploadPanel({ onUploadSuccess, customUploader }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadFilename, setUploadFilename] = useState('');
  const [uploadPercent, setUploadPercent] = useState(0);
  const [showProcessingMsg, setShowProcessingMsg] = useState(false);
  const [feedback, setFeedback] = useState(null); // { message, type: 'success' | 'error' }

  const fileInputRef = useRef(null);

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = async (file) => {
    if (isUploading) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setFeedback({
        message: 'Invalid file format. Please upload a PDF document.',
        type: 'error',
      });
      return;
    }

    setIsUploading(true);
    setFeedback(null);
    setUploadFilename(file.name);
    setUploadPercent(0);
    setShowProcessingMsg(false);

    try {
      const uploader = customUploader || uploadDocument;
      const result = await uploader(file, (percent) => {
        setUploadPercent(percent);
        if (percent >= 95) {
          setShowProcessingMsg(true);
        }
      });

      setUploadPercent(100);
      setShowProcessingMsg(false);
      setFeedback({
        message: `Successfully indexed "${result.filename}" (${result.chunks_created} chunks created).`,
        type: 'success',
      });

      if (onUploadSuccess) {
        onUploadSuccess(result);
      }
    } catch (error) {
      console.error('Upload error:', error);
      setShowProcessingMsg(false);
      setFeedback({
        message: `Upload failed: ${error.message}`,
        type: 'error',
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setTimeout(() => {
        setUploadFilename('');
      }, 3000);
    }
  };

  return (
    <div className="glass-card upload-card">
      <h2 className="card-title">
        <svg className="title-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M9 13h6m-3-3v6m-9 1V4a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
          />
        </svg>
        Course Materials Loader
      </h2>
      <p className="card-subtitle">Upload course PDFs to populate the grounded knowledge base.</p>

      <div
        id="drop-zone"
        className={`drop-zone ${isDragOver ? 'dragover' : ''}`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          type="file"
          id="file-input"
          ref={fileInputRef}
          accept=".pdf"
          className="hidden-file-input"
          onChange={handleFileChange}
        />
        <div className="drop-zone-content">
          <svg className="upload-cloud-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <span className="upload-text-primary">Drag & drop your course PDF here</span>
          <span className="upload-text-secondary">or click to browse files</span>
        </div>
      </div>

      {/* Uploading Progress State */}
      {uploadFilename && (
        <div id="upload-progress-container" className="upload-progress-container">
          <div className="progress-info">
            <span id="uploading-filename" className="filename-text">
              {uploadFilename}
            </span>
            <span id="upload-percentage" className="percentage-text">
              {uploadPercent}%
            </span>
          </div>
          <div className="progress-bar-bg">
            <div
              id="upload-progress-bar"
              className="progress-bar-fill"
              style={{ width: `${uploadPercent}%` }}
            ></div>
          </div>
          {showProcessingMsg && (
            <p id="processing-msg" className="processing-msg">
              <svg className="spinner-icon mini" viewBox="0 0 24 24" fill="none">
                <circle className="spinner-track" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"></circle>
                <circle
                  className="spinner-head"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeDasharray="45"
                ></circle>
              </svg>
              Extracting pages, chunking text, and indexing in ChromaDB...
            </p>
          )}
        </div>
      )}

      {/* Upload Result Feedback */}
      {feedback && (
        <div id="upload-feedback" className={`feedback-box ${feedback.type}`}>
          {feedback.message}
        </div>
      )}
    </div>
  );
}
