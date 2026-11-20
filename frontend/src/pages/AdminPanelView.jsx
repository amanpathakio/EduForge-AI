import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getAdminStats,
  getAdminUsers,
  updateUserRole,
  deleteUserAccount,
  getFacultyKeys,
  addFacultyKey,
  promoteSelfToAdmin,
} from '../services/api';

export default function AdminPanelView({ currentUser, onRoleUpdated }) {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [facultyKeys, setFacultyKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Tabs: 'users' | 'keys' | 'diagnostics'
  const [activeTab, setActiveTab] = useState('users');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  // Add Faculty Key Input
  const [newKeyCode, setNewKeyCode] = useState('');
  const [isAddingKey, setIsAddingKey] = useState(false);

  // Role update in-flight state
  const [updatingUserId, setUpdatingUserId] = useState(null);
  const [deletingUserId, setDeletingUserId] = useState(null);

  const isAdmin = currentUser?.role === 'admin';

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [statsData, usersData, keysData] = await Promise.all([
        getAdminStats(),
        getAdminUsers(),
        getFacultyKeys(),
      ]);
      setStats(statsData);
      setUsers(usersData);
      setFacultyKeys(keysData.active_keys || []);
    } catch (err) {
      setError(err.message || 'Failed to load administrative console data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRoleChange = async (userId, newRole) => {
    try {
      setUpdatingUserId(userId);
      setError(null);
      await updateUserRole(userId, newRole);
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
      setSuccessMsg(`User role successfully changed to ${newRole}.`);
      setTimeout(() => setSuccessMsg(null), 4000);
      if (userId === currentUser?.id && onRoleUpdated) {
        onRoleUpdated(newRole);
      }
    } catch (err) {
      setError(err.message || 'Failed to update user role');
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleDeleteUser = async (user) => {
    if (!window.confirm(`Are you sure you want to permanently delete ${user.full_name || user.email || 'this user'}? This will delete all course enrollments and cannot be undone.`)) {
      return;
    }
    try {
      setDeletingUserId(user.id);
      setError(null);
      await deleteUserAccount(user.id);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      setSuccessMsg(`User ${user.email || user.id} deleted successfully.`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      setError(err.message || 'Failed to delete user');
    } finally {
      setDeletingUserId(null);
    }
  };

  const handleAddKey = async (e) => {
    e.preventDefault();
    if (!newKeyCode.trim()) return;
    try {
      setIsAddingKey(true);
      setError(null);
      const res = await addFacultyKey(newKeyCode.trim());
      setFacultyKeys(res.keys || [...facultyKeys, newKeyCode.trim()]);
      setNewKeyCode('');
      setSuccessMsg(res.message || 'Faculty authorization key activated.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      setError(err.message || 'Failed to add faculty key');
    } finally {
      setIsAddingKey(false);
    }
  };

  const handlePromoteSelf = async () => {
    try {
      setError(null);
      await promoteSelfToAdmin();
      setSuccessMsg('Congratulations! Your account has been promoted to platform Administrator.');
      if (onRoleUpdated) onRoleUpdated('admin');
      fetchData();
    } catch (err) {
      setError(err.message || 'Failed to elevate privileges');
    }
  };

  // Filtered Users list
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        (u.full_name && u.full_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (u.email && u.email.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesRole = roleFilter === 'all' || u.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [users, searchQuery, roleFilter]);

  return (
    <div className="admin-panel-container view-fade-in" style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Top Banner Header */}
      <header className="command-header glass-card" style={{ padding: '1.5rem 2rem', marginBottom: '1.75rem', borderRadius: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '1.5rem' }}>🛡️</span>
            <span className="eyebrow" style={{ color: 'var(--primary, #6366f1)', fontWeight: 700, letterSpacing: '0.05em' }}>INSTITUTION GOVERNANCE</span>
          </div>
          <h1 style={{ margin: 0, fontSize: '1.85rem', fontWeight: 800 }}>Institution Super Admin Console</h1>
          <p style={{ margin: '0.35rem 0 0', color: 'var(--text-muted, #94a3b8)', fontSize: '0.95rem' }}>
            Global user directory, role governance, faculty authorization keys, and AI system diagnostics.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {!isAdmin ? (
            <button
              onClick={handlePromoteSelf}
              className="button button-primary"
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', color: '#fff', padding: '0.6rem 1.25rem', borderRadius: '0.5rem', fontWeight: 600, cursor: 'pointer' }}
              title="Promote Dr. Maya to full platform administrator"
            >
              ★ Promote Account to Admin
            </button>
          ) : (
            <span className="role-chip professor" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '0.4rem 0.85rem', borderRadius: '9999px', fontWeight: 600, fontSize: '0.85rem' }}>
              ✓ Full Admin Access Active
            </span>
          )}
          <button
            onClick={fetchData}
            className="button button-secondary"
            disabled={loading}
            style={{ padding: '0.6rem 1rem', borderRadius: '0.5rem', cursor: 'pointer' }}
          >
            {loading ? 'Refreshing...' : '↻ Refresh Data'}
          </button>
        </div>
      </header>

      {/* Notifications */}
      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', padding: '1rem', borderRadius: '0.75rem', marginBottom: '1.5rem' }}>
          <b>Error:</b> {error}
        </div>
      )}
      {successMsg && (
        <div style={{ background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#10b981', padding: '1rem', borderRadius: '0.75rem', marginBottom: '1.5rem' }}>
          ✓ {successMsg}
        </div>
      )}

      {/* Metrics / KPI Grid */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
          <div className="glass-card" style={{ padding: '1.25rem', borderRadius: '0.75rem' }}>
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted, #94a3b8)', fontWeight: 700 }}>Total Accounts</span>
            <div style={{ fontSize: '2rem', fontWeight: 800, margin: '0.25rem 0' }}>{stats.total_users}</div>
            <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted, #94a3b8)' }}>
              <span>{stats.professors_count} Profs</span> ·
              <span>{stats.students_count} Students</span> ·
              <span>{stats.admins_count} Admins</span>
            </div>
          </div>

          <div className="glass-card" style={{ padding: '1.25rem', borderRadius: '0.75rem' }}>
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted, #94a3b8)', fontWeight: 700 }}>Active Courses</span>
            <div style={{ fontSize: '2rem', fontWeight: 800, margin: '0.25rem 0' }}>{stats.total_courses}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #94a3b8)' }}>
              Across all faculty departments
            </div>
          </div>

          <div className="glass-card" style={{ padding: '1.25rem', borderRadius: '0.75rem' }}>
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted, #94a3b8)', fontWeight: 700 }}>Knowledge Base (RAG)</span>
            <div style={{ fontSize: '2rem', fontWeight: 800, margin: '0.25rem 0', color: 'var(--primary, #6366f1)' }}>
              {stats.total_chunks_indexed}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #94a3b8)' }}>
              {stats.total_documents} PDFs indexed in ChromaDB
            </div>
          </div>

          <div className="glass-card" style={{ padding: '1.25rem', borderRadius: '0.75rem' }}>
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted, #94a3b8)', fontWeight: 700 }}>AI Subsystems</span>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0.45rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ height: '10px', width: '10px', borderRadius: '50%', background: stats.gemini_configured ? '#10b981' : '#ef4444' }} />
              {stats.gemini_configured ? 'Gemini 0-RAM Active' : 'Gemini Unconfigured'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #94a3b8)' }}>
              Chroma: {stats.chroma_status} · DB: {stats.database_status}
            </div>
          </div>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border, rgba(255,255,255,0.1))', marginBottom: '1.5rem', paddingBottom: '0.5rem' }}>
        <button
          onClick={() => setActiveTab('users')}
          className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          style={{
            background: activeTab === 'users' ? 'var(--primary, #6366f1)' : 'transparent',
            color: activeTab === 'users' ? '#fff' : 'var(--text-muted, #94a3b8)',
            border: 'none',
            padding: '0.6rem 1.25rem',
            borderRadius: '0.5rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          👥 User Directory ({users.length})
        </button>

        <button
          onClick={() => setActiveTab('keys')}
          className={`tab-btn ${activeTab === 'keys' ? 'active' : ''}`}
          style={{
            background: activeTab === 'keys' ? 'var(--primary, #6366f1)' : 'transparent',
            color: activeTab === 'keys' ? '#fff' : 'var(--text-muted, #94a3b8)',
            border: 'none',
            padding: '0.6rem 1.25rem',
            borderRadius: '0.5rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          🔑 Faculty Authorization Keys ({facultyKeys.length})
        </button>

        <button
          onClick={() => setActiveTab('diagnostics')}
          className={`tab-btn ${activeTab === 'diagnostics' ? 'active' : ''}`}
          style={{
            background: activeTab === 'diagnostics' ? 'var(--primary, #6366f1)' : 'transparent',
            color: activeTab === 'diagnostics' ? '#fff' : 'var(--text-muted, #94a3b8)',
            border: 'none',
            padding: '0.6rem 1.25rem',
            borderRadius: '0.5rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          ⚙️ AI & System Health
        </button>
      </div>

      {/* TAB 1: USERS DIRECTORY */}
      {activeTab === 'users' && (
        <section className="glass-card" style={{ padding: '1.5rem', borderRadius: '1rem' }}>
          {/* Controls Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: '280px' }}>
              <input
                type="text"
                placeholder="Search user by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  maxWidth: '360px',
                  padding: '0.6rem 1rem',
                  borderRadius: '0.5rem',
                  border: '1px solid var(--border, rgba(255,255,255,0.15))',
                  background: 'var(--bg-card, rgba(30, 41, 59, 0.6))',
                  color: 'inherit',
                }}
              />
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                style={{
                  padding: '0.6rem 0.85rem',
                  borderRadius: '0.5rem',
                  border: '1px solid var(--border, rgba(255,255,255,0.15))',
                  background: 'var(--bg-card, rgba(30, 41, 59, 0.6))',
                  color: 'inherit',
                  cursor: 'pointer',
                }}
              >
                <option value="all">All Roles</option>
                <option value="professor">Professors</option>
                <option value="student">Students</option>
                <option value="admin">Administrators</option>
              </select>
            </div>

            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted, #94a3b8)' }}>
              Showing {filteredUsers.length} of {users.length} accounts
            </span>
          </div>

          {/* User Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border, rgba(255,255,255,0.1))', color: 'var(--text-muted, #94a3b8)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>User Profile</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Email</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Current Role</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Auth Source</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Courses</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Registered</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted, #94a3b8)' }}>
                      No user accounts found matching your filter.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr
                      key={user.id}
                      style={{
                        borderBottom: '1px solid var(--border, rgba(255,255,255,0.06))',
                        background: user.id === currentUser?.id ? 'rgba(99, 102, 241, 0.05)' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            background: user.role === 'admin' ? '#ef4444' : user.role === 'professor' ? 'var(--primary, #6366f1)' : '#10b981',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '0.8rem',
                          }}
                        >
                          {(user.full_name || user.email || 'U')[0].toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600 }}>
                            {user.full_name || 'No Name Set'}
                            {user.id === currentUser?.id && (
                              <span style={{ marginLeft: '0.4rem', fontSize: '0.7rem', background: 'rgba(99, 102, 241, 0.2)', color: 'var(--primary, #6366f1)', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>YOU</span>
                            )}
                          </div>
                          <small style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                            {user.id.substring(0, 12)}...
                          </small>
                        </div>
                      </td>

                      <td style={{ padding: '0.85rem 1rem' }}>{user.email || 'N/A'}</td>

                      <td style={{ padding: '0.85rem 1rem' }}>
                        <select
                          value={user.role}
                          disabled={updatingUserId === user.id}
                          onChange={(e) => handleRoleChange(user.id, e.target.value)}
                          style={{
                            padding: '0.35rem 0.6rem',
                            borderRadius: '0.4rem',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            border: '1px solid var(--border, rgba(255,255,255,0.15))',
                            background:
                              user.role === 'admin'
                                ? 'rgba(239, 68, 68, 0.15)'
                                : user.role === 'professor'
                                ? 'rgba(99, 102, 241, 0.15)'
                                : 'rgba(16, 185, 129, 0.15)',
                            color:
                              user.role === 'admin'
                                ? '#ef4444'
                                : user.role === 'professor'
                                ? 'var(--primary, #6366f1)'
                                : '#10b981',
                          }}
                        >
                          <option value="student">Student</option>
                          <option value="professor">Professor</option>
                          <option value="admin">Administrator</option>
                        </select>
                      </td>

                      <td style={{ padding: '0.85rem 1rem' }}>
                        <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'rgba(255,255,255,0.06)' }}>
                          {user.auth_provider}
                        </span>
                      </td>

                      <td style={{ padding: '0.85rem 1rem' }}>
                        {user.courses_count} course{user.courses_count === 1 ? '' : 's'}
                      </td>

                      <td style={{ padding: '0.85rem 1rem', fontSize: '0.8rem', color: 'var(--text-muted, #94a3b8)' }}>
                        {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Active'}
                      </td>

                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                        {user.id !== currentUser?.id ? (
                          <button
                            onClick={() => handleDeleteUser(user)}
                            disabled={deletingUserId === user.id}
                            style={{
                              background: 'transparent',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              color: '#ef4444',
                              padding: '0.35rem 0.65rem',
                              borderRadius: '0.4rem',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                              transition: 'all 0.15s',
                            }}
                            onMouseEnter={(e) => (e.target.style.background = 'rgba(239, 68, 68, 0.15)')}
                            onMouseLeave={(e) => (e.target.style.background = 'transparent')}
                          >
                            {deletingUserId === user.id ? 'Deleting...' : 'Delete'}
                          </button>
                        ) : (
                          <span style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '0.75rem' }}>Protected</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 2: FACULTY KEYS */}
      {activeTab === 'keys' && (
        <section className="glass-card" style={{ padding: '1.75rem', borderRadius: '1rem' }}>
          <h2 style={{ fontSize: '1.25rem', margin: '0 0 0.5rem 0' }}>Faculty Authorization Keys</h2>
          <p style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
            Faculty members use these secret access codes during self-service registration to unlock Professor Studio.
            You can activate multiple keys (for specific departments, visiting professors, or campus branches).
          </p>

          {/* Add Key Form */}
          <form onSubmit={handleAddKey} style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Enter new faculty key (e.g. CS-DEPT-2026)..."
              value={newKeyCode}
              onChange={(e) => setNewKeyCode(e.target.value)}
              style={{
                flex: 1,
                minWidth: '260px',
                padding: '0.65rem 1rem',
                borderRadius: '0.5rem',
                border: '1px solid var(--border, rgba(255,255,255,0.15))',
                background: 'var(--bg-card, rgba(30, 41, 59, 0.6))',
                color: 'inherit',
              }}
            />
            <button
              type="submit"
              disabled={isAddingKey || !newKeyCode.trim()}
              className="button button-primary"
              style={{ padding: '0.65rem 1.25rem', borderRadius: '0.5rem', fontWeight: 600, cursor: 'pointer' }}
            >
              {isAddingKey ? 'Activating...' : '+ Add & Activate Key'}
            </button>
          </form>

          {/* Key List */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
            {facultyKeys.map((key, idx) => (
              <div
                key={idx}
                style={{
                  padding: '1rem',
                  borderRadius: '0.65rem',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--border, rgba(255,255,255,0.1))',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '1rem', color: 'var(--primary, #6366f1)' }}>
                    {key}
                  </div>
                  <small style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '0.75rem' }}>
                    {idx === 0 ? 'Primary Master Key' : 'Departmental Key'}
                  </small>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(key);
                    alert(`Copied "${key}" to clipboard! Share this with incoming professors.`);
                  }}
                  style={{
                    padding: '0.35rem 0.65rem',
                    borderRadius: '0.4rem',
                    border: '1px solid var(--border, rgba(255,255,255,0.15))',
                    background: 'transparent',
                    color: 'inherit',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                  }}
                >
                  Copy
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* TAB 3: SYSTEM DIAGNOSTICS */}
      {activeTab === 'diagnostics' && (
        <section className="glass-card" style={{ padding: '1.75rem', borderRadius: '1rem' }}>
          <h2 style={{ fontSize: '1.25rem', margin: '0 0 1rem 0' }}>AI & System Infrastructure</h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
            <div style={{ padding: '1.25rem', borderRadius: '0.75rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border, rgba(255,255,255,0.08))' }}>
              <h3 style={{ fontSize: '0.95rem', margin: '0 0 0.5rem 0', color: 'var(--primary, #6366f1)' }}>Embedding Engine</h3>
              <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem' }}>
                <b>Model:</b> Google Gemini Embedding (<code style={{ fontSize: '0.8rem' }}>models/gemini-embedding-001</code>)
              </p>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted, #94a3b8)' }}>
                Runs via lightweight HTTP API calls. Eliminates local PyTorch RAM load, operating safely under Render's 512 MB memory threshold.
              </p>
            </div>

            <div style={{ padding: '1.25rem', borderRadius: '0.75rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border, rgba(255,255,255,0.08))' }}>
              <h3 style={{ fontSize: '0.95rem', margin: '0 0 0.5rem 0', color: 'var(--primary, #6366f1)' }}>Vector Store (ChromaDB)</h3>
              <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem' }}>
                <b>Status:</b> {stats?.chroma_status || 'Online'}
              </p>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted, #94a3b8)' }}>
                Persistent vector storage indexing {stats?.total_chunks_indexed || 0} chunks across all uploaded course syllabi and textbooks.
              </p>
            </div>

            <div style={{ padding: '1.25rem', borderRadius: '0.75rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border, rgba(255,255,255,0.08))' }}>
              <h3 style={{ fontSize: '0.95rem', margin: '0 0 0.5rem 0', color: 'var(--primary, #6366f1)' }}>Voice & Lecture Synthesis</h3>
              <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem' }}>
                <b>ElevenLabs / EdgeTTS:</b> {stats?.elevenlabs_configured ? 'API Connected' : 'Edge-TTS Fallback Active'}
              </p>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted, #94a3b8)' }}>
                Provides studio voice cloning and neural professor audio narration for slide decks.
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
