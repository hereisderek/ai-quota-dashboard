import React from 'react';
import { Users, Cpu, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Account } from '../types';
import { formatCountdown } from '../utils';

interface OverviewStatsProps {
  accounts: Account[];
}

export const OverviewStats: React.FC<OverviewStatsProps> = ({ accounts }) => {
  const totalAccounts = accounts.length;
  const allBuckets = accounts.flatMap(a => a.buckets || []);
  const totalModels = allBuckets.length;

  // Check rate limited / low quota count
  const criticalBuckets = allBuckets.filter(b => b.remainingFraction <= 0.2);
  const isHealthy = criticalBuckets.length === 0;

  // Find earliest reset time
  const upcomingResets = allBuckets
    .filter(b => b.resetTime && new Date(b.resetTime).getTime() > Date.now())
    .map(b => new Date(b.resetTime!).getTime())
    .sort((a, b) => a - b);

  const nearestResetIso = upcomingResets.length > 0 ? new Date(upcomingResets[0]).toISOString() : null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
      {/* Total Accounts */}
      <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Connected Accounts</span>
          <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-400">
            <Users className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">{totalAccounts}</div>
        <div className="mt-1 text-xs text-zinc-500">Across Google, Claude & Copilot</div>
      </div>

      {/* Tracked Models */}
      <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Quota Buckets</span>
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <Cpu className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">{totalModels}</div>
        <div className="mt-1 text-xs text-zinc-500">Active model pipelines</div>
      </div>

      {/* Quota Health */}
      <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">System Health</span>
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            isHealthy 
              ? 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400'
              : 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400'
          }`}>
            {isHealthy ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          </div>
        </div>
        <div className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          {isHealthy ? 'Optimal' : `${criticalBuckets.length} Low`}
        </div>
        <div className="mt-1 text-xs text-zinc-500">
          {isHealthy ? 'All quotas above 20%' : 'Buckets nearing exhaustion'}
        </div>
      </div>

      {/* Nearest Reset */}
      <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Next Reset</span>
          <div className="w-8 h-8 rounded-lg bg-teal-500/10 dark:bg-teal-500/20 flex items-center justify-center text-teal-600 dark:text-teal-400">
            <Clock className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          {nearestResetIso ? formatCountdown(nearestResetIso).replace('Resets in ', '') : '—'}
        </div>
        <div className="mt-1 text-xs text-zinc-500">
          {nearestResetIso ? 'Earliest scheduled refresh' : 'No countdown pending'}
        </div>
      </div>
    </div>
  );
};
