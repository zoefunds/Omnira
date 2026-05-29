import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('password', () => {
  it('hashes and verifies', async () => {
    const h = await hashPassword('correct horse battery staple');
    expect(h.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(h, 'correct horse battery staple')).toBe(true);
    expect(await verifyPassword(h, 'wrong password')).toBe(false);
  });

  it('produces different hashes for the same password (random salt)', async () => {
    const a = await hashPassword('hunter2');
    const b = await hashPassword('hunter2');
    expect(a).not.toBe(b);
    expect(await verifyPassword(a, 'hunter2')).toBe(true);
    expect(await verifyPassword(b, 'hunter2')).toBe(true);
  });
});
