import React, { useState, useEffect } from 'react';
import { X, ExternalLink, Eye, EyeOff, Info } from 'lucide-react';
import { ProviderMeta } from '../types';
import { ProviderIcon } from './ProviderIcon';

interface AddAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  providers?: ProviderMeta[];
}

export const AddAccountModal: React.FC<AddAccountModalProps> = ({ 
  isOpen, 
  onClose, 
  onSuccess,
  providers: initialProviders = []
}) => {
  const [providers, setProviders] = useState<ProviderMeta[]>(initialProviders);
  const [selectedProviderId, setSelectedProviderId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form values state
  const [label, setLabel] = useState('');
  const [email, setEmail] = useState('');
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [showManualOAuth, setShowManualOAuth] = useState(false);

  // Fetch providers list if not passed from parent
  useEffect(() => {
    if (!isOpen) return;

    const fetchProviders = async () => {
      try {
        const res = await fetch('/api/providers');
        if (res.ok) {
          const data = await res.json();
          if (data.providers && Array.isArray(data.providers)) {
            setProviders(data.providers);
            if (!selectedProviderId && data.providers.length > 0) {
              setSelectedProviderId(data.providers[0].id);
            }
          }
        }
      } catch (err) {
        console.warn('Failed to fetch providers metadata:', err);
      }
    };

    fetchProviders();
  }, [isOpen]);

  // Set default selected provider
  useEffect(() => {
    if (providers.length > 0 && (!selectedProviderId || !providers.some(p => p.id === selectedProviderId))) {
      setSelectedProviderId(providers[0].id);
    }
  }, [providers, selectedProviderId]);

  // Reset form when changing provider
  useEffect(() => {
    if (!selectedProviderId) return;
    const prov = providers.find(p => p.id === selectedProviderId);
    if (!prov) return;

    const defaults: Record<string, any> = {};
    if (prov.fields) {
      for (const f of prov.fields) {
        if (f.defaultValue !== undefined) {
          defaults[f.key] = f.defaultValue;
        }
      }
    }
    setFormValues(defaults);
    setLabel('');
    setEmail('');
    setError(null);
    setShowManualOAuth(false);
  }, [selectedProviderId, providers]);

  // Escape key listener & body scroll lock
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const currentProvider = providers.find(p => p.id === selectedProviderId) || providers[0];

  const handleFieldChange = (key: string, value: any) => {
    setFormValues(prev => ({ ...prev, [key]: value }));
  };

  const togglePasswordVisibility = (key: string) => {
    setShowPasswords(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentProvider) return;

    setIsSubmitting(true);
    setError(null);

    // Validate required fields
    if (currentProvider.fields) {
      for (const field of currentProvider.fields) {
        if (field.required && !formValues[field.key]) {
          setError(`Field '${field.label}' is required.`);
          setIsSubmitting(false);
          return;
        }
      }
    }

    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: currentProvider.id,
          label: label.trim() || `${currentProvider.name} Account`,
          email: email.trim() || undefined,
          credentials: formValues
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
      <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-lg w-full border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
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

        {/* Dynamic Provider Tabs */}
        <div className="p-2 bg-zinc-50 dark:bg-zinc-950/50 border-b border-zinc-200/60 dark:border-zinc-800 shrink-0 overflow-x-auto flex gap-1.5 no-scrollbar">
          {providers.map(p => {
            const isSelected = p.id === selectedProviderId;
            return (
              <button
                key={p.id}
                onClick={() => { setSelectedProviderId(p.id); setError(null); }}
                className={`flex items-center gap-2 py-2 px-3 rounded-xl text-xs font-medium whitespace-nowrap transition shrink-0 ${
                  isSelected
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm border border-zinc-200/80 dark:border-zinc-700/80'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100/60 dark:hover:bg-zinc-800/40'
                }`}
              >
                <ProviderIcon name={p.brand?.icon || p.id} className="w-4 h-4 shrink-0" />
                <span>{p.name}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-400">
              {error}
            </div>
          )}

          {currentProvider && (
            <div>
              {/* Provider Auth Documentation / Helper */}
              {currentProvider.authDoc && (
                <div className="mb-4 p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/70 dark:border-zinc-800 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-zinc-400" />
                      {currentProvider.authDoc.title}
                    </span>
                    {currentProvider.authDoc.linkUrl && (
                      <a
                        href={currentProvider.authDoc.linkUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
                      >
                        <span>{currentProvider.authDoc.linkText || 'Documentation'}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  <p className="text-zinc-500 dark:text-zinc-400 text-[11px] leading-relaxed">
                    {currentProvider.authDoc.description}
                  </p>
                </div>
              )}

              {/* 1-Click OAuth flow (for providers like Google) */}
              {currentProvider.authType === 'oauth' && !showManualOAuth ? (
                <div className="text-center py-4 space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-sky-500/10 text-sky-500 mx-auto flex items-center justify-center">
                    <ProviderIcon name={currentProvider.brand?.icon || currentProvider.id} className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      Authorize with {currentProvider.name}
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-xs mx-auto">
                      Click below to sign in directly with your account and auto-link your quota.
                    </p>
                  </div>

                  <a
                    href={`/api/auth/${currentProvider.id === 'google-antigravity' ? 'google' : currentProvider.id}/start`}
                    className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl font-semibold text-xs bg-sky-600 hover:bg-sky-500 text-white shadow-sm shadow-sky-600/25 transition active:scale-95"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Authorize with {currentProvider.name}</span>
                  </a>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setShowManualOAuth(true)}
                      className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 underline"
                    >
                      Or configure manually via tokens
                    </button>
                  </div>
                </div>
              ) : (
                /* Dynamic Form Fields Generator */
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Account Label */}
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                      Account Label
                    </label>
                    <input
                      type="text"
                      placeholder={`e.g. My ${currentProvider.name}`}
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 text-zinc-900 dark:text-zinc-100"
                    />
                  </div>

                  {/* Render Provider-Specific Fields */}
                  {currentProvider.fields && currentProvider.fields.map(field => {
                    const isPassword = field.type === 'password';
                    const showPass = showPasswords[field.key];
                    const inputType = isPassword ? (showPass ? 'text' : 'password') : field.type;

                    return (
                      <div key={field.key}>
                        <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                          {field.label} {field.required && <span className="text-rose-500">*</span>}
                        </label>

                        {field.type === 'select' ? (
                          <select
                            value={formValues[field.key] ?? field.defaultValue ?? ''}
                            onChange={(e) => handleFieldChange(field.key, e.target.value)}
                            className="w-full px-3 py-2 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 text-zinc-900 dark:text-zinc-100"
                          >
                            {field.options?.map(opt => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        ) : field.type === 'textarea' ? (
                          <textarea
                            rows={3}
                            placeholder={field.placeholder}
                            value={formValues[field.key] ?? ''}
                            onChange={(e) => handleFieldChange(field.key, e.target.value)}
                            className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 text-zinc-900 dark:text-zinc-100"
                          />
                        ) : (
                          <div className="relative">
                            <input
                              type={inputType}
                              placeholder={field.placeholder}
                              value={formValues[field.key] ?? ''}
                              onChange={(e) => handleFieldChange(field.key, e.target.value)}
                              className={`w-full px-3 py-2 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 text-zinc-900 dark:text-zinc-100 ${
                                isPassword ? 'pr-9 font-mono' : ''
                              }`}
                            />
                            {isPassword && (
                              <button
                                type="button"
                                onClick={() => togglePasswordVisibility(field.key)}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                              >
                                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                            )}
                          </div>
                        )}

                        {field.description && (
                          <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500 leading-relaxed">
                            {field.description}
                          </p>
                        )}
                      </div>
                    );
                  })}

                  {/* Optional Email field if not explicitly in provider fields */}
                  {!currentProvider.fields?.some(f => f.key === 'email') && (
                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                        Account Email (Optional)
                      </label>
                      <input
                        type="email"
                        placeholder="user@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 text-zinc-900 dark:text-zinc-100"
                      />
                    </div>
                  )}

                  {/* Back to OAuth button if in manual OAuth mode */}
                  {currentProvider.authType === 'oauth' && showManualOAuth && (
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setShowManualOAuth(false)}
                        className="text-[11px] text-sky-600 dark:text-sky-400 hover:underline"
                      >
                        ← Back to 1-click OAuth
                      </button>
                    </div>
                  )}

                  {/* Submit Button */}
                  <div className="pt-3">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-2.5 px-4 rounded-xl font-semibold text-xs bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-600/25 transition active:scale-95 disabled:opacity-50"
                    >
                      {isSubmitting ? 'Verifying & Saving...' : `Connect ${currentProvider.name}`}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
