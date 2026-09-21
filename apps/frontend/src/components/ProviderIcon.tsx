import React from 'react';
import { 
  Sparkles, 
  Bot, 
  Layers, 
  Cpu, 
  Zap, 
  Github, 
  Globe, 
  Activity,
  Layers3
} from 'lucide-react';
import { ProviderMeta } from '../types';

interface ProviderIconProps {
  name: string;
  className?: string;
}

export const ProviderIcon: React.FC<ProviderIconProps> = ({ name, className = 'w-5 h-5' }) => {
  switch (name?.toLowerCase()) {
    case 'sparkles':
    case 'google-antigravity':
    case 'google':
      return <Sparkles className={className} />;
    case 'bot':
    case 'anthropic':
    case 'claude':
      return <Bot className={className} />;
    case 'layers':
    case 'openrouter':
      return <Layers className={className} />;
    case 'cpu':
    case 'deepseek':
      return <Cpu className={className} />;
    case 'zap':
    case 'openai':
      return <Zap className={className} />;
    case 'github':
    case 'github-copilot':
      return <Github className={className} />;
    case 'globe':
    case 'generic-rest':
    case 'custom':
      return <Globe className={className} />;
    default:
      return <Activity className={className} />;
  }
};

export function getProviderBrand(providerId: string, meta?: ProviderMeta) {
  if (meta?.brand) {
    const color = meta.brand.color || 'zinc';
    return {
      name: meta.brand.name || meta.name || providerId,
      iconName: meta.brand.icon || 'Globe',
      color,
      badgeClass: meta.brand.badgeClass || `bg-${color}-500/10 text-${color}-700 dark:text-${color}-300 border-${color}-500/20`
    };
  }

  switch (providerId) {
    case 'google-antigravity':
      return {
        name: 'Google Antigravity',
        iconName: 'Sparkles',
        color: 'sky',
        badgeClass: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20'
      };
    case 'anthropic':
      return {
        name: 'Anthropic Claude',
        iconName: 'Bot',
        color: 'amber',
        badgeClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20'
      };
    case 'openrouter':
      return {
        name: 'OpenRouter',
        iconName: 'Layers',
        color: 'indigo',
        badgeClass: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20'
      };
    case 'deepseek':
      return {
        name: 'DeepSeek',
        iconName: 'Cpu',
        color: 'blue',
        badgeClass: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20'
      };
    case 'openai':
      return {
        name: 'OpenAI',
        iconName: 'Zap',
        color: 'emerald',
        badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
      };
    case 'github-copilot':
      return {
        name: 'GitHub Copilot',
        iconName: 'Github',
        color: 'purple',
        badgeClass: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20'
      };
    default:
      return {
        name: 'Custom REST API',
        iconName: 'Globe',
        color: 'emerald',
        badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
      };
  }
}
