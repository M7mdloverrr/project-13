'use strict';
const assert = require('assert');
const T = require('../app/src/main/assets/www/game.js');

// Full 5-round AI-vs-AI simulation: must finish, drain every hand,
// apply trix stuck penalties correctly and produce sane scores.
for (let run = 0; run < 50; run++) {
  const S = T.createGame();
  for (let round = 0; round < 5; round++) {
    S.chooser = round < 4 ? round : 0;
    T.dealRound(S);
    assert.strictEqual(S.players.reduce((n, p) => n + p.hand.length, 0), 52, 'all 52 cards dealt');
    const id = round === 4 ? S.remaining[0] : T.aiPickContract(S);
    T.activateRound(S, id);
    const trix = id === 'trix';
    let roundOver = false, plays = 0, stuck = 0, guard = 0;
    while (!roundOver) {
      if (++guard > 5000) throw new Error('game does not terminate');
      if (!trix) {
        if (S.table.length === 4) { S.turn = T.resolveTrick(S); continue; }
        if (S.players.every(p => p.hand.length === 0)) { roundOver = true; break; }
      } else {
        if (S.players.every(p => p.done)) { roundOver = true; break; }
        if (S.players[S.turn].done) { S.turn = (S.turn + 1) % 4; continue; }
      }
      const seat = S.turn;
      const p = S.players[seat];
      const legal = trix ? T.legalTrix(S, seat) : T.legalPlays(S, seat);
      if (trix && legal.length === 0) {
        // stuck: -10 per remaining card, player leaves the round
        const n = T.applyStuck(S, seat);
        stuck += n;
        assert.ok(n > 0 && p.done && p.hand.length === 0);
        S.turn = (S.turn + 1) % 4;
        continue;
      }
      assert.ok(legal.length > 0, 'always a legal move in trick rounds');
      const card = T.aiChoose(S, seat);
      assert.ok(legal.some(c => c.id === card.id), 'AI must pick a legal card');
      const res = T.applyPlay(S, seat, card);
      assert.strictEqual(res.ok, true, 'applyPlay must accept a legal card');
      plays++;
      S.turn = (S.turn + 1) % 4;
    }
    const deltas = T.computeDeltas(S);
    deltas.forEach(d => assert.ok(Number.isInteger(d) && d <= 0, 'deltas are non-positive integers'));
    S.players.forEach((p, i) => { p.score += deltas[i]; });
    if (trix) {
      assert.ok(S.players.every(p => p.done), 'trix round ends with everyone done');
      assert.strictEqual(plays + stuck, 52, 'every card played or penalised in trix');
    } else {
      assert.ok(S.players.every(p => p.hand.length === 0), 'trick round drains all hands');
      assert.strictEqual(plays, 52, 'every card played in a kingdom round');
      assert.strictEqual(S.players.reduce((n, p) => n + p.taken.length, 0), 52);
    }
  }
  S.players.forEach(p => assert.ok(Number.isInteger(p.score) && p.score <= 0));
  assert.ok(S.remaining.length === 0, 'all five contracts played');
}

console.log('Simulation passed: 50 complete games.');
