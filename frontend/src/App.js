import { useEffect, useMemo, useState } from 'react';
import './App.css';

const API_BASE = process.env.REACT_APP_API_BASE_URL || 'http://127.0.0.1:8000/api/v1';
const ROLE_OPTIONS = ['ADMIN', 'MANAGER', 'USER'];

function parseJwt(token) {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

function getInitialAuthView() {
  if (window.location.pathname.includes('/reset-password')) return 'reset';
  if (window.location.pathname.includes('/login')) return 'login';
  return 'register';
}

function App() {
  const [auth, setAuth] = useState({ access: '', refresh: '', username: '', role: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [tab, setTab] = useState('dashboard');
  const [authView, setAuthView] = useState(getInitialAuthView());
  const [showForgot, setShowForgot] = useState(false);

  const [analytics, setAnalytics] = useState(null);
  const [logs, setLogs] = useState([]);
  const [profile, setProfile] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [users, setUsers] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('ALL');

  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ username: '', email: '', password: '', first_name: '', last_name: '' });
  const [forgotForm, setForgotForm] = useState({ email: '' });
  const [resetForm, setResetForm] = useState(() => ({
    token: new URLSearchParams(window.location.search).get('token') || '',
    new_password: '',
  }));
  const [createForm, setCreateForm] = useState({
    username: '',
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    role: 'USER',
  });
  const [docForm, setDocForm] = useState({ title: '', file: null });
  const [passwordForm, setPasswordForm] = useState({ old_password: '', new_password: '' });

  const isLoggedIn = Boolean(auth.access);
  const canManage = auth.role === 'ADMIN' || auth.role === 'MANAGER';
  const isAdmin = auth.role === 'ADMIN';
  const creatableRoles = useMemo(() => {
    if (auth.role === 'ADMIN') return ['MANAGER', 'USER'];
    if (auth.role === 'MANAGER') return ['USER'];
    return [];
  }, [auth.role]);

  const navigateAuth = (view, token = '') => {
    setAuthView(view);
    if (view === 'register') window.history.replaceState({}, '', '/');
    if (view === 'login') window.history.replaceState({}, '', '/login');
    if (view === 'reset') {
      const q = token ? `?token=${encodeURIComponent(token)}` : '';
      window.history.replaceState({}, '', `/reset-password${q}`);
    }
  };

  const toast = (text) => {
    setMsg(text);
    clearTimeout(window.__toastTimer2);
    window.__toastTimer2 = setTimeout(() => setMsg(''), 3500);
  };

  const authFetch = async (path, options = {}, allowRetry = true) => {
    const resp = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${auth.access}`,
      },
    });

    if (resp.status === 401 && auth.refresh && allowRetry) {
      const rr = await fetch(`${API_BASE}/auth/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh: auth.refresh }),
      });
      const rj = await rr.json();
      if (rr.ok && rj.access) {
        setAuth((prev) => ({ ...prev, access: rj.access }));
        return authFetch(path, options, false);
      }
    }
    return resp;
  };

  const doLogin = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const resp = await fetch(`${API_BASE}/auth/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm),
      });
      const data = await resp.json();
      if (!resp.ok || !data?.data?.access) {
        toast(data?.message || 'Login failed');
        return;
      }
      const payload = parseJwt(data.data.access) || {};
      setAuth({
        access: data.data.access,
        refresh: data.data.refresh,
        username: payload.username || loginForm.username,
        role: payload.role || '',
      });
      toast('Login successful');
      window.history.replaceState({}, '', '/');
    } finally {
      setBusy(false);
    }
  };

  const doLogout = async () => {
    if (!isLoggedIn) return;
    await authFetch('/auth/logout/', { method: 'POST' });
    setAuth({ access: '', refresh: '', username: '', role: '' });
    setProfile(null);
    setAnalytics(null);
    setLogs([]);
    setDocuments([]);
    navigateAuth('login');
    toast('Logged out');
  };

  const register = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const resp = await fetch(`${API_BASE}/auth/register/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registerForm),
      });
      const data = await resp.json();
      toast(data.message || (resp.ok ? 'Registered' : 'Registration failed'));
      if (resp.ok) {
        setLoginForm((prev) => ({ ...prev, username: registerForm.username }));
        navigateAuth('login');
      }
    } finally {
      setBusy(false);
    }
  };

  const forgotPassword = async () => {
    if (!forgotForm.email) {
      toast('Enter your email for password reset');
      return;
    }
    setBusy(true);
    try {
      const resp = await fetch(`${API_BASE}/auth/forgot-password/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(forgotForm),
      });
      const data = await resp.json();
      toast(data.message || 'Reset email sent');
      navigateAuth('reset');
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const resp = await fetch(`${API_BASE}/auth/reset-password/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resetForm),
      });
      const data = await resp.json();
      toast(data.message || (resp.ok ? 'Password reset complete' : 'Reset failed'));
      if (resp.ok) {
        setResetForm({ token: '', new_password: '' });
        navigateAuth('login');
      }
    } finally {
      setBusy(false);
    }
  };

  const loadProfile = async () => {
    const resp = await authFetch('/profile/');
    const data = await resp.json();
    if (resp.ok) setProfile(data.data);
  };

  const updateProfile = async (e) => {
    e.preventDefault();
    const fd = new FormData();
    ['email', 'first_name', 'last_name', 'theme_preference', 'language_preference'].forEach((k) => {
      if (profile?.[k] !== undefined && profile?.[k] !== null) fd.append(k, profile[k]);
    });
    if (profile?.profile_picture instanceof File) fd.append('profile_picture', profile.profile_picture);

    setBusy(true);
    try {
      const resp = await authFetch('/profile/', { method: 'PATCH', body: fd, headers: {} });
      const data = await resp.json();
      if (resp.ok) setProfile(data.data);
      toast(data.message || 'Profile updated');
    } finally {
      setBusy(false);
    }
  };

  const loadAnalytics = async () => {
    setBusy(true);
    try {
      const resp = await authFetch('/analytics/');
      const data = await resp.json();
      if (resp.ok) {
        setAnalytics(data.data);
        toast('Analytics loaded');
      } else {
        toast(data?.message || 'Unable to load analytics');
      }
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const resp = await authFetch('/auth/change-password/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(passwordForm),
      });
      const data = await resp.json();
      toast(data.message || (resp.ok ? 'Password changed' : 'Change failed'));
      if (resp.ok) setPasswordForm({ old_password: '', new_password: '' });
    } finally {
      setBusy(false);
    }
  };

  const loadLogs = async () => {
    const resp = await authFetch('/audit-logs/');
    const data = await resp.json();
    if (resp.ok) setLogs(data.data);
  };

  const loadUsers = async () => {
    setBusy(true);
    try {
      const resp = await authFetch('/users/');
      const data = await resp.json();
      if (resp.ok) {
        setUsers(data.data);
      } else {
        toast(data?.message || 'Unable to load users');
      }
    } finally {
      setBusy(false);
    }
  };

  const updateUser = async (userId, payload) => {
    setBusy(true);
    try {
      const resp = await authFetch(`/users/${userId}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      toast(data.message || (resp.ok ? 'User updated' : 'Update failed'));
      if (resp.ok) {
        loadUsers();
        loadAnalytics();
      }
    } finally {
      setBusy(false);
    }
  };

  const deleteUser = async (userId, username) => {
    const ok = window.confirm(`Delete user "${username}"?`);
    if (!ok) return;
    setBusy(true);
    try {
      const resp = await authFetch(`/users/${userId}/`, { method: 'DELETE' });
      const data = await resp.json();
      toast(data.message || (resp.ok ? 'User deleted' : 'Delete failed'));
      if (resp.ok) {
        loadUsers();
        loadAnalytics();
      }
    } finally {
      setBusy(false);
    }
  };

  const createUser = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const resp = await authFetch('/users/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      });
      const data = await resp.json();
      toast(data.message || 'Create action completed');
    } finally {
      setBusy(false);
    }
  };

  const uploadDocument = async (e) => {
    e.preventDefault();
    if (!docForm.file) return;
    const fd = new FormData();
    fd.append('title', docForm.title);
    fd.append('file', docForm.file);
    setBusy(true);
    try {
      const resp = await authFetch('/documents/upload/', { method: 'POST', body: fd, headers: {} });
      const data = await resp.json();
      toast(data.message || 'Upload completed');
      if (resp.ok) {
        setDocForm({ title: '', file: null });
        loadDocuments();
      }
    } finally {
      setBusy(false);
    }
  };

  const loadDocuments = async () => {
    const resp = await authFetch('/documents/');
    const data = await resp.json();
    if (resp.ok) setDocuments(data.data);
  };

  useEffect(() => {
    if (!isLoggedIn) return;
    loadProfile();
    loadDocuments();
    if (canManage) loadAnalytics();
    if (isAdmin) loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, canManage, isAdmin]);

  useEffect(() => {
    if (isLoggedIn && canManage && tab === 'admin') {
      loadAnalytics();
      loadUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, isLoggedIn, canManage]);

  const filteredUsers = users.filter((u) => {
    const matchRole = userRoleFilter === 'ALL' || u.role === userRoleFilter;
    const q = userSearch.toLowerCase();
    const matchSearch =
      u.username?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q);
    return matchRole && matchSearch;
  });

  useEffect(() => {
    document.body.dataset.theme = profile?.theme_preference || 'light';
  }, [profile?.theme_preference]);

  if (!isLoggedIn) {
    return (
      <div className="app">
        <main className="auth-shell">
          <section className="auth-card">
            <h1>Enterprise User Management</h1>
            <p className="subtle">Secure account workflow with role-based access.</p>

            {authView === 'register' && (
              <>
                <h2>Create Account</h2>
                <form onSubmit={register} className="form">
                  <input placeholder="username" value={registerForm.username} onChange={(e) => setRegisterForm({ ...registerForm, username: e.target.value })} required />
                  <input type="email" placeholder="email" value={registerForm.email} onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })} required />
                  <input type="password" placeholder="password" value={registerForm.password} onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })} required />
                  <input placeholder="first name" value={registerForm.first_name} onChange={(e) => setRegisterForm({ ...registerForm, first_name: e.target.value })} />
                  <input placeholder="last name" value={registerForm.last_name} onChange={(e) => setRegisterForm({ ...registerForm, last_name: e.target.value })} />
                  <button className="btn primary" disabled={busy}>Register</button>
                </form>
                <p className="auth-switch">
                  Already have an account?
                  <button type="button" className="link-btn" onClick={() => navigateAuth('login')}>Login</button>
                </p>
              </>
            )}

            {authView === 'login' && (
              <>
                <h2>Login</h2>
                <form onSubmit={doLogin} className="form">
                  <input placeholder="username" value={loginForm.username} onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })} required />
                  <input type="password" placeholder="password" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} required />
                  <button className="btn primary" disabled={busy}>Login</button>
                </form>
                <div className="auth-switch">
                  <button type="button" className="link-btn" onClick={() => setShowForgot((v) => !v)}>Forgot password?</button>
                </div>
                {showForgot && (
                  <div className="forgot-inline">
                    <input
                      type="email"
                      placeholder="Enter your email"
                      value={forgotForm.email}
                      onChange={(e) => setForgotForm({ email: e.target.value })}
                    />
                    <button type="button" className="btn secondary" onClick={forgotPassword} disabled={busy}>
                      Send Reset Link
                    </button>
                  </div>
                )}
                <p className="auth-switch">
                  New user?
                  <button type="button" className="link-btn" onClick={() => navigateAuth('register')}>Register</button>
                </p>
              </>
            )}

            {authView === 'reset' && (
              <>
                <h2>Reset Password</h2>
                <form onSubmit={resetPassword} className="form">
                  <input placeholder="reset token" value={resetForm.token} onChange={(e) => setResetForm({ ...resetForm, token: e.target.value })} required />
                  <input type="password" placeholder="new password" value={resetForm.new_password} onChange={(e) => setResetForm({ ...resetForm, new_password: e.target.value })} required />
                  <button className="btn primary" disabled={busy}>Reset Password</button>
                </form>
                <p className="auth-switch">
                  Back to login?
                  <button type="button" className="link-btn" onClick={() => navigateAuth('login')}>Login</button>
                </p>
              </>
            )}
          </section>
        </main>
        {msg && <div className="toast">{msg}</div>}
      </div>
    );
  }

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>Enterprise User Management</h1>
          <p>React + Django API v1 with auth, audit, analytics, uploads, personalization</p>
        </div>
        <div className="top-actions">
          <span className="badge">{`${auth.username} (${auth.role})`}</span>
          <button className="btn ghost" onClick={doLogout}>Logout</button>
        </div>
      </header>

      <nav className="tabs">
        {['dashboard', 'profile', 'admin', 'files', 'audit'].map((t) => (
          <button
            key={t}
            className={`tab ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
            disabled={(t === 'admin' && !canManage) || (t === 'audit' && !isAdmin)}
          >
            {t}
          </button>
        ))}
      </nav>

      <main className="grid">
        {tab === 'dashboard' && (
          <section className="card span-2">
            <h2>Dashboard Metrics</h2>
            {!analytics ? <p>Load admin tab for analytics access.</p> : (
              <>
                <div className="kpi-row">
                  <div className="kpi"><span>Total</span><strong>{analytics.total_users}</strong></div>
                  <div className="kpi"><span>Active</span><strong>{analytics.active_users}</strong></div>
                  <div className="kpi"><span>Inactive</span><strong>{analytics.inactive_users}</strong></div>
                </div>
                <h3>Role Distribution</h3>
                <div className="bars">
                  {analytics.role_distribution.map((r) => (
                    <div key={r.role} className="bar-row">
                      <label>{r.role}</label>
                      <div className="bar-wrap"><div className="bar" style={{ width: `${Math.max(6, (r.count / Math.max(1, analytics.total_users)) * 100)}%` }} /></div>
                      <span>{r.count}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        {tab === 'profile' && profile && (
          <section className="card span-2">
            <h2>Profile & Personalization</h2>
            <form onSubmit={updateProfile} className="form">
              <input value={profile.email || ''} onChange={(e) => setProfile({ ...profile, email: e.target.value })} placeholder="email" />
              <input value={profile.first_name || ''} onChange={(e) => setProfile({ ...profile, first_name: e.target.value })} placeholder="first name" />
              <input value={profile.last_name || ''} onChange={(e) => setProfile({ ...profile, last_name: e.target.value })} placeholder="last name" />
              <select value={profile.theme_preference || 'light'} onChange={(e) => setProfile({ ...profile, theme_preference: e.target.value })}>
                <option value="light">light</option>
                <option value="dark">dark</option>
              </select>
              <input value={profile.language_preference || 'en'} onChange={(e) => setProfile({ ...profile, language_preference: e.target.value })} placeholder="language code" />
              <input type="file" accept="image/*" onChange={(e) => setProfile({ ...profile, profile_picture: e.target.files?.[0] || null })} />
              <button className="btn primary" disabled={busy}>Save Profile</button>
            </form>
            <p className="meta">Last login: {profile.last_login || 'N/A'}</p>
            <h3>Change Password</h3>
            <form onSubmit={changePassword} className="form">
              <input type="password" placeholder="old password" value={passwordForm.old_password} onChange={(e) => setPasswordForm({ ...passwordForm, old_password: e.target.value })} required />
              <input type="password" placeholder="new password" value={passwordForm.new_password} onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })} required />
              <button className="btn secondary" disabled={busy}>Change Password</button>
            </form>
          </section>
        )}

        {tab === 'admin' && canManage && (
          <>
            <section className="card">
              <h2>Create User (RBAC)</h2>
              <form onSubmit={createUser} className="form">
                <input placeholder="username" value={createForm.username} onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })} required />
                <input type="email" placeholder="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} required />
                <input type="password" placeholder="password" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} required />
                <input placeholder="first name" value={createForm.first_name} onChange={(e) => setCreateForm({ ...createForm, first_name: e.target.value })} />
                <input placeholder="last name" value={createForm.last_name} onChange={(e) => setCreateForm({ ...createForm, last_name: e.target.value })} />
                <select value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}>
                  {creatableRoles.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <button className="btn primary" disabled={busy || creatableRoles.length === 0}>Create</button>
              </form>
            </section>
            <section className="card">
              <h2>Analytics</h2>
              <button className="btn secondary" onClick={loadAnalytics}>Refresh Analytics</button>
              {analytics && (
                <ul className="simple-list">
                  <li>Total users: {analytics.total_users}</li>
                  <li>Active users: {analytics.active_users}</li>
                  <li>Inactive users: {analytics.inactive_users}</li>
                </ul>
              )}
            </section>
            <section className="card span-2">
              <h2>User Management</h2>
              <div className="admin-filters">
                <input
                  placeholder="Search username/email"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                />
                <select value={userRoleFilter} onChange={(e) => setUserRoleFilter(e.target.value)}>
                  <option value="ALL">ALL</option>
                  <option value="ADMIN">ADMIN</option>
                  <option value="MANAGER">MANAGER</option>
                  <option value="USER">USER</option>
                </select>
                <button className="btn secondary" onClick={loadUsers}>Refresh Users</button>
              </div>
              <div className="table-wrap">
                <table className="users-table">
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => (
                      <tr key={u.id}>
                        <td>{u.username}</td>
                        <td>{u.email || '-'}</td>
                        <td>
                          <select
                            value={u.role}
                            onChange={(e) => updateUser(u.id, { role: e.target.value })}
                            disabled={busy}
                          >
                            <option value="ADMIN">ADMIN</option>
                            <option value="MANAGER">MANAGER</option>
                            <option value="USER">USER</option>
                          </select>
                        </td>
                        <td>{u.is_active_account ? 'ACTIVE' : 'INACTIVE'}</td>
                        <td className="table-actions">
                          <button
                            className="btn ghost"
                            onClick={() => updateUser(u.id, { is_active_account: !u.is_active_account })}
                            disabled={busy}
                          >
                            {u.is_active_account ? 'Deactivate' : 'Activate'}
                          </button>
                          <button
                            className="btn secondary"
                            onClick={() => deleteUser(u.id, u.username)}
                            disabled={busy}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {tab === 'files' && (
          <>
            <section className="card">
              <h2>Upload Document</h2>
              <form onSubmit={uploadDocument} className="form">
                <input placeholder="title" value={docForm.title} onChange={(e) => setDocForm({ ...docForm, title: e.target.value })} required />
                <input type="file" accept=".png,.jpg,.jpeg,.pdf" onChange={(e) => setDocForm({ ...docForm, file: e.target.files?.[0] || null })} required />
                <button className="btn primary" disabled={busy}>Upload</button>
              </form>
            </section>
            <section className="card">
              <h2>My Accessible Documents</h2>
              <button className="btn secondary" onClick={loadDocuments}>Refresh List</button>
              <ul className="simple-list">
                {documents.map((d) => (
                  <li key={d.id}>
                    {d.title} - <a href={`${API_BASE}/documents/${d.id}/download/`} target="_blank" rel="noreferrer">download</a>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}

        {tab === 'audit' && isAdmin && (
          <section className="card span-2">
            <h2>Audit Logs</h2>
            <button className="btn secondary" onClick={loadLogs}>Refresh Logs</button>
            <div className="logs">
              {logs.map((log) => (
                <article key={log.id} className="log">
                  <strong>{log.action}</strong>
                  <p>{log.description}</p>
                  <small>{log.created_at}</small>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="foot">
        <span>API: {API_BASE}</span>
        <span>Roles: {ROLE_OPTIONS.join(', ')}</span>
      </footer>

      {msg && <div className="toast">{msg}</div>}
    </div>
  );
}

export default App;
