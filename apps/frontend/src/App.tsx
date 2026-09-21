import React, { useState, useEffect, useMemo } from 'react';
import { useQuotaStream } from './hooks/useQuotaStream';
import { Header } from './components/Header';
import { OverviewStats } from './components/OverviewStats';
import { AccountCard } from './components/AccountCard';
import { AddAccountModal } from './components/AddAccountModal';
import { SettingsModal } from './components/SettingsModal';
import { ShareModal } from './components/ShareModal';
import { AuthModal } from './components/AuthModal';
import { ShareView } from './pages/ShareView';
import { Plus, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';

export function App() {
  // Check if current URL is a public share route (e.g. /share/derek)
  const pathname = window.location.pathname;
  if (pathname.startsWith('/share/')) {
    const slug = pathname.replace(/^\/share\/?/, '').split('/')[0];
    return <ShareView slug={slug} />;
  }

  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark' ||
      (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  const [selectedProviderFilter, setSelectedProviderFilter] = useState<string>('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isSetupMode, setIsSetupMode] = useState(false);
  const [bannerNotice, setBannerNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const {
    accounts,
    status,
    settings,
    currentUser,
    isLoading,
    isRefreshing,
    wsConnected,
    refreshAll,
    refreshAccount,
    deleteAccount,
    logout,
    reload,
    reloadMetadata
  } = useQuotaStream();

  // Dark mode effect
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  // Check setup status on first launch
  useEffect(() => {
    fetch('/api/auth/setup-status')
      .then(r => r.json())
      .then(data => {
        if (data.setupRequired) {
          setIsSetupMode(true);
          setIsAuthModalOpen(true);
        }
      })
      .catch(() => {});
  }, []);

  // Handle URL query parameters from OAuth callbacks
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth_success')) {
      const acc = params.get('account') || 'Google Account';
      setBannerNotice({
        type: 'success',
        message: `Successfully connected ${acc}! Initial quota synchronization triggered.`
      });
      reload();
      reloadMetadata();
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (params.get('auth_error')) {
      setBannerNotice({
        type: 'error',
        message: `OAuth authorization failed: ${params.get('auth_error')}`
      });
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [reload, reloadMetadata]);

  // Responsive window width tracking for masonry flex layout
  const [windowWidth, setWindowWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1200
  );

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Filtered accounts
  const filteredAccounts = accounts.filter(acc => {
    if (selectedProviderFilter === 'all') return true;
    return acc.providerId === selectedProviderFilter;
  });

  // Calculate dynamic masonry flex columns
  const numColumns = useMemo(() => {
    if (windowWidth < 768 || filteredAccounts.length <= 1) return 1;
    if (windowWidth < 1280 || filteredAccounts.length === 2) return 2;
    return Math.min(filteredAccounts.length, 3);
  }, [windowWidth, filteredAccounts.length]);

  // Distribute accounts into columns based on height/weight to stack smaller cards vertically
  const accountColumns = useMemo(() => {
    if (numColumns <= 1) return [filteredAccounts];

    const cols: typeof filteredAccounts[] = Array.from({ length: numColumns }, () => []);
    const heights = new Array(numColumns).fill(0);

    for (const account of filteredAccounts) {
      // Find column with least accumulated height
      let shortestCol = 0;
      for (let i = 1; i < numColumns; i++) {
        if (heights[i] < heights[shortestCol]) {
          shortestCol = i;
        }
      }
      cols[shortestCol].push(account);
      // Card weight: base 180px + 65px per bucket + 50px if error
      heights[shortestCol] += 180 + (account.buckets?.length || 1) * 65 + (account.lastError ? 50 : 0);
    }
    return cols;
  }, [filteredAccounts, numColumns]);

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors">
      <Header
        status={status}
        currentUser={currentUser}
        wsConnected={wsConnected}
        isRefreshing={isRefreshing}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode(!darkMode)}
        onRefreshAll={refreshAll}
        onOpenAddModal={() => setIsAddModalOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenShareModal={() => setIsShareModalOpen(true)}
        onOpenAuthModal={() => { setIsSetupMode(false); setIsAuthModalOpen(true); }}
        onLogout={logout}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Banner Alert if OAuth returned */}
        {bannerNotice && (
          <div className={`mb-6 p-4 rounded-2xl flex items-center justify-between gap-3 border shadow-sm ${
            bannerNotice.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
          }`}>
            <div className="flex items-center gap-2.5 text-xs sm:text-sm">
              {bannerNotice.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
              )}
              <span>{bannerNotice.message}</span>
            </div>
            <button
              onClick={() => setBannerNotice(null)}
              className="text-xs font-semibold px-2 py-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Overview Stats */}
        <OverviewStats accounts={accounts} />

        {/* Provider Filters Bar */}
        <div className="flex items-center justify-between gap-3 mb-6 pb-2 border-b border-zinc-200/60 dark:border-zinc-800/60">
          <div className="flex items-center gap-1.5 overflow-x-auto py-1">
            {[
              { id: 'all', label: 'All Providers' },
              { id: 'google-antigravity', label: 'Google Antigravity' },
              { id: 'anthropic', label: 'Anthropic Claude' },
              { id: 'github-copilot', label: 'GitHub Copilot' },
              { id: 'generic-rest', label: 'Custom APIs' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setSelectedProviderFilter(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition ${
                  selectedProviderFilter === tab.id
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/60'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="text-xs text-zinc-400 shrink-0 hidden sm:block">
            Showing {filteredAccounts.length} of {accounts.length}
          </div>
        </div>

        {/* Accounts Grid */}
        {isLoading ? (
          <div className="py-20 text-center text-zinc-400 text-sm animate-pulse">
            Loading quota streams...
          </div>
        ) : filteredAccounts.length > 0 ? (
          <div className={
            filteredAccounts.length === 1
              ? "max-w-2xl mx-auto w-full"
              : filteredAccounts.length === 2
              ? "flex flex-col md:flex-row gap-6 items-start max-w-5xl mx-auto w-full"
              : "flex flex-col md:flex-row gap-6 items-start w-full"
          }>
            {accountColumns.map((colAccounts, colIdx) => (
              <div key={colIdx} className="flex-1 flex flex-col gap-6 min-w-0 w-full">
                {colAccounts.map(account => (
                  <AccountCard
                    key={account.id}
                    account={account}
                    onRefresh={refreshAccount}
                    onDelete={deleteAccount}
                  />
                ))}
              </div>
            ))}
          </div>
        ) : (
          /* Empty State */
          <div className="py-20 text-center max-w-md mx-auto">
            <div className="w-16 h-16 rounded-3xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center mx-auto text-zinc-400 mb-4 shadow-inner">
              <Sparkles className="w-8 h-8 text-emerald-500" />
            </div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">No accounts connected yet</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 mb-6">
              Connect your Google Antigravity, Anthropic Claude, or GitHub Copilot accounts to begin real-time quota tracking.
            </p>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 transition active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Connect First Account</span>
            </button>
          </div>
        )}
      </main>

      {/* Modals */}
      <AddAccountModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={reload}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        status={status}
        onSave={reload}
      />

      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        currentUser={currentUser}
        onUpdateSuccess={reloadMetadata}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        isSetup={isSetupMode}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={() => {
          reload();
          reloadMetadata();
        }}
      />

      {/* Footer */}
      <footer className="border-t border-zinc-200/60 dark:border-zinc-800/60 py-6 mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center text-xs text-zinc-400">
          AI Quota Dashboard • Built with Node.js, Fastify, SQLite & React
        </div>
      </footer>
    </div>
  );
}

export default App;
