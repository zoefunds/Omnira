import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@omnira/db';
import { verifyPassword } from '../auth/password.js';
import { deriveWallet } from '../wallet/derive.js';

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
}
