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
  Globe,
  ChevronDown,
  Code2,
  Copy,
  Check,
  Server
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
  const [showDetails, setShowDetails] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await onRefresh(account.id);
    setTimeout(() => setIsRefreshing(false), 800);
  };

  const handleCopyRaw = () => {
    if (!account.rawResponse) return;
    const text = typeof account.rawResponse === 'string'
      ? account.rawResponse
      : JSON.stringify(account.rawResponse, null, 2);
    navigator.clipboard.writeText(text);
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  // Provider branding
  const getProviderBrand = (providerId: string) => {
    switch (providerId) {
      case 'google-antigravity':
        return {
          name: 'Google Antigravity',
          icon: <Sparkles className="w-5 h-5 text-sky-500" />,
          badgeClass: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20'
        };
      case 'anthropic':
        return {
          name: 'Anthropic Claude',
          icon: <Bot className="w-5 h-5 text-amber-500" />,
          badgeClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20'
        };
      case 'github-copilot':
        return {
          name: 'GitHub Copilot',
          icon: <Github className="w-5 h-5 text-purple-500" />,
          badgeClass: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20'
        };
      default:
        return {
          name: 'Custom REST API',
          icon: <Globe className="w-5 h-5 text-emerald-500" />,
          badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
        };
    }
  };

  const brand = getProviderBrand(account.providerId);

  // Clean title: avoid duplicating email if label is "Google (email)"
  let displayTitle = account.label;
  if (account.email && (account.label === `Google (${account.email})` || account.label.includes(account.email))) {
    displayTitle = brand.name;
  }

  // Clean plan/tier badge
  const rawTier = (account as any).tier || (account as any).plan || (account.credentials?.tier) || (account.credentials?.plan);
  let planBadge: string | null = null;
  if (rawTier) {
    if (rawTier === 'PRO' || rawTier.includes('Pro') || rawTier.includes('standard')) {
      planBadge = 'Google AI Pro';
    } else if (rawTier === 'ULTRA' || rawTier.includes('Ultra')) {
      planBadge = 'Google AI Ultra';
    } else if (rawTier === 'FREE' || rawTier.includes('free')) {
      planBadge = 'Free Tier';
    } else {
      planBadge = rawTier;
    }
  }

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
      <div>
        {/* Top Bar: Provider, Title, Email & Actions */}
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-zinc-100 dark:border-zinc-800/80">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80 flex items-center justify-center shrink-0 border border-zinc-200/50 dark:border-zinc-700/50 shadow-sm">
              {brand.icon}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-sm sm:text-base truncate">
                  {displayTitle}
                </h3>
                {planBadge && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                    {planBadge}
                  </span>
                )}
              </div>
              {account.email && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono truncate mt-0.5">
                  {account.email}
                </p>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2 rounded-xl text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 bg-zinc-100/80 dark:bg-zinc-800/60 hover:bg-zinc-200/80 dark:hover:bg-zinc-700/80 transition border border-zinc-200/60 dark:border-zinc-700/60 disabled:opacity-50"
              title="Poll quota now"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-500' : ''}`} />
            </button>

            {confirmDelete ? (
              <div className="flex items-center gap-1 bg-rose-50 dark:bg-rose-950/40 p-1 rounded-xl border border-rose-200 dark:border-rose-900 animate-fade-in">
                <button
                  onClick={() => onDelete(account.id)}
                  className="px-2 py-1 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline"
                >
                  Delete
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-1.5 py-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="p-2 rounded-xl text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition border border-transparent hover:border-rose-200 dark:hover:border-rose-900/50"
                title="Delete account"
              >
                <Trash2 className="w-3.5 h-3.5" />
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

        {/* Quota Buckets List */}
        <div className="mt-4 space-y-3">
          {account.buckets && account.buckets.length > 0 ? (
            account.buckets.map((bucket, idx) => {
              const colors = getQuotaColor(bucket.remainingFraction);
              const remainingPercent = Math.round(bucket.remainingFraction * 100);
              const countdown = formatCountdown(bucket.resetTime);

              return (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-zinc-50/80 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-zinc-800 space-y-2.5 transition hover:border-zinc-300 dark:hover:border-zinc-700"
                >
                  {/* Row 1: Model Name & Percentage / Raw Count */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 truncate">
                      {formatModelName(bucket.modelId)}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {bucket.remainingAmount != null && (
                        <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800/80 px-2 py-0.5 rounded-md border border-zinc-200/50 dark:border-zinc-700/50">
                          {bucket.limitAmount != null
                            ? `${bucket.remainingAmount.toLocaleString()} / ${bucket.limitAmount.toLocaleString()}`
                            : `${bucket.remainingAmount.toLocaleString()} left`}
                        </span>
                      )}
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-lg border ${colors.bg} ${colors.text} ${colors.border} shrink-0`}>
                        {remainingPercent}%
                      </span>
                    </div>
                  </div>

                  {/* Row 2: Progress bar */}
                  <div className="w-full h-2 rounded-full bg-zinc-200/80 dark:bg-zinc-700/60 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ease-out ${colors.bar}`}
                      style={{ width: `${remainingPercent}%` }}
                    />
                  </div>

                  {/* Row 3: Token Type & Countdown */}
                  <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-0.5">
                    <span className="uppercase tracking-wider font-mono text-[10px] text-zinc-400 dark:text-zinc-500">
                      {bucket.tokenType || 'Requests'}
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
            <div className="py-8 text-center text-xs text-zinc-400">
              {account.status === 'active' ? 'Polling quota in background...' : 'No quota data available'}
            </div>
          )}
        </div>
      </div>

      {/* Card footer info */}
      <div className="mt-5 pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-400">
        <span className="flex items-center gap-1.5">
          {account.status === 'active' ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-emerald-700 dark:text-emerald-400 font-medium">Active</span>
            </>
          ) : account.status === 'rate_limited' ? (
            <>
              <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-amber-700 dark:text-amber-400 font-medium">Rate Limited</span>
            </>
          ) : (
            <>
              <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
              <span className="text-rose-700 dark:text-rose-400 font-medium">Error</span>
            </>
          )}
        </span>

        <div className="flex items-center gap-2">
          <span>
            {account.lastPolledAt ? `Updated ${new Date(account.lastPolledAt).toLocaleTimeString()}` : 'Never polled'}
          </span>
          <button
            onClick={() => setShowDetails(!showDetails)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold transition border ${
              showDetails
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-transparent shadow-sm'
                : 'text-zinc-600 dark:text-zinc-300 bg-zinc-100/80 dark:bg-zinc-800/60 hover:bg-zinc-200/80 dark:hover:bg-zinc-700/80 border-zinc-200/60 dark:border-zinc-700/60'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>{showDetails ? 'Hide Details' : 'Details'}</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showDetails ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Expandable Provider Details & Raw Response */}
      {showDetails && (
        <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800/80 space-y-3.5 animate-fade-in text-xs">
          {/* Key-Value Quick Specs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-zinc-800">
            <div>
              <span className="text-[10px] text-zinc-400 block uppercase font-mono">Provider ID</span>
              <span className="font-mono text-zinc-800 dark:text-zinc-200 font-semibold">{account.providerId}</span>
            </div>
            <div>
              <span className="text-[10px] text-zinc-400 block uppercase font-mono">Account ID</span>
              <span className="font-mono text-zinc-800 dark:text-zinc-200 truncate block" title={account.id}>{account.id}</span>
            </div>
            <div>
              <span className="text-[10px] text-zinc-400 block uppercase font-mono">Tier / Plan</span>
              <span className="text-zinc-800 dark:text-zinc-200 font-medium">{planBadge || account.tier || 'Standard'}</span>
            </div>
            {account.credentials?.companionProject && (
              <div>
                <span className="text-[10px] text-zinc-400 block uppercase font-mono">Companion Project</span>
                <span className="font-mono text-zinc-800 dark:text-zinc-200 truncate block">{account.credentials.companionProject}</span>
              </div>
            )}
            {account.credentials?.accountType && (
              <div>
                <span className="text-[10px] text-zinc-400 block uppercase font-mono">Account Type</span>
                <span className="text-zinc-800 dark:text-zinc-200 capitalize">{account.credentials.accountType}</span>
              </div>
            )}
            {account.credentials?.org && (
              <div>
                <span className="text-[10px] text-zinc-400 block uppercase font-mono">Organization</span>
                <span className="text-zinc-800 dark:text-zinc-200">{account.credentials.org}</span>
              </div>
            )}
            <div>
              <span className="text-[10px] text-zinc-400 block uppercase font-mono">Last Polled</span>
              <span className="text-zinc-800 dark:text-zinc-200">
                {account.lastPolledAt ? new Date(account.lastPolledAt).toLocaleString() : 'Never'}
              </span>
            </div>
          </div>

          {/* Raw Provider Response Block */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-zinc-400" />
                <span>Provider Response Payload</span>
              </span>
              {account.rawResponse && (
                <button
                  onClick={handleCopyRaw}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                >
                  {copiedJson ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-500" />
                      <span className="text-emerald-500">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy JSON</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {account.rawResponse ? (
              <div className="relative rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950 text-zinc-200">
                <pre className="p-3.5 max-h-64 overflow-auto font-mono text-[11px] leading-relaxed select-text">
                  {typeof account.rawResponse === 'string'
                    ? account.rawResponse
                    : JSON.stringify(account.rawResponse, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/30 border border-zinc-200/60 dark:border-zinc-800 text-center text-zinc-400 text-xs">
                No raw provider response stored yet. Click the refresh button above to query this provider now.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
