'use strict';
const assert = require('assert');
const T = require('../app/src/main/assets/www/game.js');

const C = (s, r) => ({ s, r, id: s * 100 + r });

// deck: 52 cards, unique ids
{
  const d = T.newDeck();
  assert.strictEqual(d.length, 52);
  assert.strictEqual(new Set(d.map(c => c.id)).size, 52);
  const h = { 1: true, 2: true };
  d.forEach(c => assert.ok(c.s >= 0 && c.s <= 3 && c.r >= 1 && c.r <= 13));
}

// setup helper: a game in the qulub kingdom with fixed hands
function setup(contractId, hands) {
  const S = T.createGame();
  S.chooser = 0;
  T.dealRound(S);
  S.players.forEach((p, i) => { p.hand = hands[i].map(c => Object.assign({}, c)); T.sortHand(p.hand); });
  T.activateRound(S, contractId);
  return S;
}

// hearts cannot be led while closed, unless the hand is all hearts
{
  const S = setup('qulub', [
    [C(0, 5), C(1, 13), C(2, 3)], [], [], []
  ]);
  S.turn = 0;
  let legal = T.legalPlays(S, 0);
  assert.ok(legal.every(c => !T.isHeart(c)), 'hearts closed while leading');
  S.heartsOpened = true;
  legal = T.legalPlays(S, 0);
  assert.strictEqual(legal.length, 3);
  S.heartsOpened = false;
  S.players[0].hand = [C(1, 2), C(1, 9)];
  legal = T.legalPlays(S, 0);
  assert.strictEqual(legal.length, 2, 'all-hearts hand can lead hearts');
}

// must follow suit
{
  const S = setup('salb', [
    [C(0, 3), C(0, 9), C(3, 1)], [], [], []
  ]);
  S.leadSuit = 0;
  S.table = [{ seat: 1, card: C(0, 7) }];
  const legal = T.legalPlays(S, 0);
  assert.strictEqual(legal.length, 2);
  assert.ok(legal.every(c => c.s === 0));
  const res = T.applyPlay(S, 0, C(3, 1));
  assert.strictEqual(res.ok, false, 'cannot throw off-suit while holding suit');
}

// trick winner: highest of led suit, ace high
{
  const S = setup('salb', [[], [], [], []]);
  S.leadSuit = 0;
  S.table = [
    { seat: 0, card: C(0, 10) },
    { seat: 1, card: C(1, 13) }, // off-suit
    { seat: 2, card: C(0, 1) },  // ace
    { seat: 3, card: C(0, 13) }
  ];
  assert.strictEqual(T.resolveTrick(S), 2, 'ace beats king');
  assert.strictEqual(S.players[2].tricks, 1);
  assert.strictEqual(S.players[2].taken.length, 4);
  assert.strictEqual(S.table.length, 0);
}

// scoring: salb / banat / qulub / shabah
{
  const S = setup('salb', [[], [], [], []]);
  S.players[0].tricks = 3;
  S.players[1].tricks = 10;
  assert.deepStrictEqual(T.computeDeltas(S), [-30, -100, 0, 0]);
}
{
  const S = setup('banat', [[], [], [], []]);
  S.players[0].taken = [C(0, 12), C(1, 12), C(2, 5)];
  S.players[1].taken = [C(3, 12)];
  assert.deepStrictEqual(T.computeDeltas(S), [-100, -50, 0, 0]);
}
{
  const S = setup('qulub', [[], [], [], []]);
  S.players[2].taken = [C(1, 13), C(1, 1), C(0, 5)];
  assert.deepStrictEqual(T.computeDeltas(S), [0, 0, -40, 0]);
}
{
  const S = setup('shabah', [[], [], [], []]);
  S.players[3].taken = [C(1, 13), C(0, 13)];
  assert.deepStrictEqual(T.computeDeltas(S), [0, 0, 0, -75]);
}

// trix: extensions legal, 7-opening blocked while an extension exists
{
  const S = setup('trix', [
    [C(0, 8), C(2, 7), C(1, 3)], [], [], []
  ]);
  S.rows[0] = { started: true, low: 7, high: 7, cards: { 7: 1 } };
  let legal = T.legalTrix(S, 0);
  assert.strictEqual(legal.length, 1, 'only 8♠ extension');
  assert.strictEqual(legal[0].id, C(0, 8).id);
  assert.ok(T.applyPlay(S, 0, C(2, 7)).ok === false, 'cannot open a 7 while an extension exists');
  assert.ok(T.applyPlay(S, 0, C(0, 8)).ok);
  assert.strictEqual(S.rows[0].high, 8);
  // no extensions left → opening the 7♦ becomes legal
  legal = T.legalTrix(S, 0);
  assert.strictEqual(legal.length, 1);
  assert.ok(T.applyPlay(S, 0, C(2, 7)).ok);
  assert.ok(S.rows[2].started);
  // only an off-range card left → stuck: -10 per card
  assert.strictEqual(T.legalTrix(S, 0).length, 0);
  const n = T.applyStuck(S, 0);
  assert.strictEqual(n, 1);
  assert.deepStrictEqual(T.computeDeltas(S), [-10, 0, 0, 0]);
  assert.ok(S.players[0].done);
}

// trix row grows both directions from the 7 down to A and up to K
{
  const S = setup('trix', [[], [], [], []]);
  // row 5..10 already placed (7 in middle), so 4 and J are the only extensions
  S.rows[3] = { started: true, low: 5, high: 10, cards: {} };
  S.players[0].hand = [C(3, 4), C(3, 11), C(3, 5)];
  const legal = T.legalTrix(S, 0);
  assert.strictEqual(legal.length, 2);
  assert.ok(legal.some(c => c.id === C(3, 4).id));
  assert.ok(legal.some(c => c.id === C(3, 11).id));
  assert.ok(!legal.some(c => c.id === C(3, 5).id), '5 already on the board');
}

console.log('All logic tests passed.');
