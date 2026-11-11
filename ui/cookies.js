'use strict';
// ---------- cookies ----------
// A lista mostra só o site e os nomes (nunca os valores). Só consulta com a categoria aberta.

const cList = $('c-list');
const cEmpty = $('c-empty');
const cTotal = $('c-total');
const cStatus = $('c-status');
const cImport = $('c-import');
const cMenu = $('c-menu');

async function loadCookies() {
  const data = await window.evl.cookiesList();
  if (!data) return;
  cTotal.textContent = data.total ? `· ${data.total}` : '';
  cEmpty.hidden = data.total > 0;
  lazyList(cList, data.domains, (d) => {
    const li = document.createElement('li');
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    const domain = document.createElement('span');
    domain.textContent = d.domain;
    const count = document.createElement('span');
    count.className = 'hint';
    count.textContent = String(d.count);
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'text-btn c-del';
    del.textContent = t('Apagar');
    del.title = t('Apagar os cookies de {d}', { d: d.domain });
    del.addEventListener('click', async (event) => {
      event.preventDefault(); // não abre nem fecha a linha
      event.stopPropagation();
      reportRemoved(await window.evl.cookiesRemove(d.domain), d.domain);
    });
    summary.append(domain, count, del);
    const names = document.createElement('div');
    names.className = 'c-names mono hint';
    // os nomes só são escritos quando você abre o site
    details.addEventListener('toggle', () => {
      if (details.open && !names.textContent) {
        names.textContent = d.names.join('  ·  ') + (d.count > d.names.length ? '  ·  …' : '');
      }
    });
    details.append(summary, names);
    li.append(details);
    return li;
  });
}

function setImportMenu(open) {
  cMenu.hidden = !open;
  cImport.setAttribute('aria-expanded', String(open));
}

cImport.addEventListener('click', () => setImportMenu(cMenu.hidden));
document.addEventListener('mousedown', (event) => {
  if (!cMenu.hidden && !cMenu.contains(event.target) && event.target !== cImport) setImportMenu(false);
});
cMenu.querySelectorAll('button').forEach((btn) =>
  btn.addEventListener('click', async () => {
    setImportMenu(false);
    const label = { firefox: 'Firefox', chromium: 'Chromium', json: t('Arquivo') }[btn.dataset.from];
    cStatus.hidden = false;
    cStatus.textContent = t('Importando…');
    cImport.disabled = true;
    const r = await window.evl.cookiesImport(btn.dataset.from);
    cImport.disabled = false;
    if (r?.canceled) {
      cStatus.hidden = true; // fechou a janela de escolher arquivo
      return;
    }
    if (!r) cStatus.textContent = t('Não foi possível importar agora.');
    else if (!r.ok) cStatus.textContent = tm(r.message);
    else {
      const parts = [t('{n} importados', { n: r.imported })];
      if (r.skipped) parts.push(t('{n} ignorados (vencidos ou recusados)', { n: r.skipped }));
      if (r.encrypted) parts.push(t('{n} protegidos pelo navegador de origem (não dá para ler)', { n: r.encrypted }));
      cStatus.textContent = `${label}: ${parts.join(', ')}.`;
    }
    loadCookies();
  })
);

// Apagar: um site (botão "Apagar" da linha) ou todos (pede um segundo clique para confirmar).
const cClear = $('c-clear');
let armedTimer = null;

async function reportRemoved(result, domain) {
  cStatus.hidden = false;
  cStatus.textContent = result
    ? `${domain ? t('{n} cookies apagados de {d}', { n: result.removed, d: domain }) : t('{n} cookies apagados', { n: result.removed })}.`
    : t('Não foi possível apagar agora.');
  await loadCookies();
}

function disarmClear() {
  clearTimeout(armedTimer);
  delete cClear.dataset.armed;
  cClear.textContent = t('Apagar todos');
}

cClear.addEventListener('click', async () => {
  if (!cClear.dataset.armed) {
    cClear.dataset.armed = '1';
    cClear.textContent = t('Confirmar: apagar todos');
    armedTimer = setTimeout(disarmClear, 4000); // desiste sozinho
    return;
  }
  disarmClear();
  reportRemoved(await window.evl.cookiesRemove(null), '');
});
