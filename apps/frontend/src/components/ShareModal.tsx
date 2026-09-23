import React, { useState, useEffect } from 'react';
import { X, Share2, Copy, Check, ExternalLink, ShieldCheck, Globe } from 'lucide-react';
import { User } from '../types';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onUpdateSuccess: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onUpdateSuccess
}) => {
  const [enabled, setEnabled] = useState(currentUser?.shareEnabled || false);
  const [slug, setSlug] = useState(currentUser?.shareSlug || '');
  const [title, setTitle] = useState(currentUser?.shareTitle || '');
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && currentUser) {
      setEnabled(currentUser.shareEnabled);
      setSlug(currentUser.shareSlug || currentUser.username.toLowerCase());
      setTitle(currentUser.shareTitle || `${currentUser.displayName || currentUser.username}'s AI Quotas`);
    }
  }, [isOpen, currentUser?.id]);

  // Handle Escape key & body scroll lock
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

  const fullShareUrl = `${window.location.origin}/share/${slug}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(fullShareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/share-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shareEnabled: enabled,
          shareSlug: slug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, ''),
          shareTitle: title.trim()
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to update share settings');
      }

      onUpdateSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
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
        className="bg-white dark:bg-zinc-900 rounded-2xl max-w-lg w-full border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Public Read-Only Quota Page</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Share quota progress with teammates safely</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-400">
              {error}
            </div>
          )}

          {/* Toggle Switch */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-zinc-800">
            <div>
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Enable Read-Only Page</div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                {enabled ? 'Public link is live and accessible' : 'Public link is currently disabled (404 Private)'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setEnabled(!enabled)}
              className={`w-12 h-6 flex items-center rounded-full p-1 transition duration-200 ${
                enabled ? 'bg-emerald-500 justify-end' : 'bg-zinc-300 dark:bg-zinc-700 justify-start'
              }`}
            >
              <div className="bg-white w-4 h-4 rounded-full shadow-md" />
            </button>
          </div>

          {/* Configuration Form */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Custom Page Title
              </label>
              <input
                type="text"
                placeholder="e.g. My Team's AI Quotas"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                URL Slug
              </label>
              <div className="flex rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus-within:ring-2 focus-within:ring-emerald-500">
                <span className="px-3 py-2 text-xs text-zinc-400 bg-zinc-50 dark:bg-zinc-900/50 border-r border-zinc-200 dark:border-zinc-700 select-none">
                  /share/
                </span>
                <input
                  type="text"
                  placeholder="my-quota"
                  value={slug}
                  onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                  className="w-full px-3 py-2 text-xs bg-transparent text-zinc-900 dark:text-zinc-100 font-mono focus:outline-none"
                />
              </div>
            </div>

            {/* Public Link Preview */}
            {enabled && (
              <div className="pt-1">
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                  Shareable Public URL
                </label>
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-zinc-100/80 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-700/60">
                  <Globe className="w-4 h-4 text-zinc-400 shrink-0" />
                  <span className="text-xs font-mono text-zinc-700 dark:text-zinc-300 truncate select-all flex-1">
                    {fullShareUrl}
                  </span>
                  <button
                    onClick={handleCopy}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition shrink-0"
                    title="Copy Link"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <a
                    href={`/share/${slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition shrink-0"
                    title="Open Page in New Tab"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* Privacy & Security Note */}
          <div className="p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-500/20 flex items-start gap-2.5 text-xs text-zinc-600 dark:text-zinc-400">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <p>
              <strong>Zero Leakage Guarantee</strong>: This public page renders only capacity percentages, progress bars, and reset timers. API keys, credentials, and emails are never exposed.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-2 bg-zinc-50 dark:bg-zinc-950/50">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-xl transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-sm transition disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
};
