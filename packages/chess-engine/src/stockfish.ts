import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';

export interface UciEval {
  bestMove: string;      // UCI (e.g. "e2e4", "e7e8q")
  ponder?: string;
  /** centipawns from the side-to-move's POV. positive = good for side to move */
  cp?: number;
  /** mate in N (positive = mate FOR side to move, negative = mate against) */
  mate?: number;
  depth?: number;
  multipv?: number;
}

export interface StockfishOptions {
  /** absolute path to the stockfish binary */
  path: string;
  /** UCI threads (default 1 — analysis is small per call) */
  threads?: number;
  /** hash MB (default 64) */
  hashMb?: number;
}

/**
 * Persistent Stockfish subprocess speaking UCI.
 * One instance handles many sequential `go` calls; do not call `go` concurrently
 * on the same instance.
 */
export class Stockfish extends EventEmitter {
  private proc: ChildProcessWithoutNullStreams;
  private buf = '';
  private ready = false;

  constructor(private opts: StockfishOptions) {
    super();
    this.proc = spawn(opts.path, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data', (chunk: string) => this.onData(chunk));
    this.proc.on('error', (e) => this.emit('error', e));
  }

  private onData(chunk: string) {
    this.buf += chunk;
    let idx;
    while ((idx = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, idx).trimEnd();
      this.buf = this.buf.slice(idx + 1);
      this.emit('line', line);
    }
  }

  private send(cmd: string) {
    this.proc.stdin.write(cmd + '\n');
  }

  private waitLine(predicate: (l: string) => boolean, timeoutMs = 15_000): Promise<string> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        this.off('line', onLine);
        reject(new Error(`stockfish timeout waiting for line`));
      }, timeoutMs);
      const onLine = (line: string) => {
        if (predicate(line)) {
          clearTimeout(t);
          this.off('line', onLine);
          resolve(line);
        }
      };
      this.on('line', onLine);
    });
  }

  /** Initialize: uci → setoption → isready. Idempotent. */
  async init(): Promise<void> {
    if (this.ready) return;
    this.send('uci');
    await this.waitLine((l) => l === 'uciok');
    this.send(`setoption name Threads value ${this.opts.threads ?? 1}`);
    this.send(`setoption name Hash value ${this.opts.hashMb ?? 64}`);
    this.send('isready');
    await this.waitLine((l) => l === 'readyok');
    this.ready = true;
  }

  /** Evaluate `fen` at a given depth. Returns the engine's best move + score. */
  async go(fen: string, depth = 12): Promise<UciEval> {
    if (!this.ready) await this.init();
    this.send('ucinewgame');
    this.send('isready');
    await this.waitLine((l) => l === 'readyok');
    this.send(`position fen ${fen}`);

    // Track the last `info` line so we can read score + depth.
    let lastInfo: string | null = null;
    const onLine = (line: string) => {
      if (line.startsWith('info ') && line.includes(' score ')) lastInfo = line;
    };
    this.on('line', onLine);

    this.send(`go depth ${depth}`);
    const bestLine = await this.waitLine((l) => l.startsWith('bestmove '), 30_000);
    this.off('line', onLine);

    const bestMatch = bestLine.match(/^bestmove (\S+)(?:\s+ponder\s+(\S+))?/);
    const bestMove = bestMatch?.[1] ?? '(none)';
    const ponder = bestMatch?.[2];

    let cp: number | undefined;
    let mate: number | undefined;
    let parsedDepth: number | undefined;
    if (lastInfo) {
      const dm = (lastInfo as string).match(/\bdepth (\d+)/);
      if (dm) parsedDepth = Number(dm[1]);
      const cpm = (lastInfo as string).match(/score cp (-?\d+)/);
      if (cpm) cp = Number(cpm[1]);
      const mm = (lastInfo as string).match(/score mate (-?\d+)/);
      if (mm) mate = Number(mm[1]);
    }

    return { bestMove, ponder, cp, mate, depth: parsedDepth };
  }

  async quit(): Promise<void> {
    this.send('quit');
    await new Promise<void>((r) => this.proc.once('exit', () => r()));
  }
}
