/* تركس — Trix card game (Arab style) */
'use strict';

/* ============ CORE (pure logic, testable in node) ============ */

var SUITS = ['♠', '♥', '♦', '♣'];
var RED = { 1: true, 2: true };
var RANK_LABEL = { 1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K' };
var PEN = { trick: 10, queen: 50, heart: 20, shabah: 75, stuck: 10 };

var CONTRACTS = {
  salb:   { id: 'salb',   name: 'السلب',   desc: 'لا تأخذ أي ضربة — كل ضربة خصم 10' },
  banat:  { id: 'banat',  name: 'البنات',  desc: 'تجنّب أسر البنات — كل بنت خصم 50' },
  qulub:  { id: 'qulub',  name: 'القلوب', desc: 'تجنّب أخذ القلوب — كل قلب خصم 20' },
  shabah: { id: 'shabah', name: 'الشعبان', desc: 'تجنّب أسر K♥ — الخصم 75' },
  trix:   { id: 'trix',   name: 'التركيس', desc: 'رتّب الصفوف من الـ7 — العجز خصم 10 لكل ورقة' }
};
var CONTRACT_ORDER = ['salb', 'banat', 'qulub', 'shabah', 'trix'];

function isHeart(c) { return c.s === 1; }
function isQueen(c) { return c.r === 12; }
function isKingHearts(c) { return c.s === 1 && c.r === 13; }
function strength(c) { return c.r === 1 ? 14 : c.r; }

function newDeck() {
  var d = [];
  for (var s = 0; s < 4; s++) for (var r = 1; r <= 13; r++) d.push({ s: s, r: r, id: s * 100 + r });
  return d;
}
function shuffle(a) {
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
function sortHand(h) {
  h.sort(function (a, b) { return a.s - b.s || strength(b) - strength(a); });
}

function createGame(names) {
  names = names || ['أنت', 'سلطان', 'راشد', 'فهد'];
  return {
    players: names.map(function (n, i) {
      return { seat: i, name: n, human: i === 0, score: 0, hand: [], taken: [], tricks: 0, done: false, trixPenalty: 0 };
    }),
    round: 0,               // 0..4
    remaining: CONTRACT_ORDER.slice(),
    contract: null,
    chooser: 0,
    turn: 0,
    table: [],              // [{seat, card}]
    leadSuit: null,
    heartsOpened: false,
    rows: null,             // trix: [{started, low, high, cards:{rank:seat}}]
    phase: 'idle'           // idle | pick | play | roundEnd | gameEnd
  };
}

/* deal a fresh hand of 13 cards to each player (contract not yet chosen) */
function dealRound(state) {
  var deck = shuffle(newDeck());
  state.players.forEach(function (p, i) {
    p.hand = deck.slice(i * 13, (i + 1) * 13);
    sortHand(p.hand);
    p.taken = []; p.tricks = 0; p.done = false; p.trixPenalty = 0;
  });
  state.table = []; state.leadSuit = null; state.heartsOpened = false;
  state.contract = null; state.rows = null;
  state.phase = 'pick';
}

/* activate the chosen contract for the dealt cards */
function activateRound(state, contractId) {
  state.contract = CONTRACTS[contractId];
  state.remaining = state.remaining.filter(function (x) { return x !== contractId; });
  if (contractId === 'trix') {
    state.rows = [0, 1, 2, 3].map(function () { return { started: false, low: 7, high: 7, cards: {} }; });
  }
  state.turn = (state.chooser + 1) % 4;
  state.phase = 'play';
}

function legalPlays(state, seat) {
  var hand = state.players[seat].hand;
  if (state.contract.id === 'trix') return legalTrix(state, seat);
  if (state.table.length === 0) {
    // leading: hearts closed until opened (unless hand is all hearts)
    if (!state.heartsOpened) {
      var nonHearts = hand.filter(function (c) { return !isHeart(c); });
      if (nonHearts.length) return nonHearts;
    }
    return hand.slice();
  }
  var follows = hand.filter(function (c) { return c.s === state.leadSuit; });
  return follows.length ? follows : hand.slice();
}

function legalTrix(state, seat) {
  var hand = state.players[seat].hand;
  var ext = hand.filter(function (c) {
    var row = state.rows[c.s];
    return row.started && (c.r === row.low - 1 || c.r === row.high + 1);
  });
  if (ext.length) return ext; // cannot open a 7 while an extension exists
  return hand.filter(function (c) { return c.r === 7 && !state.rows[c.s].started; });
}

function illegalMsg(state, seat, card) {
  if (state.contract.id === 'trix') {
    var row = state.rows[card.s];
    if (card.r === 7 && !row.started) return 'تقدر تلعب على صف مفتوح أولاً';
    return 'هذي الورقة ما تننزل هلق';
  }
  if (state.table.length > 0 && card.s !== state.leadSuit &&
      state.players[seat].hand.some(function (c) { return c.s === state.leadSuit; }))
    return 'لازم تلعب من نوع الورقة الأولى';
  if (state.table.length === 0 && !state.heartsOpened && isHeart(card)) return 'القلوب مقفلة بعد';
  return 'حركة غير مسموحة';
}

function applyPlay(state, seat, card) {
  var legal = legalPlays(state, seat);
  if (!legal.some(function (c) { return c.id === card.id; })) return { ok: false, msg: illegalMsg(state, seat, card) };
  var p = state.players[seat];
  p.hand = p.hand.filter(function (c) { return c.id !== card.id; });
  if (state.contract.id === 'trix') {
    var row = state.rows[card.s];
    row.cards[card.r] = seat;
    if (!row.started) { row.started = true; }
    else if (card.r === row.low - 1) row.low = card.r;
    else if (card.r === row.high + 1) row.high = card.r;
    if (p.hand.length === 0) p.done = true;
  } else {
    if (state.table.length === 0) state.leadSuit = card.s;
    state.table.push({ seat: seat, card: card });
    if (isHeart(card)) state.heartsOpened = true;
  }
  return { ok: true };
}

function resolveTrick(state) {
  var lead = state.leadSuit;
  var best = state.table[0];
  state.table.forEach(function (t) {
    if (t.card.s === lead && strength(t.card) > strength(best.card)) best = t;
  });
  var cards = state.table.map(function (t) { return t.card; });
  var w = state.players[best.seat];
  w.taken = w.taken.concat(cards);
  w.tricks++;
  state.table = []; state.leadSuit = null;
  return best.seat;
}

/* stuck in trix: no legal move at all → penalty per remaining card */
function applyStuck(state, seat) {
  var p = state.players[seat];
  p.trixPenalty += p.hand.length * PEN.stuck;
  var n = p.hand.length;
  p.hand = [];
  p.done = true;
  return n;
}

function computeDeltas(state) {
  var id = state.contract.id;
  return state.players.map(function (p) {
    var pen = 0;
    if (id === 'salb') pen = p.tricks * PEN.trick;
    if (id === 'banat') pen = p.taken.filter(isQueen).length * PEN.queen;
    if (id === 'qulub') pen = p.taken.filter(isHeart).length * PEN.heart;
    if (id === 'shabah') pen = p.taken.some(isKingHearts) ? PEN.shabah : 0;
    if (id === 'trix') pen = p.trixPenalty;
    return pen === 0 ? 0 : -pen;
  });
}

/* ------------------- simple AI ------------------- */
function aiPickContract(state) {
  var seat = state.chooser;
  var hand = state.players[seat].hand;
  // choose based on the hand that was just dealt
  var hearts = hand.filter(isHeart).length;
  var queens = hand.filter(isQueen).length;
  var hasKH = hand.some(isKingHearts);
  var opts = state.remaining.slice();
  var best = opts[0], bestScore = -1e9;
  opts.forEach(function (id) {
    var sc = 0;
    if (id === 'qulub') sc = 12 - hearts * 1.6;
    if (id === 'banat') sc = 12 - queens * 5;
    if (id === 'shabah') sc = 12 - (hasKH ? 8 : 0);
    if (id === 'salb') sc = 8 - hand.filter(function (c) { return strength(c) >= 12; }).length;
    if (id === 'trix') sc = 9;
    sc += Math.random() * 3;
    if (sc > bestScore) { bestScore = sc; best = id; }
  });
  return best;
}

function aiChoose(state, seat) {
  if (state.contract.id === 'trix') return aiTrix(state, seat);
  return aiTrick(state, seat);
}

function aiTrick(state, seat) {
  var p = state.players[seat];
  var legal = legalPlays(state, seat);
  var id = state.contract.id;
  var lead = state.leadSuit;

  if (state.table.length === 0) {
    // leading: try to dump a penalty card, else lead low
    var dump;
    if (id === 'banat') dump = legal.filter(isQueen);
    else if (id === 'qulub') dump = legal.filter(isHeart);
    else if (id === 'shabah') dump = legal.filter(isKingHearts);
    if (dump && dump.length) {
      dump.sort(function (a, b) { return strength(b) - strength(a); });
      return dump[0];
    }
    var low = legal.slice().sort(function (a, b) { return strength(a) - strength(b); });
    return low[0];
  }

  var follows = legal.filter(function (c) { return c.s === lead; });
  if (!follows.length) {
    // void: throw the most dangerous card away
    var danger = legal.filter(function (c) {
      return (id === 'banat' && isQueen(c)) || (id === 'qulub' && isHeart(c)) || (id === 'shabah' && isKingHearts(c));
    });
    var pool = danger.length ? danger : legal;
    pool = pool.slice().sort(function (a, b) { return strength(b) - strength(a); });
    return pool[0];
  }
  // must follow suit: prefer highest card that loses, else lowest winner
  var best = state.table[0];
  state.table.forEach(function (t) {
    if (t.card.s === lead && strength(t.card) > strength(best.card)) best = t;
  });
  var losers = follows.filter(function (c) { return strength(c) < strength(best.card); });
  if (losers.length) {
    losers.sort(function (a, b) { return strength(b) - strength(a); });
    return losers[0];
  }
  follows.sort(function (a, b) { return strength(a) - strength(b); });
  return follows[0];
}

function aiTrix(state, seat) {
  var p = state.players[seat];
  var legal = legalTrix(state, seat);
  var sevens = legal.filter(function (c) { return c.r === 7; });
  if (sevens.length) {
    // open the 7 of the suit we hold the most of
    sevens.sort(function (a, b) {
      var ca = p.hand.filter(function (x) { return x.s === a.s; }).length;
      var cb = p.hand.filter(function (x) { return x.s === b.s; }).length;
      return cb - ca;
    });
    return sevens[0];
  }
  return legal[Math.floor(Math.random() * legal.length)];
}

var TrixCore = {
  SUITS: SUITS, RANK_LABEL: RANK_LABEL, CONTRACTS: CONTRACTS, CONTRACT_ORDER: CONTRACT_ORDER, PEN: PEN,
  newDeck: newDeck, shuffle: shuffle, sortHand: sortHand, createGame: createGame,
  dealRound: dealRound, activateRound: activateRound,
  legalPlays: legalPlays, legalTrix: legalTrix, applyPlay: applyPlay, resolveTrick: resolveTrick,
  applyStuck: applyStuck, computeDeltas: computeDeltas,
  isHeart: isHeart, isQueen: isQueen, isKingHearts: isKingHearts, strength: strength,
  aiPickContract: aiPickContract, aiChoose: aiChoose
};

/* ============ UI (browser only) ============ */
if (typeof document !== 'undefined') (function () {

  var S = null;
  var timers = [];
  var el = function (id) { return document.getElementById(id); };

  function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  function cardHTML(c, cls) {
    var color = RED[c.s] ? 'red' : 'blk';
    return '<div class="' + (cls || 'card') + ' ' + color + '"><div class="r">' + RANK_LABEL[c.r] +
           '</div><div class="s">' + SUITS[c.s] + '</div></div>';
  }

  function toast(msg, ms) {
    var t = el('toast');
    t.textContent = msg;
    t.classList.add('show');
    later(function () { t.classList.remove('show'); }, ms || 1400);
  }

  function setStatus(msg) { el('status').textContent = msg; }

  /* ---------- rendering ---------- */
  function renderBar() {
    el('roundChip').textContent = 'الجولة ' + (S.round + 1) + '/5';
    el('contractChip').textContent = S.contract ? S.contract.name : 'اختر الجولة';
    el('heartsChip').hidden = !(S.contract && S.contract.id !== 'trix' && S.heartsOpened);
  }

  function renderScores() {
    var h = '';
    S.players.forEach(function (p) {
      h += '<div class="score"><b>' + p.score + '</b><span class="sn">' + p.name + '</span></div>';
    });
    el('scores').innerHTML = h;
  }

  function renderSeats() {
    [1, 2, 3].forEach(function (i) {
      var p = S.players[i];
      var d = el('seat' + i);
      d.querySelector('.avatar').textContent = p.name.charAt(0);
      d.querySelector('.sname').textContent = p.name;
      d.querySelector('.scnt').textContent = S.phase === 'play' && S.contract.id === 'trix' && p.done ? 'خلص' : p.hand.length + ' ورقة';
      d.classList.toggle('active', S.phase === 'play' && S.turn === i);
    });
  }

  function renderTrick() {
    var h = '';
    S.table.forEach(function (t) {
      h += cardHTML(t.card, 'tcard pos' + t.seat);
    });
    el('trick').innerHTML = h;
    el('trick').style.display = S.contract && S.contract.id === 'trix' ? 'none' : 'block';
  }

  function renderRows() {
    if (!S.rows) { el('rows').innerHTML = ''; return; }
    var order = [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
    var h = '';
    for (var s = 0; s < 4; s++) {
      var row = S.rows[s];
      h += '<div class="trow"><div class="tlabel ' + (RED[s] ? 'red' : 'blk') + '">' + SUITS[s] + '</div><div class="slots">';
      order.forEach(function (r) {
        if (row.cards[r] !== undefined) h += '<div class="slot filled ' + (RED[s] ? 'red' : 'blk') + '">' + RANK_LABEL[r] + '</div>';
        else h += '<div class="slot">' + RANK_LABEL[r] + '</div>';
      });
      h += '</div></div>';
    }
    el('rows').innerHTML = h;
  }

  function renderHand() {
    var myTurn = S.phase === 'play' && S.players[S.turn].human;
    var legalIds = myTurn ? legalPlays(S, 0).map(function (c) { return c.id; }) : null;
    var h = '';
    S.players[0].hand.forEach(function (c) {
      var cls = 'card';
      if (legalIds) cls += (legalIds.indexOf(c.id) >= 0 ? ' ok' : ' no');
      h += '<div class="' + cls + '" data-id="' + c.id + '">' +
           '<div class="corner"><span class="cr">' + RANK_LABEL[c.r] + '</span><span class="cs">' + SUITS[c.s] + '</span></div>' +
           '<div class="r">' + RANK_LABEL[c.r] + '</div><div class="s">' + SUITS[c.s] + '</div></div>';
    });
    el('hand').innerHTML = h;
    var hand = el('hand');
    var kids = hand.querySelectorAll('.card');
    /* auto-fit: spread cards so all fit the screen width, corner stays readable */
    var CW = 64, n = kids.length;
    var show = n > 1 ? Math.floor((hand.clientWidth - 12 - CW) / (n - 1)) : CW;
    if (show > 34) show = 34;
    if (show < 18) show = 18;
    for (var i = 0; i < n; i++) {
      (function (d, first) {
        d.addEventListener('click', function () { tapCard(parseInt(d.dataset.id, 10)); });
        if (!first) d.style.marginRight = (show - CW) + 'px'; /* rtl inline-start */
      })(kids[i], i === 0);
    }
  }

  function renderAll() {
    renderBar(); renderScores(); renderSeats(); renderTrick(); renderRows(); renderHand();
  }

  /* ---------- modal ---------- */
  function showModal(html) {
    el('modal').innerHTML = html;
    el('modalWrap').hidden = false;
  }
  function hideModal() { el('modalWrap').hidden = true; }

  /* ---------- flow ---------- */
  function start() {
    el('home').style.display = 'none';
    el('game').hidden = false;
    S = createGame();
    S.round = 0;
    nextRound();
  }

  function nextRound() {
    hideModal();
    clearTimers();
    S.chooser = S.round < 4 ? S.round : 0;
    dealRound(S);
    renderAll();
    setStatus('توزيع الأوراق…');
    if (S.round === 4) {
      var last = S.remaining[0];
      setStatus('الجولة الأخيرة');
      later(function () {
        toast('الجولة الأخيرة: ' + CONTRACTS[last].name, 1600);
        activateRound(S, last);
        renderAll();
        proceed();
      }, 900);
    } else if (S.players[S.chooser].human) {
      setStatus('اختر جولتك');
      showPickModal();
    } else {
      later(function () {
        var id = aiPickContract(S);
        toast(S.players[S.chooser].name + ' اختار: ' + CONTRACTS[id].name);
        activateRound(S, id);
        renderAll();
        proceed();
      }, 1000);
    }
  }

  function showPickModal() {
    var h = '<h2>اختر جولتك</h2><div class="msub">اختار المملكة اللي بدك يلعبها الكل</div>';
    S.remaining.forEach(function (id) {
      var c = CONTRACTS[id];
      h += '<button class="contract" onclick="G.pick(\'' + id + '\')"><b>' + c.name + '</b><span>' + c.desc + '</span></button>';
    });
    showModal(h);
  }

  function pick(id) {
    hideModal();
    activateRound(S, id);
    renderAll();
    proceed();
  }

  function proceed() {
    if (S.phase !== 'play') return;
    var trix = S.contract.id === 'trix';
    if (!trix && S.table.length === 4) {
      setStatus('…');
      later(finishTrick, 1000);
      return;
    }
    if (S.players.every(function (p) { return p.hand.length === 0; }) ||
        (trix && S.players.every(function (p) { return p.done; }))) {
      endRound();
      return;
    }
    stepTurn();
  }

  function stepTurn() {
    if (S.contract.id === 'trix') {
      while (S.players[S.turn].done) S.turn = (S.turn + 1) % 4;
    }
    var p = S.players[S.turn];
    renderAll();
    if (S.contract.id === 'trix' && legalTrix(S, S.turn).length === 0) {
      var n = applyStuck(S, S.turn);
      toast((p.human ? 'ما في حركة! عجز' : p.name + ' انعجز') + ' — خصم ' + (n * 10), 1800);
      renderAll();
      later(proceed, 500);
      return;
    }
    if (p.human) {
      setStatus('دورك — العب');
    } else {
      setStatus('دور: ' + p.name);
      later(function () {
        var c = aiChoose(S, S.turn);
        doPlay(S.turn, c);
      }, 700);
    }
  }

  function tapCard(id) {
    if (S.phase !== 'play' || !S.players[S.turn].human) { toast('مو دورك'); return; }
    var card = S.players[0].hand.filter(function (c) { return c.id === id; })[0];
    if (!card) return;
    doPlay(0, card);
  }

  function doPlay(seat, card) {
    var res = applyPlay(S, seat, card);
    if (!res.ok) { toast(res.msg); return; }
    S.turn = (S.turn + 1) % 4;
    proceed();
  }

  function finishTrick() {
    var w = resolveTrick(S);
    S.turn = w;
    toast(S.players[w].name + ' أخذ الضربة', 800);
    renderAll();
    later(proceed, 450);
  }

  function endRound() {
    var deltas = computeDeltas(S);
    S.players.forEach(function (p, i) { p.score += deltas[i]; });
    S.phase = 'roundEnd';
    renderAll();
    setStatus('انتهت الجولة');
    var h = '<h2>' + S.contract.name + ' — النتيجة</h2><div class="msub">الجولة ' + (S.round + 1) + ' من 5</div><table class="stable">';
    S.players.forEach(function (p, i) {
      var d = deltas[i];
      h += '<tr><td class="' + (p.human ? 'me' : '') + '">' + p.name + '</td><td class="' +
           (d < 0 ? 'neg' : 'zero') + '">' + (d === 0 ? '0' : d) + '</td><td><b>' + p.score + '</b></td></tr>';
    });
    h += '</table><div class="center"><button class="btn" onclick="G.nextRound()">' +
         (S.round === 4 ? 'النتيجة النهائية' : 'الجولة التالية') + '</button></div>';
    showModal(h);
  }

  function nextRoundBtn() {
    if (S.round === 4) { finalModal(); return; }
    S.round++;
    nextRound();
  }

  function finalModal() {
    S.phase = 'gameEnd';
    var medals = ['🥇', '🥈', '🥉', ''];
    var order = S.players.slice().sort(function (a, b) { return b.score - a.score; });
    var h = '<h2>النتيجة النهائية</h2><div class="msub">تركس</div><table class="stable">';
    order.forEach(function (p, i) {
      h += '<tr><td class="medal">' + medals[i] + '</td><td class="' + (p.human ? 'me' : '') + '">' + p.name +
           '</td><td><b>' + p.score + '</b></td></tr>';
    });
    h += '</table><div class="center"><button class="btn big" onclick="G.newGame()">لعبة جديدة</button></div>';
    showModal(h);
  }

  function newGame() {
    hideModal();
    clearTimers();
    S = createGame();
    S.round = 0;
    nextRound();
  }

  function rules() {
    var h = '<h2>قوانين التركس</h2><div class="rules">' +
      '<p><b>٥ جولات:</b> السلب، البنات، القلوب، الشعبان، والتركيس. كل لاعب يختار جولة، والجولة الأخيرة تكون المتبقية.</p>' +
      '<p><b>السلب:</b> لا تأخذ أي ضربة — كل ضربة خصم 10.</p>' +
      '<p><b>البنات:</b> تجنّب أسر البنات — كل بنت خصم 50.</p>' +
      '<p><b>القلوب:</b> تجنّب أخذ القلوب — كل قلب خصم 20. ما تقدر تبدأ بالقلوب إلا بعد ما تنفتح.</p>' +
      '<p><b>الشعبان:</b> تجنّب أسر K♥ — خصم 75.</p>' +
      '<p><b>التركيس:</b> رتّب كل نوع من الـ7: فوق لحد K وتحت لحد A. ما تقدر تفتح 7 وأنت تقدر تلعب على صف مفتوح. إذا انعجزت: خصم 10 لكل ورقة بيدك.</p>' +
      '<p>في الممالك: تلعب من نوع الورقة الأولى (إذا ما عندك، ارمي أي ورقة) وأعلى ورقة من نفس النوع تأخذ الضربة.</p>' +
      '</div><div class="center"><button class="btn" onclick="G.closeRules()">تم</button></div>';
    showModal(h);
  }

  window.G = {
    start: start, pick: pick, rules: rules, closeRules: hideModal,
    nextRound: nextRoundBtn, newGame: newGame
  };

  /* explicit listeners for home buttons (with debug logs) */
  function wireHome() {
    console.log('تركس: game.js loaded, wiring home buttons');
    var bStart = document.getElementById('btnStart');
    var bRules = document.getElementById('btnRules');
    if (bStart) bStart.addEventListener('click', function () { console.log('start clicked'); start(); });
    if (bRules) bRules.addEventListener('click', function () { console.log('rules clicked'); rules(); });
  }
  wireHome();
})();

if (typeof module !== 'undefined' && module.exports) module.exports = TrixCore;
