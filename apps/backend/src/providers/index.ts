import { IProvider } from './types.js';
import { GoogleAntigravityProvider } from './googleAntigravity.js';
import { AnthropicProvider } from './anthropic.js';
import { GitHubCopilotProvider } from './githubCopilot.js';
import { GenericRestProvider } from './genericRest.js';

export * from './types.js';
export { GoogleAntigravityProvider } from './googleAntigravity.js';
export { AnthropicProvider } from './anthropic.js';
export { GitHubCopilotProvider } from './githubCopilot.js';
export { GenericRestProvider } from './genericRest.js';

class ProviderRegistry {
  private providers = new Map<string, IProvider>();

  constructor() {
    this.register(new GoogleAntigravityProvider());
    this.register(new AnthropicProvider());
    this.register(new GitHubCopilotProvider());
    this.register(new GenericRestProvider());
  }

  register(provider: IProvider): void {
    this.providers.set(provider.id, provider);
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
      authType: p.authType
    }));
  }
}

export const providerRegistry = new ProviderRegistry();
