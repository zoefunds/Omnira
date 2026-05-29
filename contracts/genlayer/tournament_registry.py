# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
Omnira — TournamentRegistry Intelligent Contract.

Records onchain that a tournament was held and who finished where.
Per-game records still flow through MatchRegistry; this contract is the
canonical record that the *tournament itself* happened, plus its top-N
standings at the close.

Trust:
- register_tournament must be signed by `host_address`.
- finalize_tournament must be signed by the same address that registered.
"""

from genlayer import *
from dataclasses import dataclass
from datetime import datetime, timezone


@allow_storage
@dataclass
class TournamentRecord:
    host_address: Address
    name: str
    initial_ms: u256
    increment_ms: u256
    starts_at: u256
    duration_ms: u256
    registered_at: u256
    finalized_at: u256
    finalized: bool


@allow_storage
@dataclass
class StandingEntry:
    rank: u256
    player_address: Address
    score: u256
    wins: u256
    losses: u256
    draws: u256


class TournamentRegistry(gl.Contract):
    tournaments: TreeMap[str, TournamentRecord]
    # key = f"{tournament_id}|{rank}"
    standings:   TreeMap[str, StandingEntry]

    def __init__(self):
        pass

    def _now(self) -> u256:
        return u256(int(datetime.now(timezone.utc).timestamp()))

    def _standing_key(self, tid: str, rank: int) -> str:
        return f"{tid}|{rank}"

    def _require_host(self, tournament_id: str) -> TournamentRecord:
        if tournament_id not in self.tournaments:
            raise Exception(f"unknown tournament: {tournament_id}")
        rec = self.tournaments[tournament_id]
        if gl.message.sender_address != rec.host_address:
            raise Exception("only the host may modify this tournament")
        return rec

    @gl.public.write
    def register_tournament(
        self,
        tournament_id: str,
        host_address: Address,
        name: str,
        initial_ms: u256,
        increment_ms: u256,
        starts_at: u256,
        duration_ms: u256,
    ) -> None:
        if tournament_id in self.tournaments:
            raise Exception(f"tournament already registered: {tournament_id}")
        if gl.message.sender_address != host_address:
            raise Exception("register_tournament must be signed by the host")
        self.tournaments[tournament_id] = TournamentRecord(
            host_address=host_address,
            name=name,
            initial_ms=initial_ms,
            increment_ms=increment_ms,
            starts_at=starts_at,
            duration_ms=duration_ms,
            registered_at=self._now(),
            finalized_at=u256(0),
            finalized=False,
        )

    @gl.public.write
    def finalize_tournament(
        self,
        tournament_id: str,
        ranks:    DynArray[u256],
        players:  DynArray[Address],
        scores:   DynArray[u256],
        wins:     DynArray[u256],
        losses:   DynArray[u256],
        draws:    DynArray[u256],
    ) -> None:
        rec = self._require_host(tournament_id)
        if rec.finalized:
            raise Exception("already finalized")
        n = len(ranks)
        if not (n == len(players) == len(scores) == len(wins) == len(losses) == len(draws)):
            raise Exception("standings arrays must be the same length")

        i = 0
        while i < n:
            self.standings[self._standing_key(tournament_id, int(ranks[i]))] = StandingEntry(
                rank=ranks[i],
                player_address=players[i],
                score=scores[i],
                wins=wins[i],
                losses=losses[i],
                draws=draws[i],
            )
            i += 1

        rec.finalized = True
        rec.finalized_at = self._now()
        self.tournaments[tournament_id] = rec

    @gl.public.view
    def tournament_exists(self, tournament_id: str) -> bool:
        return tournament_id in self.tournaments

    @gl.public.view
    def get_tournament(self, tournament_id: str) -> TournamentRecord:
        if tournament_id not in self.tournaments:
            raise Exception(f"unknown tournament: {tournament_id}")
        return self.tournaments[tournament_id]

    @gl.public.view
    def get_standing(self, tournament_id: str, rank: u256) -> StandingEntry:
        key = self._standing_key(tournament_id, int(rank))
        if key not in self.standings:
            raise Exception(f"no standing at rank {int(rank)}")
        return self.standings[key]
