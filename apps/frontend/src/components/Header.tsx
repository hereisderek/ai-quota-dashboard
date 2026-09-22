import React, { useState } from 'react';
import { 
  RotateCw, 
  Plus, 
  Settings, 
  Sun, 
  Moon, 
  ShieldCheck,
  Zap,
  Share2,
  User as UserIcon,
  LogOut,
  ChevronDown,
  LogIn,
  Users
} from 'lucide-react';
import { SystemStatus, User } from '../types';

interface HeaderProps {
  status: SystemStatus | null;
  currentUser: User | null;
  wsConnected: boolean;
  isRefreshing: boolean;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onRefreshAll: () => void;
  onOpenAddModal: () => void;
  onOpenSettings: () => void;
  onOpenShareModal: () => void;
  onOpenAuthModal: () => void;
  onOpenUserManagement?: () => void;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  status,
  currentUser,
  wsConnected,
  isRefreshing,
  darkMode,
  onToggleDarkMode,
  onRefreshAll,
  onOpenAddModal,
  onOpenSettings,
  onOpenShareModal,
  onOpenAuthModal,
  onOpenUserManagement,
  onLogout
}) => {
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Logo & Title */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-white">
            <Zap className="w-5 h-5 fill-current" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                AI Quota Dashboard
              </h1>
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                v1.1
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <span className="inline-flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-400'}`} />
                {wsConnected ? 'Live stream' : 'Polling mode'}
              </span>
              {status?.authMode && status.authMode !== 'none' && (
                <span className="hidden md:inline-flex items-center gap-1 text-zinc-400">
                  • <ShieldCheck className="w-3 h-3 text-emerald-500" /> {status.authMode.replace('_', ' ')}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Share Quota Page Button */}
          {currentUser && (
            <button
              onClick={onOpenShareModal}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
                currentUser?.shareEnabled
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                  : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-800'
              }`}
              title="Public Read-Only Share Link"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Share Page</span>
              {currentUser?.shareEnabled && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              )}
            </button>
          )}

          {/* Refresh All Button */}
          <button
            onClick={onRefreshAll}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition border border-zinc-200 dark:border-zinc-800 disabled:opacity-50"
            title="Refresh quotas now"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-500' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {/* Add Account Button */}
          <button
            onClick={onOpenAddModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-600/25 transition active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Connect Account</span>
          </button>

          <div className="h-5 w-px bg-zinc-200 dark:bg-zinc-800 mx-0.5 hidden sm:block" />

          {/* Theme Toggle */}
          <button
            onClick={onToggleDarkMode}
            className="p-2 rounded-lg text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Settings Button */}
          <button
            onClick={onOpenSettings}
            className="p-2 rounded-lg text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            title="Dashboard Settings"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* User Menu / Sign In */}
          {currentUser ? (
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-1.5 p-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition"
                title="User Account"
              >
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-xs">
                  {(currentUser?.displayName || currentUser?.username || 'U')[0].toUpperCase()}
                </div>
                <ChevronDown className="w-3 h-3 text-zinc-400" />
              </button>

              {userMenuOpen && (
                <div
                  onClick={() => setUserMenuOpen(false)}
                  className="fixed inset-0 z-40"
                />
              )}

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl py-1.5 z-50 animate-fade-in text-xs">
                  <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800">
                    <div className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                      {currentUser?.displayName || currentUser?.username}
                    </div>
                    <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-mono">
                      {currentUser?.role || 'user'}
                    </div>
                  </div>

                  {currentUser?.role === 'admin' && (
                    <button
                      onClick={() => { setUserMenuOpen(false); onOpenUserManagement?.(); }}
                      className="w-full px-3 py-2 text-left flex items-center gap-2 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 font-medium"
                    >
                      <Users className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Manage Users</span>
                    </button>
                  )}

                  <button
                    onClick={() => { setUserMenuOpen(false); onOpenShareModal(); }}
                    className="w-full px-3 py-2 text-left flex items-center gap-2 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    <Share2 className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Public Share Link</span>
                  </button>

                  <button
                    onClick={() => { setUserMenuOpen(false); onOpenAuthModal(); }}
                    className="w-full px-3 py-2 text-left flex items-center gap-2 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    <UserIcon className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Switch User / Login</span>
                  </button>

                  <button
                    onClick={() => { setUserMenuOpen(false); onLogout(); }}
                    className="w-full px-3 py-2 text-left flex items-center gap-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 border-t border-zinc-100 dark:border-zinc-800 mt-1"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={onOpenAuthModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-600/20 transition active:scale-95"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
