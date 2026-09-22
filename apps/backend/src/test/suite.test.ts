import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

test('Empty DATA_DIR self-initialization and multi-user isolation', async () => {
  const tmpDataDir = path.join(os.tmpdir(), `ai-quota-multiuser-${Date.now()}`);
  assert.equal(fs.existsSync(tmpDataDir), false);

  process.env.DATA_DIR = tmpDataDir;

  const { config } = await import('../config.js');
  assert.equal(fs.existsSync(config.dataDir), true);

  const { getDb, accountRepo, snapshotRepo, userRepo, sessionRepo } = await import('../db/index.js');
  const db = getDb();
  assert.ok(db, 'DB should initialize cleanly');

  // Test 1: Verify default admin user was auto-bootstrapped
  assert.equal(userRepo.count(), 1);
  const admin = userRepo.getAll()[0];
  assert.equal(admin.role, 'admin');

  // Test 2: Create a second regular user
  const user2 = userRepo.create({
    username: 'alice',
    password: 'securepassword123',
    displayName: 'Alice Smith'
  });
  assert.ok(user2.id);
  assert.equal(user2.username, 'alice');
  assert.equal(userRepo.verifyPassword('securepassword123', user2.password_hash), true);
  assert.equal(userRepo.verifyPassword('wrongpassword', user2.password_hash), false);

  // Test 3: Create Session
  const token = sessionRepo.create(user2.id);
  assert.ok(token);
  const sessionUser = sessionRepo.getUserByToken(token);
  assert.equal(sessionUser?.id, user2.id);

  // Test 4: Multi-User Account Scoping & Isolation
  accountRepo.upsert({
    id: 'acc-admin-1',
    user_id: admin.id,
    provider_id: 'google-antigravity',
    label: 'Admin Work',
    credentials: JSON.stringify({ token: 'admin-secret-token' })
  });

  accountRepo.upsert({
    id: 'acc-alice-1',
    user_id: user2.id,
    provider_id: 'anthropic',
    label: 'Alice Personal',
    credentials: JSON.stringify({ apiKey: 'sk-ant-alice-secret' })
  });

  // Admin gets only admin accounts when scoped
  const adminAccounts = accountRepo.getAll(admin.id);
  assert.equal(adminAccounts.length, 1);
  assert.equal(adminAccounts[0].id, 'acc-admin-1');

  // Alice gets only Alice's accounts
  const aliceAccounts = accountRepo.getAll(user2.id);
  assert.equal(aliceAccounts.length, 1);
  assert.equal(aliceAccounts[0].id, 'acc-alice-1');

  // Alice cannot access or delete Admin's account
  assert.equal(accountRepo.getById('acc-admin-1', user2.id), undefined);
  assert.equal(accountRepo.delete('acc-admin-1', user2.id), false);

  // Test 5: Read-Only Share Quota Page Toggle
  assert.equal(user2.share_enabled, 0); // Initially disabled

  snapshotRepo.record({
    account_id: 'acc-alice-1',
    provider_id: 'anthropic',
    model_id: 'claude-3-5-sonnet',
    token_type: 'REQUESTS',
    remaining_fraction: 0.9,
    reset_time: '2026-09-23T00:00:00Z'
  });

  // Check share slug resolution
  const slugUser = userRepo.getByShareSlug(user2.share_slug!);
  assert.equal(slugUser?.id, user2.id);

  // Toggle Share ON
  userRepo.updateShareSettings(user2.id, {
    shareEnabled: true,
    shareSlug: 'alice-quotas',
    shareTitle: "Alice's AI Status"
  });

  const updatedUser2 = userRepo.getById(user2.id);
  assert.equal(updatedUser2?.share_enabled, 1);
  assert.equal(updatedUser2?.share_slug, 'alice-quotas');
  assert.equal(updatedUser2?.share_title, "Alice's AI Status");

  // Toggle Share OFF
  userRepo.updateShareSettings(user2.id, {
    shareEnabled: false
  });
  assert.equal(userRepo.getById(user2.id)?.share_enabled, 0);

  // Test 6: User Management - Role Updates & Cascading Deletion
  userRepo.updateRole(user2.id, 'admin');
  assert.equal(userRepo.getById(user2.id)?.role, 'admin');

  // Verify accounts & sessions exist before delete
  assert.equal(accountRepo.getAll(user2.id).length, 1);
  assert.ok(sessionRepo.getUserByToken(token));

  // Delete user
  const deleted = userRepo.delete(user2.id);
  assert.equal(deleted, true);
  assert.equal(userRepo.getById(user2.id), undefined);

  // Verify accounts and sessions are cascaded/cleaned up
  assert.equal(accountRepo.getAll(user2.id).length, 0);
  assert.equal(sessionRepo.getUserByToken(token), null);

  // Stop watcher & clean up
  const { AccountsStorageService } = await import('../services/accountsStorage.js');
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
