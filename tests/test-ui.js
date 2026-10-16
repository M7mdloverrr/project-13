/* UI smoke test: run browser flow with a minimal DOM stub */
'use strict';
var assert = require('assert');

function fakeEl(id) {
  return {
    id: id, style: {}, hidden: false, dataset: {}, clientWidth: 360,
    _html: '', textContent: '',
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = v; },
    classList: { add: function () {}, remove: function () {}, toggle: function () {} },
    addEventListener: function () {},
    querySelector: function () { return fakeEl(id + '-child'); },
    querySelectorAll: function () { return []; }
  };
}

var registry = {};
global.document = {
  getElementById: function (id) { if (!registry[id]) registry[id] = fakeEl(id); return registry[id]; }
};
global.window = {};

require('../app/src/main/assets/www/game.js');

var G = global.window.G;
assert.ok(G && G.start && G.pick, 'window.G exported');

G.start();
var hand = registry['hand'];
assert.ok(registry['game'].hidden === false, 'game screen shown');
assert.ok(hand.innerHTML.indexOf('class="card bigcard red') >= 0 || hand.innerHTML.indexOf('class="card bigcard blk') >= 0,
  'hand cards carry an explicit color class (root cause of invisible text)');
assert.ok((hand.innerHTML.match(/class="card bigcard (?:red|blk)"/g) || []).length === 13, 'all 13 hand cards rendered with colors');
assert.ok(hand.innerHTML.indexOf('corner c-tl') >= 0 && hand.innerHTML.indexOf('corner c-br') >= 0, 'corner labels rendered on both sides');
assert.ok(hand.innerHTML.indexOf('marginRight') === -1, 'no overlap margins injected');

/* pick trix contract and make sure rows + hand render without errors */
global.setTimeout = function () { return 0; };
G.pick('trix');
assert.ok(registry['rows'].innerHTML.indexOf('slot') >= 0, 'trix rows rendered');
assert.ok(registry['modalWrap'].hidden === true, 'modal hidden after pick');
assert.ok(registry['hand'].innerHTML.indexOf('class="card bigcard') >= 0, 'hand re-rendered after pick');

console.log('UI smoke test passed.');
