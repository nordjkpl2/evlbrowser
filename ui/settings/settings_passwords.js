'use strict';
// ---------- senhas ----------
// A lista traz só site e usuário. A senha só vem quando você pede (Mostrar/Copiar) e nunca é guardada aqui.

const pList = $('p-list');
const pEmpty = $('p-empty');
const pTotal = $('p-total');
const pStatus = $('p-status');
const pForm = $('p-form');
const pError = $('p-error');
const pClear = $('p-clear');
let pArmed = null;

function pSay(text) {
  pStatus.hidden = !text;
  pStatus.textContent = text;
}

function pRow(item) {
  const li = document.createElement('li');
  li.className = 'p-row';
  const site = document.createElement('span');
  site.className = 'p-site';
  site.textContent = item.site;
  const user = document.createElement('span');
  user.className = 'p-user hint';
  user.textContent = item.username || '—';
  const secret = document.createElement('code');
  secret.className = 'p-secret';
  secret.hidden = true;
  let timer = null;
  const hide = () => {
    clearTimeout(timer);
    secret.hidden = true;
    secret.textContent = '';
    show.textContent = t('Mostrar');
  };
  const show = textButton(t('Mostrar'), async () => {
    if (!secret.hidden) return hide();
    const password = await window.evl.passwordsShow(item.id);
    if (password === null) return;
    secret.textContent = password;
    secret.hidden = false;
    show.textContent = t('Ocultar');
    timer = setTimeout(hide, 10000); // some sozinha
  });
  const copy = textButton(t('Copiar'), async () => {
    pSay((await window.evl.passwordsCopy(item.id)) ? t('Senha copiada (limpa em 30 s).') : '');
  });
  const del = textButton(t('Apagar'), async () => {
    await window.evl.passwordsRemove(item.id);
    loadPasswords();
  });
  li.append(site, user, secret, show, copy, del);
  return li;
}

async function loadPasswords() {
  const data = await window.evl.passwordsList();
  if (!data) return;
  $('p-off').hidden = data.available;
  pTotal.textContent = data.items.length ? `· ${data.items.length}` : '';
  pEmpty.hidden = data.items.length > 0;
  lazyList(pList, data.items, pRow);
}

function closePasswordForm() {
  pForm.hidden = true;
  pForm.reset();
  pError.hidden = true;
}

$('p-add').addEventListener('click', () => {
  pForm.hidden = false;
  $('p-site').focus();
});
$('p-cancel').addEventListener('click', closePasswordForm);
pForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const r = await window.evl.passwordsAdd({ site: $('p-site').value, username: $('p-user').value, password: $('p-pass').value });
  if (!r?.ok) {
    pError.hidden = false;
    pError.textContent = tm(r?.error ?? 'Não foi possível salvar.');
    return;
  }
  closePasswordForm();
  pSay(r.result === 'updated' ? t('Senha atualizada.') : t('Senha salva.'));
  loadPasswords();
});

$('p-import').addEventListener('click', async () => {
  pSay(t('Importando…'));
  const r = await window.evl.passwordsImport();
  if (!r || r.canceled) return pSay('');
  if (!r.ok) pSay(tm(r.error));
  else pSay(t('{a} novas, {u} atualizadas, {s} ignoradas.', { a: r.added, u: r.updated, s: r.skipped }));
  loadPasswords();
});

function disarmPasswordClear() {
  clearTimeout(pArmed);
  delete pClear.dataset.armed;
  pClear.textContent = t('Apagar todas');
}
pClear.addEventListener('click', async () => {
  if (!pClear.dataset.armed) {
    pClear.dataset.armed = '1';
    pClear.textContent = t('Confirmar: apagar todas');
    pArmed = setTimeout(disarmPasswordClear, 4000);
    return;
  }
  disarmPasswordClear();
  await window.evl.passwordsClear();
  loadPasswords();
});
