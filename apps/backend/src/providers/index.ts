import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { IProvider } from './types.js';
import { GoogleAntigravityProvider } from './googleAntigravity.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenRouterProvider } from './openrouter.js';
import { DeepSeekProvider } from './deepseek.js';
import { OpenAIProvider } from './openai.js';
import { GitHubCopilotProvider } from './githubCopilot.js';
import { GenericRestProvider } from './genericRest.js';
import { config } from '../config.js';

export * from './types.js';
export { GoogleAntigravityProvider } from './googleAntigravity.js';
export { AnthropicProvider } from './anthropic.js';
export { OpenRouterProvider } from './openrouter.js';
export { DeepSeekProvider } from './deepseek.js';
export { OpenAIProvider } from './openai.js';
export { GitHubCopilotProvider } from './githubCopilot.js';
export { GenericRestProvider } from './genericRest.js';

class ProviderRegistry {
  private providers = new Map<string, IProvider>();

  constructor() {
    // 1. Built-in Core Provider Plugins
    this.register(new GoogleAntigravityProvider());
    this.register(new AnthropicProvider());
    this.register(new OpenRouterProvider());
    this.register(new DeepSeekProvider());
    this.register(new OpenAIProvider());
    this.register(new GitHubCopilotProvider());
    this.register(new GenericRestProvider());

    // 2. Load External Custom Plugins asynchronously
    this.loadExternalPlugins().catch(err => {
      console.warn('[ProviderRegistry] External plugin loading notice:', err.message);
    });
  }

  register(provider: IProvider): void {
    this.providers.set(provider.id, provider);
    console.log(`[ProviderRegistry] Registered provider plugin: ${provider.name} (${provider.id})`);
  }

  get(id: string): IProvider | undefined {
    return this.providers.get(id);
  }

  getAll(): IProvider[] {
    return Array.from(this.providers.values());
  }

  getMetadataList() {
    return this.getAll().map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      brand: p.brand || { name: p.name, icon: 'Globe', color: 'zinc' },
      authType: p.authType,
      authDoc: p.authDoc,
      fields: p.fields || []
    }));
  }

  async loadExternalPlugins(): Promise<void> {
    const pluginsDir = path.join(config.dataDir, 'plugins');
    if (!fs.existsSync(pluginsDir)) {
      try {
        fs.mkdirSync(pluginsDir, { recursive: true });
      } catch {}
      return;
    }

    const files = fs.readdirSync(pluginsDir);
    for (const file of files) {
      if (!file.endsWith('.js') && !file.endsWith('.mjs')) continue;

      const fullPath = path.join(pluginsDir, file);
      try {
        const fileUrl = pathToFileURL(fullPath).href;
        const mod = await import(fileUrl);
        const PluginClass = mod.default || Object.values(mod).find(v => typeof v === 'function');
        if (PluginClass && typeof PluginClass === 'function') {
          const instance = new PluginClass();
          if (instance && instance.id && typeof instance.fetchQuota === 'function') {
            this.register(instance);
            console.log(`[ProviderRegistry] Successfully loaded external plugin from ${file}`);
          }
        }
      } catch (err: any) {
        console.error(`[ProviderRegistry] Failed to load external plugin ${file}:`, err.message);
      }
    }
  }
}

export const providerRegistry = new ProviderRegistry();
