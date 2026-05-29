import argon2 from 'argon2';

// OWASP 2024 recommended Argon2id params for interactive logins.
// time=3, memory=64 MiB, parallelism=4. Tune up later if hardware allows.
const OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 64 * 1024, // 64 MiB
  timeCost: 3,
  parallelism: 4,
};

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, OPTIONS);
}

export function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain);
}
