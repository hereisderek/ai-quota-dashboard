import { useState, useEffect, useCallback, useRef } from 'react';
import { Account, SystemStatus, AppSettings, User } from '../types';

export function useQuotaStream() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch accounts from API
  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/accounts');
      if (!res.ok) throw new Error(`Failed to load accounts (${res.status})`);
      const data = await res.json();
      setAccounts(data.accounts || []);
      setError(null);
    } catch (err: any) {
      console.error('[Stream] Fetch accounts error:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch status, user profile & settings
  const fetchMetadata = useCallback(async () => {
    try {
      const [statusRes, settingsRes, meRes] = await Promise.all([
        fetch('/api/status'),
        fetch('/api/settings'),
        fetch('/api/auth/me')
      ]);

      if (statusRes.ok) {
        const s = await statusRes.json();
        setStatus(s);
      }
      if (settingsRes.ok) {
        setSettings(await settingsRes.json());
      }
      if (meRes.ok) {
        const me = await meRes.json();
        setCurrentUser(prev => {
          if (!prev && !me.user) return null;
          if (prev && me.user && prev.id === me.user.id && prev.shareEnabled === me.user.shareEnabled && prev.shareSlug === me.user.shareSlug && prev.shareTitle === me.user.shareTitle) {
            return prev;
          }
          return me.user;
        });
      }
    } catch (err) {
      console.warn('[Stream] Metadata fetch error:', err);
    }
  }, []);

  // Connect WebSocket
  useEffect(() => {
    fetchAccounts();
    fetchMetadata();

    let isMounted = true;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    function connectWs() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isMounted) return;
          console.log('[WS] Connected to live quota feed');
          setWsConnected(true);
        };

        ws.onmessage = (event) => {
          if (!isMounted) return;
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'QUOTA_UPDATED') {
              const { accountId, buckets, status, lastPolledAt } = data.payload;
              setAccounts(prev => prev.map(acc => {
                if (acc.id === accountId) {
                  return {
                    ...acc,
                    status: status || acc.status,
                    lastPolledAt: lastPolledAt || new Date().toISOString(),
                    buckets: buckets || acc.buckets
                  };
                }
                return acc;
              }));
            } else if (data.type === 'ACCOUNT_DELETED') {
              setAccounts(prev => prev.filter(acc => acc.id !== data.payload.accountId));
            } else if (data.type === 'ACCOUNT_ERROR') {
              setAccounts(prev => prev.map(acc => {
                if (acc.id === data.payload.accountId) {
                  return { ...acc, status: 'error', lastError: data.payload.error };
                }
                return acc;
              }));
            }
          } catch (e) {
            console.error('[WS] Failed to parse message:', e);
          }
        };

        ws.onclose = () => {
          if (!isMounted) return;
          setWsConnected(false);
          reconnectTimeout = setTimeout(connectWs, 3000);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch (err) {
        setWsConnected(false);
        reconnectTimeout = setTimeout(connectWs, 5000);
      }
    }

    connectWs();

    pollTimerRef.current = setInterval(() => {
      fetchAccounts();
    }, 30000);

    return () => {
      isMounted = false;
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [fetchAccounts, fetchMetadata]);

  // Trigger manual refresh for all accounts
  const refreshAll = async () => {
    setIsRefreshing(true);
    try {
      await fetch('/api/accounts/refresh-all', { method: 'POST' });
      await fetchAccounts();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setTimeout(() => setIsRefreshing(false), 800);
    }
  };

  // Trigger refresh for single account
  const refreshAccount = async (accountId: string) => {
    try {
      const res = await fetch(`/api/accounts/${accountId}/refresh`, { method: 'POST' });
      if (res.ok) {
        await fetchAccounts();
      }
    } catch (err: any) {
      console.error('Refresh error:', err);
    }
  };

  // Delete account
  const deleteAccount = async (accountId: string) => {
    try {
      const res = await fetch(`/api/accounts/${accountId}`, { method: 'DELETE' });
      if (res.ok) {
        setAccounts(prev => prev.filter(a => a.id !== accountId));
      }
    } catch (err: any) {
      console.error('Delete error:', err);
    }
  };

  // Logout
  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setCurrentUser(null);
      await fetchAccounts();
      await fetchMetadata();
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  return {
    accounts,
    status,
    settings,
    currentUser,
    isLoading,
    isRefreshing,
    wsConnected,
    error,
    refreshAll,
    refreshAccount,
    deleteAccount,
    logout,
    reload: fetchAccounts,
    reloadMetadata: fetchMetadata
  };
}
