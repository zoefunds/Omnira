import { prisma } from './index.js';

async function main() {
  const userCount = await prisma.user.count();
  const matchCount = await prisma.match.count();
  console.log(JSON.stringify({ userCount, matchCount }));
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
