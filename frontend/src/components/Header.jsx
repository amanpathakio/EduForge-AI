import React from 'react';

export default function Header({ status, onLogout }) {
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

  return (
    <header className="app-header">
      <div className="header-left">
        <span className="workspace-crumb"><i /> Workspace <b>/</b> Teaching studio</span>
      </div>

      <div className="header-right">
        <div className="status-indicator">
          <span id="backend-status-dot" className={dotClass}></span>
          <span id="backend-status-text" className="status-text">{statusText}</span>
        </div>
        {onLogout && <button className="header-logout" onClick={onLogout}>Log out</button>}
      </div>
    </header>
  );
}
