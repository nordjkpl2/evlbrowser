'use strict';
// ---------- downloads ----------
// Lista dos arquivos baixados (em andamento no topo), pasta de destino e "perguntar onde salvar".

const dList = $('d-list');
let dKey = '';

function dSize(bytes) {
  if (!(bytes > 0)) return '';
  const mb = bytes / 1048576;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function dRow(d) {
  const li = document.createElement('li');
  const name = document.createElement('span');
  name.className = 'x-name';
  name.textContent = d.name;
  name.title = d.path || d.name;
  const info = document.createElement('span');
  info.className = 'hint';
  const act = (label, fn) => textButton(label, async () => showDownloads(await fn(d.id)));
  if (d.state === 'progress') {
    const bar = document.createElement('progress');
    if (d.total > 0) {
      bar.max = d.total;
      bar.value = d.received;
    }
    info.textContent = `${dSize(d.received)}${d.total > 0 ? ` / ${dSize(d.total)}` : ''}`;
    li.append(name, bar, info, act(d.paused ? t('Continuar') : t('Pausar'), window.evl.downloadsPause), act(t('Cancelar'), window.evl.downloadsCancel));
    return li;
  }
  info.textContent = [d.host, d.state === 'done' ? dSize(d.received) : d.state === 'cancelled' ? t('cancelado') : t('falhou')].filter(Boolean).join(' · ');
  li.append(name, info);
  if (d.state === 'done') {
    li.append(textButton(t('Abrir'), () => window.evl.downloadsOpen(d.id)), textButton(t('Mostrar na pasta'), () => window.evl.downloadsShow(d.id)));
  }
  li.append(act(t('Tirar da lista'), window.evl.downloadsRemove));
  return li;
}

function showDownloads(s) {
  if (!s) return;
  const key = JSON.stringify(s) + lang;
  if (key === dKey) return; // chamado a cada 2 s: só redesenha se mudou
  dKey = key;
  $('d-dir').textContent = s.dir;
  $('d-ask').setAttribute('aria-checked', String(s.ask));
  $('d-total').textContent = s.items.length ? `· ${s.items.length}` : '';
  $('d-empty').hidden = s.items.length > 0;
  dList.replaceChildren(...s.items.map(dRow));
}

async function loadDownloads() {
  showDownloads(await window.evl.downloadsList());
}

$('d-pick').addEventListener('click', async () => showDownloads(await window.evl.downloadsFolder()));
$('d-ask').addEventListener('click', async (event) => showDownloads(await window.evl.downloadsAsk(event.currentTarget.getAttribute('aria-checked') !== 'true')));
$('d-clear').addEventListener('click', async () => showDownloads(await window.evl.downloadsClear()));
