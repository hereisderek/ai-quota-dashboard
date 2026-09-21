import React, { useState, useEffect } from 'react';
import { X, Sparkles, Bot, Github, Globe, ExternalLink } from 'lucide-react';

interface AddAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type TabType = 'google' | 'anthropic' | 'github' | 'custom';

export const AddAccountModal: React.FC<AddAccountModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [activeTab, setActiveTab] = useState<TabType>('google');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [label, setLabel] = useState('');
  const [googleManual, setGoogleManual] = useState(false);
  const [refreshToken, setRefreshToken] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [email, setEmail] = useState('');

  const [anthropicKey, setAnthropicKey] = useState('');
  const [githubPat, setGithubPat] = useState('');
  const [githubOrg, setGithubOrg] = useState('');

  const [customUrl, setCustomUrl] = useState('');
  const [customMethod, setCustomMethod] = useState<'GET' | 'POST'>('GET');
  const [customToken, setCustomToken] = useState('');
  const [customRemainingPath, setCustomRemainingPath] = useState('remaining_fraction');

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

  if (!isOpen) return null;

  const handleSubmitManual = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    let providerId = '';
    let creds: Record<string, any> = {};

    if (activeTab === 'google') {
      providerId = 'google-antigravity';
      creds = { refreshToken, accessToken, email };
    } else if (activeTab === 'anthropic') {
      providerId = 'anthropic';
      creds = { apiKey: anthropicKey };
    } else if (activeTab === 'github') {
      providerId = 'github-copilot';
      creds = { token: githubPat, org: githubOrg || undefined };
    } else if (activeTab === 'custom') {
      providerId = 'generic-rest';
      creds = {
        url: customUrl,
        method: customMethod,
        token: customToken,
        remainingPath: customRemainingPath
      };
    }

    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId,
          label: label || `${activeTab.toUpperCase()} Account`,
          email: email || undefined,
          credentials: creds
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to add account');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm animate-fade-in"
    >
      <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-lg w-full border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Connect AI Provider</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Add an account to monitor quotas and rate limits</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Provider Tabs */}
        <div className="grid grid-cols-4 p-2 bg-zinc-50 dark:bg-zinc-950/50 border-b border-zinc-200/60 dark:border-zinc-800 gap-1">
          <button
            onClick={() => { setActiveTab('google'); setError(null); }}
            className={`flex flex-col items-center gap-1 py-2 px-1 rounded-xl text-xs font-medium transition ${
              activeTab === 'google'
                ? 'bg-white dark:bg-zinc-800 text-sky-600 dark:text-sky-400 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Google</span>
          </button>

          <button
            onClick={() => { setActiveTab('anthropic'); setError(null); }}
            className={`flex flex-col items-center gap-1 py-2 px-1 rounded-xl text-xs font-medium transition ${
              activeTab === 'anthropic'
                ? 'bg-white dark:bg-zinc-800 text-amber-600 dark:text-amber-400 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <Bot className="w-4 h-4" />
            <span>Claude</span>
          </button>

          <button
            onClick={() => { setActiveTab('github'); setError(null); }}
            className={`flex flex-col items-center gap-1 py-2 px-1 rounded-xl text-xs font-medium transition ${
              activeTab === 'github'
                ? 'bg-white dark:bg-zinc-800 text-purple-600 dark:text-purple-400 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <Github className="w-4 h-4" />
            <span>Copilot</span>
          </button>

          <button
            onClick={() => { setActiveTab('custom'); setError(null); }}
            className={`flex flex-col items-center gap-1 py-2 px-1 rounded-xl text-xs font-medium transition ${
              activeTab === 'custom'
                ? 'bg-white dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <Globe className="w-4 h-4" />
            <span>Custom</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-5">
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-400">
              {error}
            </div>
          )}

          {activeTab === 'google' && (
            <div className="space-y-4">
              {!googleManual ? (
                <div className="text-center py-4 space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-sky-500/10 text-sky-500 mx-auto flex items-center justify-center">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      Sign in with Google OAuth
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-xs mx-auto">
                      Automatically authorizes and extracts quota for Gemini and Claude models in Google Antigravity.
                    </p>
                  </div>

                  <a
                    href="/api/auth/google/start"
                    className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl font-semibold text-xs bg-sky-600 hover:bg-sky-500 text-white shadow-sm shadow-sky-600/25 transition active:scale-95"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Authorize with Google</span>
                  </a>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setGoogleManual(true)}
                      className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 underline"
                    >
                      Or enter OAuth refresh token manually
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmitManual} className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Account Label</label>
                    <input
                      type="text"
                      placeholder="e.g. Work Antigravity"
                      value={label}
                      onChange={e => setLabel(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Email (optional)</label>
                    <input
                      type="email"
                      placeholder="user@gmail.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Refresh Token (Required)</label>
                    <textarea
                      required
                      rows={2}
                      placeholder="1//04..."
                      value={refreshToken}
                      onChange={e => setRefreshToken(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-mono focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => setGoogleManual(false)}
                      className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                    >
                      Back to OAuth
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="py-2 px-4 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition disabled:opacity-50"
                    >
                      {isSubmitting ? 'Saving...' : 'Save Account'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {activeTab === 'anthropic' && (
            <form onSubmit={handleSubmitManual} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Account Label</label>
                <input
                  type="text"
                  placeholder="e.g. Anthropic Primary"
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Anthropic API Key (or Admin Key)</label>
                <input
                  type="password"
                  required
                  placeholder="sk-ant-api03-... or sk-ant-admin..."
                  value={anthropicKey}
                  onChange={e => setAnthropicKey(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <p className="text-[11px] text-zinc-400 mt-1">
                  Supports standard keys (via rate-limit headers) or Admin keys (<code className="font-mono">sk-ant-admin...</code>).
                </p>
              </div>
              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="py-2 px-4 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white transition disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Connect Claude'}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'github' && (
            <form onSubmit={handleSubmitManual} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Account Label</label>
                <input
                  type="text"
                  placeholder="e.g. GitHub Copilot Org"
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Personal Access Token (PAT)</label>
                <input
                  type="password"
                  required
                  placeholder="ghp_... or github_pat_..."
                  value={githubPat}
                  onChange={e => setGithubPat(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">GitHub Organization (optional)</label>
                <input
                  type="text"
                  placeholder="org-name"
                  value={githubOrg}
                  onChange={e => setGithubOrg(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="py-2 px-4 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white transition disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Connect Copilot'}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'custom' && (
            <form onSubmit={handleSubmitManual} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Account Label</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. OpenRouter / Custom Model"
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Endpoint URL</label>
                  <input
                    type="url"
                    required
                    placeholder="https://api.example.com/quota"
                    value={customUrl}
                    onChange={e => setCustomUrl(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Method</label>
                  <select
                    value={customMethod}
                    onChange={e => setCustomMethod(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Bearer Token / API Key</label>
                <input
                  type="password"
                  placeholder="sk-..."
                  value={customToken}
                  onChange={e => setCustomToken(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">JSONPath for Remaining Fraction</label>
                <input
                  type="text"
                  placeholder="e.g. data.remaining_quota or remainingFraction"
                  value={customRemainingPath}
                  onChange={e => setCustomRemainingPath(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="py-2 px-4 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Connect REST API'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
