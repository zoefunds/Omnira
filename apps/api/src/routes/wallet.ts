import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@omnira/db';
import { verifyPassword } from '../auth/password.js';
import { deriveWallet } from '../wallet/derive.js';

// Accept small base64-encoded image data URLs only.
const AVATAR_MAX_BYTES = 80 * 1024; // 80 KB after resize is plenty for 256x256
const AVATAR_MIME = /^data:image\/(png|jpe?g|webp);base64,/;
const SetAvatarBody = z.object({
  dataUrl: z.string().min(20).max(120_000),
});

const ExportBody = z.object({
  password: z.string().min(1).max(128),
});

/**
 * Wallet export route. Re-derives the user's private key in memory and
 * returns it ONCE so the user can import the wallet into MetaMask, Rabby,
 * or any other EVM wallet. Never logs the key, never persists it.
 *
 * Security:
 *  - JWT required
 *  - Password re-confirmation required (defense against stolen JWT)
 *  - Rate-limited to 3 requests per 15 minutes per IP
 */
export async function registerWalletRoutes(app: FastifyInstance) {
  app.post(
    '/me/wallet/export',
    { config: { rateLimit: { max: 3, timeWindow: '15 minutes' } } },
    async (req, reply) => {
      try {
        await req.jwtVerify();
      } catch {
        return reply.code(401).send({ error: 'UNAUTHORIZED' });
      }

      const parsed = ExportBody.safeParse(req.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: 'INVALID_BODY', issues: parsed.error.flatten() });
      }

      const userId = (req.user as { sub: string }).sub;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          passwordHash: true,
          wallet: { select: { address: true, derivationVersion: true } },
        },
      });
      if (!user || !user.wallet) {
        return reply.code(404).send({ error: 'NO_WALLET' });
      }

      const ok = await verifyPassword(user.passwordHash, parsed.data.password);
      if (!ok) {
        return reply.code(401).send({ error: 'INVALID_PASSWORD' });
      }

      const derived = await deriveWallet(userId);

      // Sanity check: the derived address should match what we stored at
      // signup. If it diverges, WALLET_MASTER_SECRET or
      // WALLET_DERIVATION_VERSION rotated and the user is now on an old
      // wallet that we can no longer reach — refuse rather than leak a
      // different key.
      if (
        derived.address.toLowerCase() !== user.wallet.address.toLowerCase()
      ) {
        app.log.error(
          { userId, stored: user.wallet.address, derived: derived.address },
          'wallet derivation mismatch — refusing export',
        );
        return reply.code(409).send({
          error: 'DERIVATION_MISMATCH',
          message:
            'Server-side wallet derivation has changed since this account was created. Contact support.',
        });
      }

      // Audit log (no key material — only the fact that an export happened).
      app.log.info(
        { userId, address: user.wallet.address },
        'wallet exported',
      );

      return reply.send({
        address: derived.address,
        privateKey: derived.privateKey,
        derivationVersion: derived.derivationVersion,
      });
    },
  );

  // ─── Avatar upload ───
  // Accepts a base64 data URL (≤ 80 KB), persists to User.avatarUrl. Replaces
  // the previous avatar.
  app.post(
    '/me/avatar',
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' }, bodyLimit: 200_000 } },
    async (req, reply) => {
      try { await req.jwtVerify(); } catch { return reply.code(401).send({ error: 'UNAUTHORIZED' }); }
      const userId = (req.user as { sub: string }).sub;

      const parsed = SetAvatarBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'INVALID_BODY', issues: parsed.error.flatten() });
      }
      const { dataUrl } = parsed.data;
      if (!AVATAR_MIME.test(dataUrl)) {
        return reply.code(400).send({ error: 'INVALID_MIME', message: 'must be image/png|jpeg|webp data URL' });
      }
      const b64 = dataUrl.split(',', 2)[1] ?? '';
      const approxBytes = Math.ceil((b64.length * 3) / 4);
      if (approxBytes > AVATAR_MAX_BYTES) {
        return reply.code(413).send({ error: 'TOO_LARGE', message: `avatar must be ≤ ${AVATAR_MAX_BYTES} bytes` });
      }

      await prisma.user.update({ where: { id: userId }, data: { avatarUrl: dataUrl } });
      return reply.send({ ok: true });
    },
  );

  app.delete(
    '/me/avatar',
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (req, reply) => {
      try { await req.jwtVerify(); } catch { return reply.code(401).send({ error: 'UNAUTHORIZED' }); }
      const userId = (req.user as { sub: string }).sub;
      await prisma.user.update({ where: { id: userId }, data: { avatarUrl: null } });
      return reply.send({ ok: true });
    },
  );
}
