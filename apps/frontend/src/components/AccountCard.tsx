import React, { useState } from 'react';
import { 
  RotateCw, 
  Trash2, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Sparkles,
  Bot,
  Github,
  Globe
} from 'lucide-react';
import { Account } from '../types';
import { formatCountdown, getQuotaColor, formatModelName } from '../utils';

interface AccountCardProps {
  account: Account;
  onRefresh: (id: string) => void;
  onDelete: (id: string) => void;
}

export const AccountCard: React.FC<AccountCardProps> = ({ account, onRefresh, onDelete }) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await onRefresh(account.id);
    setTimeout(() => setIsRefreshing(false), 800);
  };

  // Provider branding
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
          name: 'Custom REST API',
          icon: <Globe className="w-4 h-4 text-emerald-500" />,
          badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
        };
    }
  };

  const brand = getProviderBrand(account.providerId);

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 p-5 shadow-sm hover:shadow-md transition-shadow">
      {/* Top Bar: Provider, Label & Actions */}
      <div className="flex items-start justify-between gap-3 pb-4 border-b border-zinc-100 dark:border-zinc-800/60">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
            {brand.icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm sm:text-base">
                {account.label}
              </h3>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${brand.badgeClass}`}>
                {brand.name}
              </span>
              {(account.plan || account.tier) && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                  {account.plan || (account.tier === 'PRO' ? 'Google AI Pro' : account.tier === 'ULTRA' ? 'Google AI Ultra' : 'Free Tier')}
                </span>
              )}
            </div>
            {account.email && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                {account.email}
              </p>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            title="Poll quota now"
          >
            <RotateCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-emerald-500' : ''}`} />
          </button>

          {confirmDelete ? (
            <div className="flex items-center gap-1 bg-rose-50 dark:bg-rose-950/30 p-1 rounded-lg border border-rose-200 dark:border-rose-900">
              <button
                onClick={() => onDelete(account.id)}
                className="px-2 py-0.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline"
              >
                Delete
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-1.5 py-0.5 text-xs text-zinc-400 hover:text-zinc-600"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
              title="Delete account"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Error state alert if any */}
      {account.status === 'error' && account.lastError && (
        <div className="mt-3 p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 flex items-start gap-2 text-xs text-rose-700 dark:text-rose-400">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="truncate">{account.lastError}</div>
        </div>
      )}

      {/* Buckets list */}
      <div className="mt-4 space-y-3.5">
        {account.buckets && account.buckets.length > 0 ? (
          account.buckets.map((bucket, idx) => {
            const colors = getQuotaColor(bucket.remainingFraction);
            const remainingPercent = Math.round(bucket.remainingFraction * 100);
            const countdown = formatCountdown(bucket.resetTime);

            return (
              <div key={idx} className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/50 dark:border-zinc-800">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="font-medium text-xs sm:text-sm text-zinc-800 dark:text-zinc-200">
                    {formatModelName(bucket.modelId)}
                  </span>
                  <div className="flex items-center gap-2">
                    {countdown && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                        <Clock className="w-3 h-3" />
                        {countdown}
                      </span>
                    )}
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${colors.bg} ${colors.text}`}>
                      {remainingPercent}%
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full h-2 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ease-out ${colors.bar}`}
                    style={{ width: `${remainingPercent}%` }}
                  />
                </div>
              </div>
            );
          })
        ) : (
          <div className="py-6 text-center text-xs text-zinc-400">
            {account.status === 'active' ? 'Polling quota in background...' : 'No quota data available'}
          </div>
        )}
      </div>

      {/* Card footer info */}
      <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/60 flex items-center justify-between text-[11px] text-zinc-400">
        <span className="flex items-center gap-1">
          {account.status === 'active' ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Active
            </>
          ) : account.status === 'rate_limited' ? (
            <>
              <AlertCircle className="w-3.5 h-3.5 text-amber-500" /> Rate Limited
            </>
          ) : (
            <>
              <AlertCircle className="w-3.5 h-3.5 text-rose-500" /> Error
            </>
          )}
        </span>
        <span>
          {account.lastPolledAt ? `Updated ${new Date(account.lastPolledAt).toLocaleTimeString()}` : 'Never polled'}
        </span>
      </div>
    </div>
  );
};
