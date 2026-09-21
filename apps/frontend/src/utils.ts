export function formatCountdown(resetTimeIso: string | null | undefined): string {
  if (!resetTimeIso) return '';
  const target = new Date(resetTimeIso).getTime();
  const now = Date.now();
  const diff = target - now;

  if (diff <= 0) return 'Resetting now';

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `Resets in ${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `Resets in ${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `Resets in ${minutes}m ${seconds}s`;
  }
  return `Resets in ${seconds}s`;
}

export function getQuotaColor(fraction: number): {
  bg: string;
  bar: string;
  text: string;
  border: string;
} {
  if (fraction > 0.5) {
    return {
      bg: 'bg-emerald-500/10 dark:bg-emerald-500/20',
      bar: 'bg-emerald-500',
      text: 'text-emerald-700 dark:text-emerald-400',
      border: 'border-emerald-500/20'
    };
  }
  if (fraction > 0.2) {
    return {
      bg: 'bg-amber-500/10 dark:bg-amber-500/20',
      bar: 'bg-amber-500',
      text: 'text-amber-700 dark:text-amber-400',
      border: 'border-amber-500/20'
    };
  }
  return {
    bg: 'bg-rose-500/10 dark:bg-rose-500/20',
    bar: 'bg-rose-500',
    text: 'text-rose-700 dark:text-rose-400',
    border: 'border-rose-500/20'
  };
}

export function formatModelName(modelId: string): string {
  const map: Record<string, string> = {
    'gemini-ultra': 'Gemini Ultra',
    'gemini-2.5-pro': 'Gemini 2.5 Pro',
    'gemini-3.8-flash': 'Gemini 3.8 Flash',
    'gemini-3-pro-preview': 'Gemini 3 Pro',
    'gemini-3.1-pro': 'Gemini 3.1 Pro',
    'gemini-3.5-flash': 'Gemini 3.5 Flash',
    'claude-3-5-sonnet': 'Claude 3.5 Sonnet',
    'claude-3-7-sonnet': 'Claude 3.7 Sonnet',
    'claude-3-opus': 'Claude 3 Opus',
    'claude-opus-4.6': 'Claude Opus 4.6',
    'claude-requests': 'Claude Requests Cap',
    'claude-tokens': 'Claude Token Quota',
    'daily-requests': 'Daily Request Allowance',
    'copilot-seats': 'Copilot Active Seats',
    'github-api-quota': 'GitHub API Rate Limits'
  };

  return map[modelId] || modelId.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}
