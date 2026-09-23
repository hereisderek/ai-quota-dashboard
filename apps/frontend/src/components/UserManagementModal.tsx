import React, { useState, useEffect, useCallback } from 'react';
import { 
  X, 
  Users, 
  UserPlus, 
  Trash2, 
  ShieldCheck, 
  User as UserIcon, 
  Key, 
  Share2, 
  Check, 
  AlertCircle,
  RefreshCw,
  KeyRound,
  Copy
} from 'lucide-react';
import { ManagedUser, User } from '../types';

interface UserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
}

export const UserManagementModal: React.FC<UserManagementModalProps> = ({
  isOpen,
  onClose,
  currentUser
}) => {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Add User Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState<'user' | 'admin'>('user');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // User deletion confirmation state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Reset password state & popup
  const [isResettingId, setIsResettingId] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<{ username: string; tempPass: string } | null>(null);
  const [copiedPass, setCopiedPass] = useState(false);

  // Fetch users list from backend
  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/users');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || data.message || `Failed to fetch users (${res.status})`);
      }
      const data = await res.json();
      setUsers(data.users || []);
    } catch (err: any) {
      console.error('[UserManagement] Fetch error:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
      setShowAddForm(false);
      setSuccessMsg(null);
      setError(null);
      setConfirmDeleteId(null);
    }
  }, [isOpen, fetchUsers]);

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Handle Create User
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword) return;

    setIsSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/auth/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newPassword,
          displayName: newDisplayName.trim() || undefined,
          role: newRole
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create user');
      }

      setSuccessMsg(`User '${data.user.username}' created successfully!`);
      setNewUsername('');
      setNewPassword('');
      setNewDisplayName('');
      setNewRole('user');
      setShowAddForm(false);
      await fetchUsers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Delete User
  const handleDeleteUser = async (userId: string) => {
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`/api/auth/users/${userId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.message || 'Failed to delete user');
      }
      setSuccessMsg('User successfully deleted');
      setConfirmDeleteId(null);
      await fetchUsers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Handle Admin Reset User Password
  const handleResetPassword = async (userId: string) => {
    setError(null);
    setSuccessMsg(null);
    setIsResettingId(userId);
    try {
      const res = await fetch(`/api/auth/users/${userId}/reset-password`, {
        method: 'POST'
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.message || 'Failed to reset password');
      }
      setResetResult({
        username: data.username,
        tempPass: data.temporaryPassword
      });
      setCopiedPass(false);
      setSuccessMsg(`Password for '${data.username}' has been successfully reset.`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsResettingId(null);
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm animate-fade-in"
    >
      <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-2xl w-full border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  User Management
                </h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                  {users.length} {users.length === 1 ? 'user' : 'users'}
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Manage dashboard user accounts, permissions, and roles
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchUsers}
              disabled={isLoading}
              className="p-2 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
              title="Refresh User List"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-emerald-500' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Notice Alerts */}
        {error && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-400 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {successMsg && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-400 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button onClick={() => setSuccessMsg(null)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Temporary Password Display Banner */}
        {resetResult && (
          <div className="mx-5 mt-4 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 animate-fade-in space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-300">
                <KeyRound className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>Generated Password for @{resetResult.username}</span>
              </div>
              <button 
                onClick={() => setResetResult(null)} 
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80">
              Copy and share this temporary password with the user. It will not be shown again.
            </p>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-amber-300 dark:border-amber-700/80 font-mono text-sm font-bold text-zinc-900 dark:text-zinc-100 select-all">
                {resetResult.tempPass}
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(resetResult.tempPass);
                  setCopiedPass(true);
                  setTimeout(() => setCopiedPass(false), 2500);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white shadow-sm transition active:scale-95 shrink-0"
              >
                {copiedPass ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedPass ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Action Bar */}
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              System Accounts
            </h3>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition active:scale-95"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{showAddForm ? 'Cancel' : 'Add New User'}</span>
            </button>
          </div>

          {/* Add User Form Drawer */}
          {showAddForm && (
            <form onSubmit={handleCreateUser} className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 space-y-3 animate-fade-in">
              <div className="flex items-center gap-2 pb-2 border-b border-zinc-200 dark:border-zinc-700 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                <UserPlus className="w-4 h-4 text-emerald-500" />
                <span>Create New User Account</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Username *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. alex"
                    value={newUsername}
                    onChange={e => setNewUsername(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Password *
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Alex Rivera"
                    value={newDisplayName}
                    onChange={e => setNewDisplayName(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Role
                  </label>
                  <select
                    value={newRole}
                    onChange={e => setNewRole(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="user">User (Standard)</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition disabled:opacity-50"
                >
                  {isSubmitting ? 'Creating...' : 'Save User'}
                </button>
              </div>
            </form>
          )}

          {/* User Cards List */}
          <div className="space-y-2.5">
            {isLoading && users.length === 0 ? (
              <div className="py-12 text-center text-xs text-zinc-400">
                Loading user directory...
              </div>
            ) : users.length === 0 ? (
              <div className="py-12 text-center text-xs text-zinc-400">
                No users found.
              </div>
            ) : (
              users.map(u => {
                const isCurrentSelf = currentUser?.id === u.id;
                const isConfirming = confirmDeleteId === u.id;

                return (
                  <div
                    key={u.id}
                    className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm hover:border-zinc-300 dark:hover:border-zinc-700 transition"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-zinc-200 to-zinc-100 dark:from-zinc-800 dark:to-zinc-700 flex items-center justify-center font-bold text-xs text-zinc-700 dark:text-zinc-200 shrink-0">
                        {(u.displayName || u.username)[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 truncate">
                            {u.displayName || u.username}
                          </span>
                          {u.displayName && (
                            <span className="text-[11px] text-zinc-400 truncate">
                              @{u.username}
                            </span>
                          )}
                          {isCurrentSelf && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                              You
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-400 mt-0.5">
                          <span className={`inline-flex items-center gap-1 font-medium ${u.role === 'admin' ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-500'}`}>
                            {u.role === 'admin' ? <ShieldCheck className="w-3 h-3" /> : <UserIcon className="w-3 h-3" />}
                            {u.role === 'admin' ? 'Admin' : 'Standard User'}
                          </span>
                          <span>•</span>
                          <span>{u.accountCount} {u.accountCount === 1 ? 'account' : 'accounts'}</span>
                          {u.shareEnabled && (
                            <>
                              <span>•</span>
                              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                                <Share2 className="w-3 h-3" />
                                /share/{u.shareSlug}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                      {isConfirming ? (
                        <div className="flex items-center gap-1.5 animate-fade-in">
                          <span className="text-xs text-rose-600 dark:text-rose-400 font-medium">Delete?</span>
                          <button
                            onClick={() => handleDeleteUser(u.id)}
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white shadow-sm transition"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2.5 py-1 rounded-lg text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleResetPassword(u.id)}
                            disabled={isResettingId === u.id}
                            title="Reset password (generate temporary password)"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 border border-zinc-200/80 dark:border-zinc-800 transition disabled:opacity-50"
                          >
                            <KeyRound className={`w-3.5 h-3.5 ${isResettingId === u.id ? 'animate-spin text-amber-500' : ''}`} />
                            <span>Reset Password</span>
                          </button>

                          <button
                            onClick={() => {
                              if (!isCurrentSelf) setConfirmDeleteId(u.id);
                            }}
                            disabled={isCurrentSelf}
                            title={isCurrentSelf ? 'You cannot delete your own admin account' : 'Delete user'}
                            className={`p-1.5 rounded-lg transition ${
                              isCurrentSelf
                                ? 'text-zinc-300 dark:text-zinc-700 cursor-not-allowed'
                                : 'text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30'
                            }`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/30 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
