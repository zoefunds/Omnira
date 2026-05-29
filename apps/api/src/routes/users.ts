import type { FastifyInstance } from 'fastify';
import {
  getProfile, listRecentMatches, listUserTournaments, listAnalyzedMatches,
  getRatingHistory, UserError,
} from '../users/service.js';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export async function registerUserRoutes(app: FastifyInstance) {
  app.get('/users/:username', { config: { rateLimit: false } }, async (req, reply) => {
    const { username } = req.params as { username: string };
    if (!USERNAME_RE.test(username)) return reply.code(400).send({ error: 'BAD_USERNAME' });
    try {
      const profile = await getProfile(username.toLowerCase());
      return { profile };
    } catch (e) {
      if (e instanceof UserError) return reply.code(e.status).send({ error: e.code });
      throw e;
    }
  });

  app.get('/users/:username/matches', { config: { rateLimit: false } }, async (req, reply) => {
    const { username } = req.params as { username: string };
    if (!USERNAME_RE.test(username)) return reply.code(400).send({ error: 'BAD_USERNAME' });
    try {
      const profile = await getProfile(username.toLowerCase());
      const matches = await listRecentMatches(profile.id);
      return { matches };
    } catch (e) {
      if (e instanceof UserError) return reply.code(e.status).send({ error: e.code });
      throw e;
    }
  });

  app.get('/users/:username/ratings', { config: { rateLimit: false } }, async (req, reply) => {
    const { username } = req.params as { username: string };
    if (!USERNAME_RE.test(username)) return reply.code(400).send({ error: 'BAD_USERNAME' });
    const profile = await getProfile(username.toLowerCase()).catch(() => null);
    if (!profile) return reply.code(404).send({ error: 'NOT_FOUND' });
    const history = await getRatingHistory(profile.id);
    return { history };
  });

  app.get('/users/:username/tournaments', { config: { rateLimit: false } }, async (req, reply) => {
    const { username } = req.params as { username: string };
    if (!USERNAME_RE.test(username)) return reply.code(400).send({ error: 'BAD_USERNAME' });
    const profile = await getProfile(username.toLowerCase()).catch(() => null);
    if (!profile) return reply.code(404).send({ error: 'NOT_FOUND' });
    const tournaments = await listUserTournaments(profile.id);
    return { tournaments };
  });

  app.get('/users/:username/analyses', { config: { rateLimit: false } }, async (req, reply) => {
    const { username } = req.params as { username: string };
    if (!USERNAME_RE.test(username)) return reply.code(400).send({ error: 'BAD_USERNAME' });
    const profile = await getProfile(username.toLowerCase()).catch(() => null);
    if (!profile) return reply.code(404).send({ error: 'NOT_FOUND' });
    const matches = await listAnalyzedMatches(profile.id);
    return { matches };
  });
}
