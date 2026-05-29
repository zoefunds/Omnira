# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
Omnira — MatchRegistry Intelligent Contract.

Stores chess matches and their moves onchain. Each match is identified by
the Omnira backend's UUID (a string). The address that calls register_match
becomes the `registrar` for that match — the only address allowed to submit
moves or finalize.

Move data is stored as compact JSON strings to keep calldata simple and
batch-friendly (bullet chess can't pay a tx per ply, so the backend batches).
"""

from genlayer import *
from dataclasses import dataclass
from datetime import datetime, timezone


# ─── Stored types ──────────────────────────────────────────────────────────

@allow_storage
@dataclass
class MatchRecord:
    white_address: Address
    black_address: Address
    registrar: Address
    initial_ms: u256
    increment_ms: u256
    started_at: u256       # unix seconds
    ended_at: u256         # 0 while ACTIVE
    status: str            # "ACTIVE" | "WHITE_WON" | "BLACK_WON" | "DRAW" | "ABORTED"
    result_reason: str     # "" while ACTIVE
    final_fen: str
    pgn: str
    move_count: u256


@allow_storage
@dataclass
class MoveRecord:
    ply: u256
    san: str
    uci: str
    fen_after: str
    clock_ms_white: u256
    clock_ms_black: u256
    think_ms: u256
    submitted_at: u256


# ─── Contract ──────────────────────────────────────────────────────────────

class MatchRegistry(gl.Contract):
    matches: TreeMap[str, MatchRecord]
    moves:   TreeMap[str, DynArray[MoveRecord]]

    def __init__(self):
        pass

    # ── helpers ────────────────────────────────────────────────────────────

    def _now(self) -> u256:
        return u256(int(datetime.now(timezone.utc).timestamp()))

    def _require_registrar(self, match_id: str) -> MatchRecord:
        if match_id not in self.matches:
            raise Exception(f"unknown match: {match_id}")
        rec = self.matches[match_id]
        if gl.message.sender_address != rec.registrar:
            raise Exception("only the original registrar may modify this match")
        return rec

    # ── writes ─────────────────────────────────────────────────────────────

    @gl.public.write
    def register_match(
        self,
        match_id: str,
        white_address: Address,
        black_address: Address,
        initial_ms: u256,
        increment_ms: u256,
    ) -> None:
        if match_id in self.matches:
            raise Exception(f"match already registered: {match_id}")

        self.matches[match_id] = MatchRecord(
            white_address=white_address,
            black_address=black_address,
            registrar=gl.message.sender_address,
            initial_ms=initial_ms,
            increment_ms=increment_ms,
            started_at=self._now(),
            ended_at=u256(0),
            status="ACTIVE",
            result_reason="",
            final_fen="",
            pgn="",
            move_count=u256(0),
        )
        self.moves[match_id] = DynArray[MoveRecord]()

    @gl.public.write
    def submit_moves_batch(
        self,
        match_id: str,
        plies:           DynArray[u256],
        sans:            DynArray[str],
        ucis:            DynArray[str],
        fens_after:      DynArray[str],
        clocks_ms_white: DynArray[u256],
        clocks_ms_black: DynArray[u256],
        think_mss:       DynArray[u256],
    ) -> None:
        rec = self._require_registrar(match_id)
        if rec.status != "ACTIVE":
            raise Exception(f"match not active: {rec.status}")

        n = len(plies)
        if not (n == len(sans) == len(ucis) == len(fens_after)
                == len(clocks_ms_white) == len(clocks_ms_black) == len(think_mss)):
            raise Exception("batch arrays must be the same length")

        now = self._now()
        bucket = self.moves[match_id]
        expected_next = rec.move_count + u256(1)

        i = 0
        while i < n:
            if plies[i] != expected_next:
                raise Exception(
                    f"out-of-order ply: expected {int(expected_next)}, got {int(plies[i])}"
                )
            bucket.append(MoveRecord(
                ply=plies[i],
                san=sans[i],
                uci=ucis[i],
                fen_after=fens_after[i],
                clock_ms_white=clocks_ms_white[i],
                clock_ms_black=clocks_ms_black[i],
                think_ms=think_mss[i],
                submitted_at=now,
            ))
            expected_next = expected_next + u256(1)
            i += 1

        rec.move_count = u256(int(expected_next) - 1)
        self.matches[match_id] = rec

    @gl.public.write
    def finalize_match(
        self,
        match_id: str,
        status: str,
        result_reason: str,
        final_fen: str,
        pgn: str,
    ) -> None:
        rec = self._require_registrar(match_id)
        if rec.status != "ACTIVE":
            raise Exception(f"already finalized: {rec.status}")
        if status not in ("WHITE_WON", "BLACK_WON", "DRAW", "ABORTED"):
            raise Exception(f"invalid status: {status}")

        rec.status = status
        rec.result_reason = result_reason
        rec.final_fen = final_fen
        rec.pgn = pgn
        rec.ended_at = self._now()
        self.matches[match_id] = rec

    # ── views ──────────────────────────────────────────────────────────────

    @gl.public.view
    def match_exists(self, match_id: str) -> bool:
        return match_id in self.matches

    @gl.public.view
    def get_match(self, match_id: str) -> MatchRecord:
        if match_id not in self.matches:
            raise Exception(f"unknown match: {match_id}")
        return self.matches[match_id]

    @gl.public.view
    def get_moves(self, match_id: str) -> DynArray[MoveRecord]:
        if match_id not in self.matches:
            raise Exception(f"unknown match: {match_id}")
        return self.moves[match_id]

    @gl.public.view
    def get_move_count(self, match_id: str) -> u256:
        if match_id not in self.matches:
            raise Exception(f"unknown match: {match_id}")
        return self.matches[match_id].move_count
