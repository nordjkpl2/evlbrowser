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
  getZoomLevel() { return this.zoom ?? 0; }
  setZoomLevel(l) { this.zoom = l; }
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
const { TabManager } = require(root + '/src/tabs_manager.js');
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
assert.strictEqual([...attached].filter((v) => v !== ui).length, 0, 'aba web ficou fora da janela');

// 4) política de memória sem timer quando não há candidata
const { startMemoryPolicy, processReport } = require(root + '/src/memory_policy.js');
const cfg = require(root + '/src/app_config.js');
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
// vídeo tocando (mesmo sem som no instante) e som recente também protegem
tabs.tabs.get(a).view.webContents.emit('media-started-playing');
assert.strictEqual(tabs.idleBackgroundTabs(cfg.DISCARD_AFTER_MS).length, 0, 'mídia tocando não é descartada');
tabs.tabs.get(a).view.webContents.emit('media-paused');
tabs.tabs.get(a).view.webContents.emit('audio-state-changed', { audible: true });
assert.strictEqual(tabs.idleBackgroundTabs(cfg.DISCARD_AFTER_MS).length, 0, 'som recente protege por um tempo');
tabs.discard(a);
assert.ok(tabs.tabs.get(a).view, 'discard direto também respeita a proteção');
tabs.tabs.get(a).lastAudible = 0;
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

// 9) zoom: passos do Chrome, reset e porcentagem no estado
tabs.activate(a);
assert.strictEqual(tabs.snapshot().zoom, 100);
const steps = [];
for (let i = 0; i < 3; i++) { tabs.zoomIn(); steps.push(tabs.snapshot().zoom); }
assert.deepStrictEqual(steps, [110, 125, 150]);
tabs.zoomOut(); assert.strictEqual(tabs.snapshot().zoom, 125);
for (let i = 0; i < 30; i++) tabs.zoomIn();
assert.strictEqual(tabs.snapshot().zoom, 500, 'máximo 500%');
for (let i = 0; i < 30; i++) tabs.zoomOut();
assert.strictEqual(tabs.snapshot().zoom, 25, 'mínimo 25%');
tabs.zoomReset(); assert.strictEqual(tabs.snapshot().zoom, 100);
tabs.tabs.get(a).view.webContents.setZoomLevel(Math.log(1.15) / Math.log(1.2)); // zoom "quebrado" (115%)
tabs.zoomIn(); assert.strictEqual(tabs.snapshot().zoom, 125, 'encaixa no próximo passo');
tabs.zoomReset();
tabs.tabs.get(a).view.webContents.emit('zoom-changed', {}, 'in'); // Ctrl + roda
assert.strictEqual(tabs.snapshot().zoom, 110);
tabs.zoomReset();
tabs.activate(s);
assert.strictEqual(tabs.snapshot().zoom, null, 'Configurações não tem zoom');

// 10) submenu do contador de memória: a interface cresce por cima da página
const { MENU_HEIGHT, SUGGEST_HEIGHT } = cfg;
tabs.activate(a);
assert.strictEqual(tabs.snapshot().menuOpen, false);
tabs.setMenu(true);
assert.strictEqual(tabs.snapshot().menuOpen, true);
assert.deepStrictEqual(ui.bounds, { x: 0, y: 0, width: 1000, height: 80 + MENU_HEIGHT });
assert.ok(attached.has(ui), 'interface sobe para o topo');
tabs.setMenu(false);
assert.deepStrictEqual(ui.bounds, { x: 0, y: 0, width: 1000, height: 80 });
tabs.setSuggest(true);
assert.deepStrictEqual(ui.bounds, { x: 0, y: 0, width: 1000, height: 80 + SUGGEST_HEIGHT });
tabs.setMenu(true);
assert.deepStrictEqual(ui.bounds, { x: 0, y: 0, width: 1000, height: 80 + MENU_HEIGHT }, 'menu fecha as sugestões');
tabs.setMenu(false);
tabs.setSuggest(true); tabs.setSuggest(false);
assert.deepStrictEqual(ui.bounds, { x: 0, y: 0, width: 1000, height: 80 });
tabs.setMenu(true); tabs.activate(s);
assert.strictEqual(tabs.snapshot().menuOpen, false, 'trocar de aba fecha o menu');
tabs.activate(a);

// 11) histórico recebe visitas; Ctrl+Shift+T reabre; sessão é restaurada sem criar páginas
const visits = [];
const withHist = new TabManager(win, ui, () => {}, () => false, { add: (u) => visits.push(u), setTitle() {} });
const h1 = withHist.create('hist.com');
withHist.tabs.get(h1).view.webContents.emit('did-navigate', { url: 'https://hist.com/x' });
assert.deepStrictEqual(visits, ['https://hist.com/x']);
withHist.close(h1);
assert.strictEqual(withHist.tabs.size, 1, 'sobra a aba em branco');
withHist.reopenClosed();
assert.strictEqual([...withHist.tabs.values()].filter((x) => x.kind === 'web').length, 1);
withHist.reopenClosed(); // nada mais para reabrir
assert.strictEqual(withHist.tabs.size, 2);

const snap = withHist.sessionSnapshot();
assert.strictEqual(snap.items.length, 1);
const fresh = new TabManager(win, ui, () => {}, () => false);
assert.strictEqual(fresh.restore([{ url: 'https://a.com/', title: 'A' }, { url: 'javascript:1' }, { url: 'b.com', title: 'B' }], 1), true);
assert.strictEqual(fresh.tabs.size, 2, 'esquema perigoso ignorado');
const states = fresh.snapshot().tabs.map((x) => x.state);
assert.deepStrictEqual(states, ['discarded', 'active'].map((s, i) => s)); // a ativa é a 2ª
assert.strictEqual([...fresh.tabs.values()].filter((x) => x.view).length, 1, 'só a ativa tem página');
assert.strictEqual(new TabManager(win, ui, () => {}, () => false).restore([], 0), false);
assert.strictEqual(new TabManager(win, ui, () => {}, () => false).restore(undefined), false);
fresh.destroyAll(); withHist.destroyAll();
tabs.activate([...tabs.tabs.keys()][0]);

// 12) fechar tudo sempre deixa uma aba (em branco)
for (const id of [...tabs.tabs.keys()]) tabs.close(id);
assert.strictEqual(tabs.tabs.size, 1);
assert.strictEqual(tabs.snapshot().activeKind, 'blank');
policy.stop();
console.log('smoke OK');
