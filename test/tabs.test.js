// Testa abas e política de memória com um "Electron de mentira" (rode: npm test).
const Module = require('module');
const assert = require('assert');
const EventEmitter = require('events');
const root = require('path').join(__dirname, '..');

let pidSeq = 100;
class FakeWC extends EventEmitter {
  constructor() { super(); this.pid = pidSeq++; this.closed = false; this.audible = false; this.loaded = []; this.navigationHistory = { canGoBack: () => false, canGoForward: () => false, goBack() {}, goForward() {} }; }
  loadURL(u) { this.loaded.push(u); }
  focus() { this.focused = true; } reload() {} openDevTools() {} send() {}
  setWindowOpenHandler(fn) { this.openHandler = fn; }
  isCurrentlyAudible() { return this.audible; }
  getOSProcessId() { return this.pid; }
  close() { this.closed = true; }
}
class FakeView { constructor() { this.webContents = new FakeWC(); } setBounds(b) { this.bounds = b; } }
let metrics = [];
const fake = { WebContentsView: FakeView, app: { getAppMetrics: () => metrics } };
const orig = Module._load;
Module._load = function (req, ...r) { return req === 'electron' ? fake : orig.call(this, req, ...r); };

// contador de timers (para provar que idle não agenda nada)
const timers = new Set();
const realST = global.setTimeout, realCT = global.clearTimeout;
global.setTimeout = (fn, ms) => { const t = realST(fn, ms); t.__ms = ms; timers.add(t); return t; };
global.clearTimeout = (t) => { timers.delete(t); realCT(t); };

const attached = new Set();
const win = { contentView: { addChildView: (v) => attached.add(v), removeChildView: (v) => attached.delete(v) }, getContentBounds: () => ({ width: 1000, height: 700 }) };
const ui = new FakeView(); ui.webContents.pid = 1;
let changes = 0;
const { TabManager } = require(root + '/src/tabs.js');
const tabs = new TabManager(win, ui, () => { changes++; }, () => false);

// 1) Aba em branco: sem processo extra, UI em tela cheia
const a = tabs.create();
assert.strictEqual(tabs.tabs.get(a).view, null, 'aba em branco não cria view');
assert.deepStrictEqual(ui.bounds, { x: 0, y: 0, width: 1000, height: 700 });
assert.strictEqual(tabs.snapshot().activeKind, 'blank');
assert.strictEqual(attached.size, 0);

// 2) Digitar um endereço transforma a aba em web, UI volta para 80px
tabs.navigate('example.com');
let t = tabs.tabs.get(a);
assert.strictEqual(t.kind, 'web'); assert.ok(t.view); assert.strictEqual(t.url, 'https://example.com/');
assert.deepStrictEqual(ui.bounds, { x: 0, y: 0, width: 1000, height: 80 });
assert.deepStrictEqual(t.view.bounds, { x: 0, y: 80, width: 1000, height: 620 });
assert.deepStrictEqual(t.view.webContents.loaded, ['https://example.com/']);

// 3) Configurações: aba interna, sem view, reaproveitada
const s = tabs.openSettings();
assert.strictEqual(tabs.tabs.get(s).view, null);
assert.deepStrictEqual(ui.bounds, { x: 0, y: 0, width: 1000, height: 700 });
assert.strictEqual(tabs.snapshot().tabs.find((x) => x.id === a).state, 'sleeping');
assert.strictEqual(tabs.openSettings(), s, 'não duplica Configurações');
assert.strictEqual(tabs.tabs.size, 2);
tabs.navigate('evl://settings'); assert.strictEqual(tabs.tabs.size, 2);
assert.strictEqual(attached.size, 0, 'aba web ficou fora da janela');

// 4) política de memória sem timer quando não há candidata
const { startMemoryPolicy, processReport } = require(root + '/src/memory.js');
const cfg = require(root + '/src/config.js');
let reported = null;
const policy = startMemoryPolicy(tabs, (mb) => { reported = mb; });
timers.clear();
tabs.activate(a);                    // aba web ativa -> nenhuma de fundo com view
policy.refresh();
assert.strictEqual(timers.size, 0, 'idle: nenhum timer agendado');

tabs.activate(s);                    // web vai para o fundo -> candidata
policy.refresh();
assert.strictEqual(timers.size, 1, 'com aba de fundo: exatamente 1 timer');
const ms = [...timers][0].__ms;
assert.ok(ms >= cfg.MIN_WAIT_MS && ms <= cfg.BUDGET_CHECK_MS, 'espera dentro dos limites: ' + ms);
policy.refresh(); assert.strictEqual(timers.size, 1, 'refresh não empilha timers');

tabs.activate(a);                    // candidata voltou a ser ativa
policy.refresh();
assert.strictEqual(timers.size, 0, 'sem candidata o timer é cancelado');

// 5) descarte por ociosidade e por áudio
const b = tabs.create('site.com');   // a vai para o fundo
tabs.tabs.get(a).lastActive = Date.now() - 20 * 60 * 1000;
assert.deepStrictEqual(tabs.idleBackgroundTabs(cfg.DISCARD_AFTER_MS).map((x) => x.id), [a]);
tabs.tabs.get(a).view.webContents.audible = true;
assert.strictEqual(tabs.idleBackgroundTabs(cfg.DISCARD_AFTER_MS).length, 0, 'áudio nunca é descartado');
tabs.tabs.get(a).view.webContents.audible = false;
const wcA = tabs.tabs.get(a).view.webContents;
tabs.discard(a);
assert.ok(wcA.closed); assert.strictEqual(tabs.snapshot().tabs.find((x) => x.id === a).state, 'discarded');
tabs.discard(b); assert.ok(tabs.tabs.get(b).view, 'ativa nunca é descartada');

// 6) reativar recria a página
tabs.activate(a);
assert.ok(tabs.tabs.get(a).view); assert.deepStrictEqual(tabs.tabs.get(a).view.webContents.loaded, ['https://example.com/']);

// 7) window.open vira nova aba web; esquema perigoso é ignorado
const before = tabs.tabs.size;
const r = tabs.tabs.get(a).view.webContents.openHandler({ url: 'https://novo.com' });
assert.strictEqual(r.action, 'deny'); assert.strictEqual(tabs.tabs.size, before + 1);
tabs.tabs.get(a).view.webContents.openHandler({ url: 'javascript:alert(1)' });
assert.strictEqual(tabs.tabs.size, before + 1);

// 8) relatório de memória por processo
tabs.activate(a);
metrics = [
  { pid: 1, type: 'Tab', memory: { privateBytes: 40960 } },
  { pid: tabs.tabs.get(a).view.webContents.pid, type: 'Tab', memory: { privateBytes: 102400 } },
  { pid: 7, type: 'GPU', memory: { workingSetSize: 51200 } },
  { pid: 8, type: 'Browser', memory: { privateBytes: 20480 } },
];
const rep = processReport(tabs, ui.webContents);
assert.strictEqual(rep.totalMB, 210);
assert.strictEqual(rep.processes[0].mb, 100);
assert.ok(rep.processes[0].label.length > 0 && rep.processes[0].label !== 'Página');
assert.ok(rep.processes.some((p) => p.label === 'Interface do Evl'));
assert.ok(rep.processes.some((p) => p.label === 'GPU'));

// 9) fechar tudo sempre deixa uma aba (em branco)
for (const id of [...tabs.tabs.keys()]) tabs.close(id);
assert.strictEqual(tabs.tabs.size, 1);
assert.strictEqual(tabs.snapshot().activeKind, 'blank');
policy.stop();
console.log('smoke OK');
