import { IProvider, QuotaSnapshot, BucketInfo } from './types.js';
import { AccountRow } from '../db/index.js';

export class DeepSeekProvider implements IProvider {
  id = 'deepseek';
  name = 'DeepSeek';
  description = 'DeepSeek R1 & V3 reasoning models API balance and rate tracking';
  authType: 'api_key' = 'api_key';

  brand = {
    name: 'DeepSeek',
    icon: 'Cpu',
    color: 'blue',
    badgeClass: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20'
  };

  authDoc = {
    title: 'DeepSeek API Key',
    description: 'Track wallet balance, granted credits, and topped-up funds for DeepSeek V3 and DeepSeek R1 models.',
    linkText: 'DeepSeek Platform Keys',
    linkUrl: 'https://platform.deepseek.com/api_keys'
  };

  fields = [
    {
      key: 'apiKey',
      label: 'DeepSeek API Key',
      type: 'password' as const,
      placeholder: 'sk-...',
      required: true,
      description: 'API key from DeepSeek open platform.'
    }
  ];

  async fetchQuota(account: AccountRow): Promise<QuotaSnapshot> {
    const creds = JSON.parse(account.credentials);
    const apiKey = creds.apiKey || creds.token;

    if (!apiKey) {
      throw new Error('DeepSeek API Key is required');
    }

    const headers = {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json'
    };

    // 1. Fetch User Balance
    const balanceRes = await fetch('https://api.deepseek.com/user/balance', { headers });
    if (!balanceRes.ok) {
      const errText = await balanceRes.text();
      throw new Error(`DeepSeek balance query failed (${balanceRes.status}): ${errText}`);
    }

    const balanceData: any = await balanceRes.json();
    const isAvailable = balanceData.is_available ?? true;
    const balanceInfos = balanceData.balance_infos || [];

    const buckets: BucketInfo[] = [];

    for (const info of balanceInfos) {
      const currency = info.currency || 'USD';
      const totalBalance = parseFloat(info.total_balance || '0');
      const grantedBalance = parseFloat(info.granted_balance || '0');
      const toppedUpBalance = parseFloat(info.topped_up_balance || '0');

      buckets.push({
        modelId: `deepseek-balance-${currency.toLowerCase()}`,
        tokenType: currency,
        remainingFraction: totalBalance > 0 ? 1.0 : 0.0,
        remainingAmount: totalBalance,
        limitAmount: null,
        resetTime: null,
        usedPercent: totalBalance > 0 ? 0 : 100
      });

      if (toppedUpBalance > 0) {
        buckets.push({
          modelId: 'deepseek-topped-up',
          tokenType: currency,
          remainingFraction: 1.0,
          remainingAmount: toppedUpBalance,
          limitAmount: null,
          resetTime: null,
          usedPercent: 0
        });
      }

      if (grantedBalance > 0) {
        buckets.push({
          modelId: 'deepseek-granted-credit',
          tokenType: currency,
          remainingFraction: 1.0,
          remainingAmount: grantedBalance,
          limitAmount: null,
          resetTime: null,
          usedPercent: 0
        });
      }
    }

    if (buckets.length === 0) {
      buckets.push({
        modelId: 'deepseek-account',
        tokenType: 'STATUS',
        remainingFraction: isAvailable ? 1.0 : 0.0,
        remainingAmount: isAvailable ? 1 : 0,
        limitAmount: 1,
        resetTime: null,
        usedPercent: isAvailable ? 0 : 100
      });
    }

    return {
      accountId: account.id,
      providerId: this.id,
      tier: isAvailable ? 'ACTIVE' : 'EXHAUSTED',
      buckets,
      rawJson: JSON.stringify(balanceData, null, 2)
    };
  }
}
