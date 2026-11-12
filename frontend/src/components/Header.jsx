import React from 'react';
import ThemeToggle from './ThemeToggle';

const VIEW_LABELS = {
  dashboard: 'Dashboard',
  courses: 'Courses',
  'course-workspace': 'Course Workspace',
  'ask-ai': 'Ask Course Tutor',
  'student-learning': 'Student Space',
  studio: 'Lecture Studio',
  documents: 'Course Documents',
};

export default function Header({
  status,
  onLogout,
  theme = 'dark',
  onToggleTheme,
  currentView = 'dashboard',
  activeCourse = null,
  currentUser = null,
}) {
  const isOnline = status === 'online';
  const isConnecting = status === 'connecting';

  let statusText = 'System Active';
  let dotClass = 'status-dot online';

  if (isConnecting) {
    statusText = 'Connecting...';
    dotClass = 'status-dot offline';
  } else if (!isOnline) {
    statusText = 'Offline (API Unavailable)';
    dotClass = 'status-dot offline';
  }

  const sectionLabel = VIEW_LABELS[currentView] || 'Workspace';

  return (
    <header className="app-header">
      <div className="header-left">
        <span className="workspace-crumb">
          <i aria-hidden="true" />
          <span>EduForge</span>
          <b>/</b>
          <span>{sectionLabel}</span>
          {activeCourse && (
            <>
              <b>/</b>
              <span className="crumb-course-name" title={activeCourse.title}>
                {activeCourse.title}
              </span>
            </>
          )}
        </span>
      </div>

      <div className="header-right">
        {currentUser && (
          <div className="user-identity-pill" title={currentUser.email || ''}>
            <span className={`role-chip ${currentUser.role === 'professor' || currentUser.role === 'admin' ? 'professor' : 'student'}`}>
              {currentUser.role === 'professor' || currentUser.role === 'admin' ? 'Professor' : 'Student'}
            </span>
            <span className="user-display-name">
              {currentUser.full_name || currentUser.email}
            </span>
          </div>
        )}
        <div className="status-indicator" title={`Backend API status: ${statusText}`}>
          <span id="backend-status-dot" className={dotClass}></span>
          <span id="backend-status-text" className="status-text">{statusText}</span>
        </div>
        {onToggleTheme && <ThemeToggle theme={theme} onToggle={onToggleTheme} compact />}
        {onLogout && (
          <button type="button" className="header-logout" onClick={onLogout}>
            Sign out
          </button>
        )}
      </div>
    </header>
  );
}
