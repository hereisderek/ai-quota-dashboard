import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

test('Empty DATA_DIR self-initialization', async () => {
  const tmpDataDir = path.join(os.tmpdir(), `ai-quota-test-${Date.now()}`);
  assert.equal(fs.existsSync(tmpDataDir), false);

  // Set env
  process.env.DATA_DIR = tmpDataDir;

  const { config } = await import('../config.js');
  assert.equal(fs.existsSync(config.dataDir), true);

  const { getDb, accountRepo, snapshotRepo } = await import('../db/index.js');
  const db = getDb();
  assert.ok(db, 'DB should initialize cleanly');

  // Verify accounts table exists and returns empty array
  const accounts = accountRepo.getAll();
  assert.deepEqual(accounts, []);

  // Test 2: accounts.json file initialization
  const { AccountsStorageService } = await import('../services/accountsStorage.js');
  AccountsStorageService.init();

  assert.equal(fs.existsSync(config.accountsFilePath), true);
  const fileContent = JSON.parse(fs.readFileSync(config.accountsFilePath, 'utf8'));
  assert.deepEqual(fileContent, { accounts: [] });

  // Test 3: Account upsert and snapshot recording
  accountRepo.upsert({
    id: 'test-google-1',
    provider_id: 'google-antigravity',
    label: 'Work Account',
    email: 'work@example.com',
    credentials: JSON.stringify({ accessToken: 'mock-token', refreshToken: 'mock-refresh' })
  });

  const stored = accountRepo.getById('test-google-1');
  assert.equal(stored?.label, 'Work Account');
  assert.equal(stored?.email, 'work@example.com');

  snapshotRepo.record({
    account_id: 'test-google-1',
    provider_id: 'google-antigravity',
    model_id: 'gemini-3-pro',
    token_type: 'REQUESTS',
    remaining_fraction: 0.85,
    reset_time: new Date(Date.now() + 3600000).toISOString()
  });

  const latest = snapshotRepo.getLatestForAccount('test-google-1');
  assert.equal(latest.length, 1);
  assert.equal(latest[0].model_id, 'gemini-3-pro');
  assert.equal(latest[0].remaining_fraction, 0.85);

  // Test 4: Sync to accounts.json
  AccountsStorageService.syncDbToDisk();
  const updatedFile = JSON.parse(fs.readFileSync(config.accountsFilePath, 'utf8'));
  assert.equal(updatedFile.accounts.length, 1);
  assert.equal(updatedFile.accounts[0].id, 'test-google-1');

  // Stop watcher & clean up
  AccountsStorageService.stopWatcher();
  fs.rmSync(tmpDataDir, { recursive: true, force: true });
});

test('Provider registry lists all built-in providers', async () => {
  const { providerRegistry } = await import('../providers/index.js');
  const all = providerRegistry.getAll();
  assert.ok(all.some(p => p.id === 'google-antigravity'));
  assert.ok(all.some(p => p.id === 'anthropic'));
  assert.ok(all.some(p => p.id === 'github-copilot'));
  assert.ok(all.some(p => p.id === 'generic-rest'));
});
