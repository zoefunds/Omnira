import { prisma, Prisma } from '@omnira/db';
import { hashPassword, verifyPassword } from './password.js';
import { deriveWallet } from '../wallet/derive.js';
import { fundUserWallet } from '../onchain/funding.js';

export class AuthError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

export interface SignupInput {
  email: string;
  username: string;
  password: string;
}

export interface PublicUser {
  id: string;
  email: string;
  username: string;
  walletAddress: string;
  avatarUrl: string | null;
  createdAt: Date;
}

function toPublic(user: {
  id: string;
  email: string;
  username: string;
  createdAt: Date;
  avatarUrl?: string | null;
  wallet: { address: string } | null;
}): PublicUser {
  if (!user.wallet) throw new AuthError('NO_WALLET', 'user has no wallet (invariant broken)', 500);
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    walletAddress: user.wallet.address,
    avatarUrl: user.avatarUrl ?? null,
    createdAt: user.createdAt,
  };
}

export async function signup(input: SignupInput): Promise<PublicUser> {
  const emailLower = input.email.toLowerCase().trim();
  const usernameLower = input.username.toLowerCase().trim();

  const passwordHash = await hashPassword(input.password);

  // Two-step: create user, derive wallet from user.id, create wallet.
  // Wrap in a transaction so a half-created user can't exist.
  try {
    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          email: input.email.trim(),
          emailLower,
          username: input.username.trim(),
          usernameLower,
          passwordHash,
        },
      });

      const wallet = await deriveWallet(u.id);

      await tx.wallet.create({
        data: {
          userId: u.id,
          address: wallet.address,
          derivationVersion: wallet.derivationVersion,
        },
      });

      // Seed default ratings (1500 in each category)
      await tx.rating.createMany({
        data: (['BULLET', 'BLITZ', 'RAPID', 'CLASSICAL'] as const).map((category) => ({
          userId: u.id,
          category,
        })),
      });

      return tx.user.findUniqueOrThrow({
        where: { id: u.id },
        select: {
          id: true,
          email: true,
          username: true,
          createdAt: true,
          avatarUrl: true,
          wallet: { select: { address: true } },
        },
      });
    });

    // fire-and-forget: fund player wallet so they can sign their own onchain txs
    if (user.wallet?.address) void fundUserWallet(user.wallet.address as `0x${string}`);
    return toPublic(user);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const target = (e.meta?.target as string[] | undefined)?.join(',') ?? '';
      if (target.includes('email')) throw new AuthError('EMAIL_TAKEN', 'email already in use', 409);
      if (target.includes('username'))
        throw new AuthError('USERNAME_TAKEN', 'username already in use', 409);
    }
    throw e;
  }
}

export interface LoginInput {
  /** email OR username */
  identifier: string;
  password: string;
}

export async function login(input: LoginInput): Promise<PublicUser> {
  const id = input.identifier.toLowerCase().trim();
  const user = await prisma.user.findFirst({
    where: { OR: [{ emailLower: id }, { usernameLower: id }] },
    select: {
      id: true,
      email: true,
      username: true,
      passwordHash: true,
      createdAt: true,
      deletedAt: true,
      avatarUrl: true,
      wallet: { select: { address: true } },
    },
  });

  if (!user || user.deletedAt) {
    // Constant-time-ish: still hash a dummy to avoid user-enumeration timing leak.
    await verifyPassword(
      '$argon2id$v=19$m=65536,t=3,p=4$ZHVtbXlkdW1teWR1bW15$dummy',
      input.password,
    ).catch(() => false);
    throw new AuthError('INVALID_CREDENTIALS', 'invalid credentials', 401);
  }

  const ok = await verifyPassword(user.passwordHash, input.password);
  if (!ok) throw new AuthError('INVALID_CREDENTIALS', 'invalid credentials', 401);

  return toPublic(user);
}

export async function getMe(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      username: true,
      createdAt: true,
      avatarUrl: true,
      wallet: { select: { address: true } },
    },
  });
  return toPublic(user);
}
