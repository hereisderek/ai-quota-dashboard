export function formatCountdown(resetTimeIso: string | null | undefined, periodMs?: number): string {
  if (!resetTimeIso) return '';
  let target = new Date(resetTimeIso).getTime();
  const now = Date.now();

  // If the reset is in the past and we know the period, roll forward
  if (target <= now && periodMs && periodMs > 0) {
    const elapsed = now - target;
    const periodsNeeded = Math.ceil(elapsed / periodMs);
    target = target + periodsNeeded * periodMs;
  }

  const diff = target - now;
  if (diff <= 0) return 'Resetting now';

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  // Build the compact countdown
  let countdown: string;
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    countdown = `Resets in ${days}d ${hours % 24}h`;
  } else if (hours > 0) {
    countdown = `Resets in ${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    countdown = `Resets in ${minutes}m ${seconds}s`;
  } else {
    countdown = `Resets in ${seconds}s`;
  }

  // Append actual reset date/time
  const targetDate = new Date(target);
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const time = targetDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });

  let dateLabel: string;
  if (targetDate >= todayStart && targetDate < tomorrowStart) {
    dateLabel = time;
  } else if (hours <= 144) {
    // Within ~6 days: show day name + time
    const day = targetDate.toLocaleDateString(undefined, { weekday: 'short' });
    dateLabel = `${day} ${time}`;
  } else {
    // Further out: show short date + time
    const short = targetDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    dateLabel = `${short} ${time}`;
  }

  return `${countdown} (${dateLabel})`;
}

/** Common reset periods (ms) for use with formatCountdown's periodMs param */
export const RESET_PERIOD = {
  FIVE_HOURS: 5 * 60 * 60 * 1000,
  SEVEN_DAYS: 7 * 24 * 60 * 60 * 1000,
} as const;

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
    'gemini-2.5-flash': 'Gemini 2.5 Flash',
    'gemini-3.8-flash': 'Gemini 3.8 Flash',
    'gemini-3-pro-preview': 'Gemini 3 Pro',
    'gemini-3-pro': 'Gemini 3 Pro',
    'gemini-3.1-pro': 'Gemini 3.1 Pro',
    'gemini-3.5-flash': 'Gemini 3.5 Flash',
    'claude-3-5-sonnet': 'Claude 3.5 Sonnet',
    'claude-3-7-sonnet': 'Claude 3.7 Sonnet',
    'claude-3-opus': 'Claude 3 Opus',
    'claude-opus-4.6': 'Claude Opus 4.6',
    'claude-requests': 'Claude Requests Cap',
    'claude-tokens': 'Claude Token Quota',
    'claude-5h-session': 'Claude 5-Hour Session',
    'claude-7d-weekly': 'Claude 7-Day Weekly Limit',
    'claude-output-tokens': 'Generated Output Tokens',
    'claude-total-tokens': 'Total Tokens Processed',
    'gemini-weekly': 'Gemini Models (Weekly)',
    'gemini-5h': 'Gemini Models (5-Hour)',
    '3p-weekly': 'Claude & GPT (Weekly)',
    '3p-5h': 'Claude & GPT (5-Hour)',
    'daily-requests': 'Daily Request Allowance',
    'copilot-seats': 'Copilot Active Seats',
    'github-api-quota': 'GitHub API Rate Limits',
    
    // OpenRouter
    'openrouter-key-credit': 'Key Credit Limit',
    'openrouter-account-balance': 'Account Credits (USD)',
    'openrouter-rate-limit': 'Rate Limit Allowance',
    'openrouter-api-active': 'OpenRouter Status',

    // DeepSeek
    'deepseek-balance-usd': 'DeepSeek Balance (USD)',
    'deepseek-balance-cny': 'DeepSeek Balance (CNY)',
    'deepseek-topped-up': 'Topped-Up Funds',
    'deepseek-granted-credit': 'Granted Credits',
    'deepseek-account': 'DeepSeek Status',

    // OpenAI
    'openai-requests-quota': 'OpenAI Requests Quota',
    'openai-tokens-quota': 'OpenAI Tokens Quota',
    'openai-api-active': 'OpenAI Models Access'
  };

  return map[modelId] || modelId.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

