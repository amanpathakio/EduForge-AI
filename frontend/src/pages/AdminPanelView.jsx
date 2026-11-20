import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getAdminStats,
  getAdminUsers,
  createAdminUser,
  updateUserRole,
  deleteUserAccount,
  adminResetPassword,
} from '../services/api';

export default function AdminPanelView({ currentUser, onRoleUpdated }) {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUser, setNewUser] = useState({
    email: '',
    full_name: '',
    password: '',
    role: 'student',
  });
  const [isCreating, setIsCreating] = useState(false);

  // Password reset modal state
  const [resetModalUser, setResetModalUser] = useState(null);
  const [newPasswordVal, setNewPasswordVal] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  // Role update and delete tracking
  const [updatingUserId, setUpdatingUserId] = useState(null);
  const [deletingUserId, setDeletingUserId] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [statsData, usersData] = await Promise.all([
        getAdminStats(),
        getAdminUsers(),
      ]);
      setStats(statsData);
      setUsers(usersData);
    } catch (err) {
      setError(err.message || 'Failed to load administrative console data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRoleChange = async (targetUser, newRole) => {
    if (targetUser.role === 'admin' && newRole !== 'admin') {
      const confirmDemote = window.confirm(
        `Are you sure you want to revoke Administrator privileges from ${targetUser.full_name || targetUser.email} and demote them to ${newRole}?`
      );
      if (!confirmDemote) return;
    }

    try {
      setUpdatingUserId(targetUser.id);
      setError(null);
      await updateUserRole(targetUser.id, newRole);
      setUsers((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, role: newRole } : u))
      );
      setSuccessMsg(`Role for ${targetUser.email || targetUser.id} updated to ${newRole}.`);
      setTimeout(() => setSuccessMsg(null), 4000);
      if (targetUser.id === currentUser?.id && onRoleUpdated) {
        onRoleUpdated(newRole);
      }
      fetchData();
    } catch (err) {
      setError(err.message || 'Failed to update user role');
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleDeleteUser = async (user) => {
    const isProf = user.role === 'professor';
    const msg = isProf
      ? `Permanently remove professor "${user.full_name || user.email}"? All their course memberships will be removed.`
      : `Permanently remove student "${user.full_name || user.email}"? They will be unenrolled from all courses.`;

    if (!window.confirm(msg)) return;

    try {
      setDeletingUserId(user.id);
      setError(null);
      await deleteUserAccount(user.id);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      setSuccessMsg(`Account for "${user.email || user.id}" has been removed.`);
      setTimeout(() => setSuccessMsg(null), 4000);
      fetchData();
    } catch (err) {
      setError(err.message || 'Failed to delete user');
    } finally {
      setDeletingUserId(null);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUser.email || !newUser.password) return;
    try {
      setIsCreating(true);
      setError(null);
      const created = await createAdminUser(newUser);
      setUsers((prev) => [created, ...prev]);
      setShowAddModal(false);
      setNewUser({ email: '', full_name: '', password: '', role: 'student' });
      setSuccessMsg(`Successfully created ${created.role} account for ${created.email}!`);
      setTimeout(() => setSuccessMsg(null), 4000);
      fetchData();
    } catch (err) {
      setError(err.message || 'Failed to create user account');
    } finally {
      setIsCreating(false);
    }
  };

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    if (!newPasswordVal || !resetModalUser) return;
    try {
      setIsResetting(true);
      setError(null);
      await adminResetPassword(resetModalUser.id, newPasswordVal);
      setSuccessMsg(`Password for ${resetModalUser.email} has been reset.`);
      setTimeout(() => setSuccessMsg(null), 4000);
      setResetModalUser(null);
      setNewPasswordVal('');
    } catch (err) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setIsResetting(false);
    }
  };

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        (u.full_name && u.full_name.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q));
      const matchesRole = roleFilter === 'all' || u.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [users, searchQuery, roleFilter]);

  return (
    <div className="admin-panel-container view-fade-in" style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header Banner */}
      <header
        className="command-header glass-card"
        style={{
          padding: '1.5rem 2rem',
          marginBottom: '1.75rem',
          borderRadius: '1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '1.4rem' }}>🛡️</span>
            <span className="eyebrow" style={{ color: 'var(--primary, #6366f1)', fontWeight: 700, letterSpacing: '0.05em' }}>
              INSTITUTION CONTROL CENTER
            </span>
          </div>
          <h1 style={{ margin: 0, fontSize: '1.85rem', fontWeight: 800 }}>Platform Administration</h1>
          <p style={{ margin: '0.35rem 0 0', color: 'var(--text-muted, #94a3b8)', fontSize: '0.95rem' }}>
            Manage and provision all student, faculty, and administrator accounts across the institution.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={() => setShowAddModal(true)}
            className="button button-primary"
            style={{
              padding: '0.65rem 1.25rem',
              borderRadius: '0.5rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <span>+</span> Provision New User
          </button>

          <button
            onClick={fetchData}
            className="button button-secondary"
            disabled={loading}
            style={{ padding: '0.65rem 1rem', borderRadius: '0.5rem', cursor: 'pointer' }}
          >
            {loading ? 'Refreshing...' : '↻ Refresh'}
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

      {/* Institutional KPI Cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
          <div
            className={`glass-card ${roleFilter === 'professor' ? 'active-kpi' : ''}`}
            onClick={() => setRoleFilter(roleFilter === 'professor' ? 'all' : 'professor')}
            style={{ padding: '1.25rem', borderRadius: '0.75rem', cursor: 'pointer', transition: 'all 0.2s', border: roleFilter === 'professor' ? '1px solid var(--primary, #6366f1)' : undefined }}
          >
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted, #94a3b8)', fontWeight: 700 }}>
              Faculty Professors
            </span>
            <div style={{ fontSize: '2rem', fontWeight: 800, margin: '0.25rem 0', color: 'var(--primary, #6366f1)' }}>
              {stats.professors_count}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #94a3b8)' }}>Author & narrate courses</div>
          </div>

          <div
            className={`glass-card ${roleFilter === 'student' ? 'active-kpi' : ''}`}
            onClick={() => setRoleFilter(roleFilter === 'student' ? 'all' : 'student')}
            style={{ padding: '1.25rem', borderRadius: '0.75rem', cursor: 'pointer', transition: 'all 0.2s', border: roleFilter === 'student' ? '1px solid #10b981' : undefined }}
          >
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted, #94a3b8)', fontWeight: 700 }}>
              Enrolled Students
            </span>
            <div style={{ fontSize: '2rem', fontWeight: 800, margin: '0.25rem 0', color: '#10b981' }}>
              {stats.students_count}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #94a3b8)' }}>Learners across workspaces</div>
          </div>

          <div
            className={`glass-card ${roleFilter === 'admin' ? 'active-kpi' : ''}`}
            onClick={() => setRoleFilter(roleFilter === 'admin' ? 'all' : 'admin')}
            style={{ padding: '1.25rem', borderRadius: '0.75rem', cursor: 'pointer', transition: 'all 0.2s', border: roleFilter === 'admin' ? '1px solid #ef4444' : undefined }}
          >
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted, #94a3b8)', fontWeight: 700 }}>
              System Administrators
            </span>
            <div style={{ fontSize: '2rem', fontWeight: 800, margin: '0.25rem 0', color: '#ef4444' }}>
              {stats.admins_count}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #94a3b8)' }}>Full governance privileges</div>
          </div>

          <div className="glass-card" style={{ padding: '1.25rem', borderRadius: '0.75rem' }}>
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted, #94a3b8)', fontWeight: 700 }}>
              Active Courses
            </span>
            <div style={{ fontSize: '2rem', fontWeight: 800, margin: '0.25rem 0' }}>
              {stats.total_courses}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #94a3b8)' }}>
              {stats.total_documents} source PDFs uploaded
            </div>
          </div>
        </div>
      )}

      {/* Main Users Table Section */}
      <section className="glass-card" style={{ padding: '1.5rem', borderRadius: '1rem' }}>
        {/* Search & Filter Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: '300px' }}>
            <input
              type="text"
              placeholder="Search user by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                maxWidth: '380px',
                padding: '0.65rem 1rem',
                borderRadius: '0.5rem',
                border: '1px solid var(--border, rgba(255,255,255,0.15))',
                background: 'var(--bg-card, rgba(30, 41, 59, 0.6))',
                color: 'inherit',
              }}
            />

            {/* Role Filter Pills */}
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              {['all', 'professor', 'student', 'admin'].map((r) => (
                <button
                  key={r}
                  onClick={() => setRoleFilter(r)}
                  style={{
                    padding: '0.4rem 0.75rem',
                    borderRadius: '0.4rem',
                    border: '1px solid var(--border, rgba(255,255,255,0.15))',
                    background: roleFilter === r ? 'var(--primary, #6366f1)' : 'transparent',
                    color: roleFilter === r ? '#fff' : 'var(--text-muted, #94a3b8)',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    textTransform: 'capitalize',
                    cursor: 'pointer',
                  }}
                >
                  {r === 'all' ? 'All' : r}
                </button>
              ))}
            </div>
          </div>

          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted, #94a3b8)' }}>
            Showing {filteredUsers.length} of {users.length} user accounts
          </span>
        </div>

        {/* User Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border, rgba(255,255,255,0.1))', color: 'var(--text-muted, #94a3b8)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <th style={{ padding: '0.75rem 1rem' }}>User Profile</th>
                <th style={{ padding: '0.75rem 1rem' }}>Email Address</th>
                <th style={{ padding: '0.75rem 1rem' }}>Governance Role</th>
                <th style={{ padding: '0.75rem 1rem' }}>Courses</th>
                <th style={{ padding: '0.75rem 1rem' }}>Joined</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted, #94a3b8)' }}>
                    No user accounts match your filter criteria.
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
                    {/* User profile */}
                    <td style={{ padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div
                        style={{
                          width: '34px',
                          height: '34px',
                          borderRadius: '50%',
                          background:
                            user.role === 'admin'
                              ? '#ef4444'
                              : user.role === 'professor'
                              ? 'var(--primary, #6366f1)'
                              : '#10b981',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '0.85rem',
                        }}
                      >
                        {(user.full_name || user.email || 'U')[0].toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600 }}>
                          {user.full_name || 'No Name Provided'}
                          {user.id === currentUser?.id && (
                            <span style={{ marginLeft: '0.4rem', fontSize: '0.7rem', background: 'rgba(99, 102, 241, 0.2)', color: 'var(--primary, #6366f1)', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
                              YOU
                            </span>
                          )}
                        </div>
                        <small style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                          ID: {user.id.substring(0, 10)}...
                        </small>
                      </div>
                    </td>

                    {/* Email */}
                    <td style={{ padding: '0.85rem 1rem' }}>{user.email || 'N/A'}</td>

                    {/* Role Selector (Promote / Demote) */}
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <select
                        value={user.role}
                        disabled={updatingUserId === user.id}
                        onChange={(e) => handleRoleChange(user, e.target.value)}
                        style={{
                          padding: '0.35rem 0.65rem',
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

                    {/* Courses count */}
                    <td style={{ padding: '0.85rem 1rem' }}>
                      {user.courses_count} course{user.courses_count === 1 ? '' : 's'}
                    </td>

                    {/* Registered Date */}
                    <td style={{ padding: '0.85rem 1rem', fontSize: '0.8rem', color: 'var(--text-muted, #94a3b8)' }}>
                      {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Active'}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                        <button
                          onClick={() => {
                            setResetModalUser(user);
                            setNewPasswordVal('');
                          }}
                          style={{
                            background: 'transparent',
                            border: '1px solid var(--border, rgba(255,255,255,0.15))',
                            color: 'inherit',
                            padding: '0.35rem 0.65rem',
                            borderRadius: '0.4rem',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                          }}
                          title="Set a new password for this account"
                        >
                          Reset Pwd
                        </button>

                        {user.id !== currentUser?.id ? (
                          <button
                            onClick={() => handleDeleteUser(user)}
                            disabled={deletingUserId === user.id}
                            style={{
                              background: 'rgba(239, 68, 68, 0.1)',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              color: '#ef4444',
                              padding: '0.35rem 0.65rem',
                              borderRadius: '0.4rem',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                            }}
                          >
                            {deletingUserId === user.id ? 'Removing...' : 'Remove User'}
                          </button>
                        ) : (
                          <span style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '0.75rem', alignSelf: 'center' }}>
                            Protected
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* MODAL: PROVISION NEW USER */}
      {showAddModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem',
          }}
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="glass-card"
            style={{
              maxWidth: '460px',
              width: '100%',
              padding: '2rem',
              borderRadius: '1rem',
              background: 'var(--bg-card, #1e293b)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.4rem' }}>Provision New User</h2>
            <p style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
              Directly add a new student, faculty professor, or administrator to the institution.
            </p>

            <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.35rem', fontWeight: 600 }}>Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Dr. Jane Smith or Alex Turner"
                  value={newUser.full_name}
                  onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '0.4rem', border: '1px solid var(--border, rgba(255,255,255,0.15))', background: 'rgba(0,0,0,0.2)', color: 'inherit' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.35rem', fontWeight: 600 }}>Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder="user@university.edu"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '0.4rem', border: '1px solid var(--border, rgba(255,255,255,0.15))', background: 'rgba(0,0,0,0.2)', color: 'inherit' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.35rem', fontWeight: 600 }}>Initial Password *</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  placeholder="Minimum 8 characters"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '0.4rem', border: '1px solid var(--border, rgba(255,255,255,0.15))', background: 'rgba(0,0,0,0.2)', color: 'inherit' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.35rem', fontWeight: 600 }}>Account Role *</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '0.4rem', border: '1px solid var(--border, rgba(255,255,255,0.15))', background: 'rgba(0,0,0,0.2)', color: 'inherit', cursor: 'pointer' }}
                >
                  <option value="student">Student (Learner)</option>
                  <option value="professor">Professor (Educator Studio Access)</option>
                  <option value="admin">Administrator (Platform Super-Admin)</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  style={{ padding: '0.6rem 1rem', borderRadius: '0.4rem', border: '1px solid var(--border, rgba(255,255,255,0.15))', background: 'transparent', color: 'inherit', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="button button-primary"
                  style={{ padding: '0.6rem 1.25rem', borderRadius: '0.4rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  {isCreating ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RESET PASSWORD */}
      {resetModalUser && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem',
          }}
          onClick={() => setResetModalUser(null)}
        >
          <div
            className="glass-card"
            style={{
              maxWidth: '420px',
              width: '100%',
              padding: '2rem',
              borderRadius: '1rem',
              background: 'var(--bg-card, #1e293b)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.3rem' }}>Reset Password</h2>
            <p style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              Set a new temporary or permanent password for <b>{resetModalUser.email}</b>.
            </p>

            <form onSubmit={handleResetPasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.35rem', fontWeight: 600 }}>New Password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  placeholder="Enter at least 8 characters..."
                  value={newPasswordVal}
                  onChange={(e) => setNewPasswordVal(e.target.value)}
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '0.4rem', border: '1px solid var(--border, rgba(255,255,255,0.15))', background: 'rgba(0,0,0,0.2)', color: 'inherit' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setResetModalUser(null)}
                  style={{ padding: '0.55rem 0.95rem', borderRadius: '0.4rem', border: '1px solid var(--border, rgba(255,255,255,0.15))', background: 'transparent', color: 'inherit', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isResetting || !newPasswordVal}
                  className="button button-primary"
                  style={{ padding: '0.55rem 1.15rem', borderRadius: '0.4rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  {isResetting ? 'Saving...' : 'Save Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
