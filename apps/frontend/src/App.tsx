import React, { useState, useEffect, useMemo } from 'react';
import { useQuotaStream } from './hooks/useQuotaStream';
import { Header } from './components/Header';
import { OverviewStats } from './components/OverviewStats';
import { AccountCard } from './components/AccountCard';
import { AddAccountModal } from './components/AddAccountModal';
import { SettingsModal } from './components/SettingsModal';
import { ShareModal } from './components/ShareModal';
import { AuthModal } from './components/AuthModal';
import { UserManagementModal } from './components/UserManagementModal';
import { ShareView } from './pages/ShareView';
import { Plus, CheckCircle2, AlertCircle, Sparkles, ArrowUpDown, Lock, LogIn } from 'lucide-react';
import { Account } from './types';

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
  const [isUserManagementOpen, setIsUserManagementOpen] = useState(false);
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

  // Sort accounts based on user preference: default to low-to-high
  const [sortOption, setSortOption] = useState<'low-to-high' | 'high-to-low' | 'name' | 'recent'>('low-to-high');

  const sortedAccounts = useMemo(() => {
    const list = [...filteredAccounts];
    const getMinRemaining = (acc: Account) => {
      if (!acc.buckets || acc.buckets.length === 0) return 1.0;
      return Math.min(...acc.buckets.map(b => b.remainingFraction));
    };

    if (sortOption === 'low-to-high') {
      return list.sort((a, b) => getMinRemaining(a) - getMinRemaining(b));
    }
    if (sortOption === 'high-to-low') {
      return list.sort((a, b) => getMinRemaining(b) - getMinRemaining(a));
    }
    if (sortOption === 'name') {
      return list.sort((a, b) => a.label.localeCompare(b.label));
    }
    if (sortOption === 'recent') {
      return list.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
    }
    return list;
  }, [filteredAccounts, sortOption]);

  // Calculate dynamic masonry flex columns
  const numColumns = useMemo(() => {
    if (windowWidth < 768 || sortedAccounts.length <= 1) return 1;
    if (windowWidth < 1280 || sortedAccounts.length === 2) return 2;
    return Math.min(sortedAccounts.length, 3);
  }, [windowWidth, sortedAccounts.length]);

  // Distribute accounts into columns based on height/weight to stack smaller cards vertically
  const accountColumns = useMemo(() => {
    if (numColumns <= 1) return [sortedAccounts];

    const cols: typeof sortedAccounts[] = Array.from({ length: numColumns }, () => []);
    const heights = new Array(numColumns).fill(0);

    for (const account of sortedAccounts) {
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
  }, [sortedAccounts, numColumns]);

  // Dynamically compute available provider filter tabs
  const availableProviderTabs = useMemo(() => {
    const tabs: Array<{ id: string; label: string }> = [{ id: 'all', label: 'All Providers' }];
    const seen = new Set<string>();

    const metaList = status?.providers || [];
    for (const p of metaList) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        tabs.push({ id: p.id, label: p.brand?.name || p.name });
      }
    }

    for (const a of accounts) {
      if (!seen.has(a.providerId)) {
        seen.add(a.providerId);
        tabs.push({ id: a.providerId, label: a.providerId });
      }
    }

    return tabs;
  }, [status?.providers, accounts]);

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
        onOpenAddModal={() => {
          if (!currentUser) {
            setIsSetupMode(false);
            setIsAuthModalOpen(true);
          } else {
            setIsAddModalOpen(true);
          }
        }}
        onOpenSettings={() => {
          if (!currentUser) {
            setIsSetupMode(false);
            setIsAuthModalOpen(true);
          } else {
            setIsSettingsOpen(true);
          }
        }}
        onOpenShareModal={() => {
          if (!currentUser) {
            setIsSetupMode(false);
            setIsAuthModalOpen(true);
          } else {
            setIsShareModalOpen(true);
          }
        }}
        onOpenAuthModal={() => { setIsSetupMode(false); setIsAuthModalOpen(true); }}
        onOpenUserManagement={() => setIsUserManagementOpen(true)}
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

        {/* Provider Filters & Sort Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-2 border-b border-zinc-200/60 dark:border-zinc-800/60">
          <div className="flex items-center gap-1.5 overflow-x-auto py-1">
            {availableProviderTabs.map(tab => (
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

          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              <ArrowUpDown className="w-3.5 h-3.5 text-zinc-400" />
              <span className="hidden sm:inline">Sort:</span>
              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as any)}
                className="bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200/70 dark:border-zinc-700/70 text-zinc-800 dark:text-zinc-200 text-xs rounded-xl px-2.5 py-1.5 focus:ring-1 focus:ring-emerald-500 focus:outline-none cursor-pointer"
              >
                <option value="low-to-high">Lowest Quota First (Low → High)</option>
                <option value="high-to-low">Highest Quota First (High → Low)</option>
                <option value="name">Provider Name</option>
                <option value="recent">Recently Updated</option>
              </select>
            </div>

            <div className="text-xs text-zinc-400 shrink-0 hidden md:block">
              Showing {sortedAccounts.length} of {accounts.length}
            </div>
          </div>
        </div>

        {/* Accounts Grid */}
        {isLoading ? (
          <div className="py-20 text-center text-zinc-400 text-sm animate-pulse">
            Loading quota streams...
          </div>
        ) : sortedAccounts.length > 0 ? (
          <div className={
            sortedAccounts.length === 1
              ? "max-w-2xl mx-auto w-full"
              : sortedAccounts.length === 2
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
        ) : !currentUser ? (
          /* Unauthenticated State */
          <div className="py-20 text-center max-w-md mx-auto animate-fade-in">
            <div className="w-16 h-16 rounded-3xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center mx-auto text-zinc-400 mb-4 shadow-inner">
              <Lock className="w-8 h-8 text-emerald-500" />
            </div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              Sign In to Access Dashboard
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 mb-6">
              You are currently browsing without an active session. Sign in to view your token quotas, live streams, and manage connected AI providers.
            </p>
            <button
              onClick={() => { setIsSetupMode(false); setIsAuthModalOpen(true); }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-xs bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 transition active:scale-95"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign In</span>
            </button>
          </div>
        ) : (
          /* Empty Accounts State */
          <div className="py-20 text-center max-w-md mx-auto animate-fade-in">
            <div className="w-16 h-16 rounded-3xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center mx-auto text-zinc-400 mb-4 shadow-inner">
              <Sparkles className="w-8 h-8 text-emerald-500" />
            </div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              {selectedProviderFilter !== 'all'
                ? `No ${status?.providers?.find(p => p.id === selectedProviderFilter)?.name || selectedProviderFilter} accounts connected`
                : 'No accounts connected yet'}
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 mb-6">
              {selectedProviderFilter !== 'all'
                ? `Connect your ${status?.providers?.find(p => p.id === selectedProviderFilter)?.name || selectedProviderFilter} account or API key to track token quotas and usage.`
                : 'Connect your Google Antigravity, Anthropic Claude, DeepSeek, or other accounts to begin real-time quota tracking.'}
            </p>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 transition active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Connect {selectedProviderFilter !== 'all' ? (status?.providers?.find(p => p.id === selectedProviderFilter)?.name || selectedProviderFilter) : 'First Account'}</span>
            </button>
          </div>
        )}
      </main>

      {/* Modals */}
      <AddAccountModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={reload}
        providers={status?.providers}
        defaultProviderId={selectedProviderFilter !== 'all' ? selectedProviderFilter : undefined}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        status={status}
        currentUser={currentUser}
        onSave={reload}
      />

      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        currentUser={currentUser}
        onUpdateSuccess={reloadMetadata}
      />

      <UserManagementModal
        isOpen={isUserManagementOpen}
        onClose={() => setIsUserManagementOpen(false)}
        currentUser={currentUser}
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
