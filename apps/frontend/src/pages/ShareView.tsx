import React, { useState, useEffect, useCallback } from 'react';
import { 
  Sparkles, 
  Bot, 
  Github, 
  Globe, 
  Clock, 
  ShieldCheck, 
  Sun, 
  Moon, 
  RotateCw,
  Lock,
  Zap
} from 'lucide-react';
import { ShareData } from '../types';
import { formatCountdown, getQuotaColor, formatModelName } from '../utils';

interface ShareViewProps {
  slug: string;
}

export const ShareView: React.FC<ShareViewProps> = ({ slug }) => {
  const [data, setData] = useState<ShareData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark' ||
      (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/share/${encodeURIComponent(slug)}`);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('This quota share page is either private, disabled, or does not exist.');
        }
        throw new Error('Failed to load quota metrics.');
      }
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchData();
    // Periodic auto-refresh every 30 seconds for viewers
    const timer = setInterval(fetchData, 30000);
    return () => clearInterval(timer);
  }, [fetchData]);

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    fetchData();
  };

  const getProviderBrand = (providerId: string) => {
    switch (providerId) {
      case 'google-antigravity':
        return {
          name: 'Google Antigravity',
          icon: <Sparkles className="w-4 h-4 text-sky-500" />,
          badgeClass: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20'
        };
      case 'anthropic':
        return {
          name: 'Anthropic Claude',
          icon: <Bot className="w-4 h-4 text-amber-500" />,
          badgeClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20'
        };
      case 'github-copilot':
        return {
          name: 'GitHub Copilot',
          icon: <Github className="w-4 h-4 text-purple-500" />,
          badgeClass: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20'
        };
      default:
        return {
          name: 'Custom API',
          icon: <Globe className="w-4 h-4 text-emerald-500" />,
          badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
        };
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
              <Zap className="w-4 h-4 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-100">
                  {data?.title || 'AI Quota Monitor'}
                </h1>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                  <ShieldCheck className="w-3 h-3" /> Read-Only
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Shared status • Updated in real-time
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="p-2 rounded-lg text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
              title="Refresh Quotas"
            >
              <RotateCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-emerald-500' : ''}`} />
            </button>

            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-lg text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
              title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8">
        {isLoading ? (
          <div className="py-24 text-center text-zinc-400 text-sm animate-pulse">
            Loading quota metrics...
          </div>
        ) : error ? (
          <div className="py-20 text-center max-w-md mx-auto">
            <div className="w-16 h-16 rounded-3xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center mx-auto text-zinc-400 mb-4 shadow-inner">
              <Lock className="w-8 h-8 text-amber-500" />
            </div>
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Page Private or Disabled</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 mb-6">
              {error}
            </p>
            <a
              href="/"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 transition hover:opacity-90"
            >
              Return to Dashboard
            </a>
          </div>
        ) : data && data.accounts.length > 0 ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {data.accounts.map(acc => {
                const brand = getProviderBrand(acc.providerId);
                const planBadge = acc.tier === 'PRO' ? 'Google AI Pro' : acc.tier === 'ULTRA' ? 'Google AI Ultra' : acc.tier;

                return (
                  <div
                    key={acc.id}
                    className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 p-5 shadow-sm"
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800/80 mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 flex items-center justify-center border border-zinc-200/50 dark:border-zinc-700/50 shadow-sm">
                          {brand.icon}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-sm sm:text-base text-zinc-900 dark:text-zinc-100">
                              {brand.name}
                            </h3>
                            {planBadge && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                                {planBadge}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-zinc-400">
                            {acc.label}
                          </span>
                        </div>
                      </div>

                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                        {acc.status === 'active' ? 'Active' : acc.status}
                      </span>
                    </div>

                    {/* Model Buckets */}
                    <div className="space-y-3">
                      {acc.buckets && acc.buckets.length > 0 ? (
                        acc.buckets.map((b, idx) => {
                          const colors = getQuotaColor(b.remainingFraction);
                          const remainingPercent = Math.round(b.remainingFraction * 100);
                          const countdown = formatCountdown(b.resetTime);

                          return (
                            <div
                              key={idx}
                              className="p-3.5 rounded-xl bg-zinc-50/80 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-zinc-800 space-y-2.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 truncate">
                                  {formatModelName(b.modelId)}
                                </span>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-lg border ${colors.bg} ${colors.text} ${colors.border} shrink-0`}>
                                  {remainingPercent}%
                                </span>
                              </div>

                              <div className="w-full h-2 rounded-full bg-zinc-200/80 dark:bg-zinc-700/60 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-700 ease-out ${colors.bar}`}
                                  style={{ width: `${remainingPercent}%` }}
                                />
                              </div>

                              <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-0.5">
                                <span className="uppercase tracking-wider font-mono text-[10px] text-zinc-400 dark:text-zinc-500">
                                  {b.tokenType || 'Requests'}
                                </span>
                                {countdown && (
                                  <span className="inline-flex items-center gap-1 font-medium text-zinc-500 dark:text-zinc-400 shrink-0 whitespace-nowrap">
                                    <Clock className="w-3 h-3 text-zinc-400" />
                                    <span>{countdown}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="py-6 text-center text-xs text-zinc-400">
                          No model quotas recorded
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="py-20 text-center text-zinc-400 text-sm">
            No accounts or active quotas to display.
          </div>
        )}
      </main>

      <footer className="border-t border-zinc-200/60 dark:border-zinc-800/60 py-6 mt-auto">
        <div className="max-w-5xl mx-auto px-4 text-center text-xs text-zinc-400">
          AI Quota Monitor • Public Read-Only View
        </div>
      </footer>
    </div>
  );
};
