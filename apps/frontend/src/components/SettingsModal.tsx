import React, { useState, useEffect } from 'react';
import { X, Sliders, Bell, Database, Shield, Save, Check, KeyRound, AlertCircle } from 'lucide-react';
import { AppSettings, SystemStatus, User } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings | null;
  status: SystemStatus | null;
  currentUser: User | null;
  onSave: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  status,
  currentUser,
  onSave
}) => {
  const [pollInterval, setPollInterval] = useState(settings?.pollIntervalSeconds || 120);
  const [enableWs, setEnableWs] = useState(settings?.enableWebSocket !== false);
  const [retentionDays, setRetentionDays] = useState(settings?.dataRetentionDays || 30);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Change password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Future alert settings state
  const [webhookUrl, setWebhookUrl] = useState('');
  const [alertThreshold, setAlertThreshold] = useState(20);

  // Handle Escape key & body scroll lock
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  // Reset password form state whenever the modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordError(null);
      setPasswordSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (newPassword.length < 4) {
      setPasswordError('New password must be at least 4 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match');
      return;
    }

    setIsChangingPassword(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to change password');
      }
      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(false), 2500);
    } catch (err: any) {
      setPasswordError(err.message);
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pollIntervalSeconds: pollInterval,
          enableWebSocket: enableWs,
          dataRetentionDays: retentionDays
        })
      });

      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 1500);
      onSave();
    } catch (err) {
      console.error('Settings save error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm animate-fade-in"
    >
      <div 
        onMouseDown={(e) => e.stopPropagation()}
        className="bg-white dark:bg-zinc-900 rounded-2xl max-w-lg w-full border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-emerald-500" />
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Dashboard Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-6 overflow-y-auto">
          {/* Section 1: Polling & Real-time */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5" /> Polling & Stream Sync
            </h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Background Polling Interval
                  </label>
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                    {pollInterval}s
                  </span>
                </div>
                <input
                  type="range"
                  min="30"
                  max="600"
                  step="15"
                  value={pollInterval}
                  onChange={e => setPollInterval(parseInt(e.target.value, 10))}
                  className="w-full accent-emerald-500 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-zinc-400 mt-1">
                  <span>Fast (30s)</span>
                  <span>Default (120s)</span>
                  <span>Relaxed (10m)</span>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/50 dark:border-zinc-800">
                <div>
                  <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Real-Time WebSocket Feed</div>
                  <div className="text-[11px] text-zinc-400">Instantly push quota drops and resets to dashboard</div>
                </div>
                <button
                  type="button"
                  onClick={() => setEnableWs(!enableWs)}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition duration-200 ${
                    enableWs ? 'bg-emerald-500 justify-end' : 'bg-zinc-300 dark:bg-zinc-700 justify-start'
                  }`}
                >
                  <div className="bg-white w-4 h-4 rounded-full shadow-md transform" />
                </button>
              </div>
            </div>
          </div>

          {/* Section 2: Storage & Volume */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5" /> Storage & Persistence
            </h3>
            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/50 dark:border-zinc-800 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500 dark:text-zinc-400">Data Directory:</span>
                <span className="font-mono text-zinc-800 dark:text-zinc-200">{status?.dataDir || '/data'}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500 dark:text-zinc-400">History Retention:</span>
                <span className="font-mono text-zinc-800 dark:text-zinc-200">{retentionDays} Days</span>
              </div>
            </div>
          </div>

          {/* Section 3: Auth Mode */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" /> Security & Access
            </h3>
            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/50 dark:border-zinc-800">
              <div className="flex justify-between items-center text-xs">
                <span className="text-zinc-500 dark:text-zinc-400">Active Authentication:</span>
                <span className="px-2 py-0.5 rounded-full font-medium text-[11px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  {status?.authMode || 'none'}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-2">
                Configure in Docker <code className="font-mono">.env</code> with <code className="font-mono">AUTH_MODE=token|password|ip_whitelist|reverse_proxy</code>.
              </p>
            </div>

            {currentUser && (
              <form onSubmit={handleChangePassword} className="mt-3 p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/50 dark:border-zinc-800 space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                  <KeyRound className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Change Password</span>
                </div>

                {passwordError && (
                  <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-[11px] text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{passwordError}</span>
                  </div>
                )}

                <input
                  type="password"
                  required
                  placeholder="Current password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <input
                  type="password"
                  required
                  placeholder="New password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <input
                  type="password"
                  required
                  placeholder="Confirm new password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />

                <button
                  type="submit"
                  disabled={isChangingPassword}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90 rounded-lg shadow-sm transition disabled:opacity-50"
                >
                  {passwordSuccess ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Password updated!</span>
                    </>
                  ) : (
                    <span>{isChangingPassword ? 'Updating...' : 'Update Password'}</span>
                  )}
                </button>
              </form>
            )}
          </div>

          {/* Section 4: Webhook Alerts (Planned Feature Placeholder) */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                <Bell className="w-3.5 h-3.5" /> Quota Alerts (Upcoming)
              </h3>
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                Future Todo
              </span>
            </div>
            <div className="p-3.5 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/50 space-y-2.5 opacity-75">
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 mb-1">Webhook URL (Discord / Slack)</label>
                <input
                  type="text"
                  disabled
                  placeholder="https://discord.com/api/webhooks/..."
                  value={webhookUrl}
                  onChange={e => setWebhookUrl(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-800/50 text-zinc-400 font-mono"
                />
              </div>
              <p className="text-[11px] text-zinc-400">
                Automated webhook notifications will ping when any model bucket drops below {alertThreshold}%.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-2 bg-zinc-50 dark:bg-zinc-950/50">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-xl transition"
          >
            Close
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-sm transition disabled:opacity-50"
          >
            {savedSuccess ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Saved!</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
