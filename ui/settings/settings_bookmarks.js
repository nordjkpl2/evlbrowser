'use strict';
// ---------- favoritos ----------
// Lista dos favoritos: clicar abre numa aba nova. Só consulta com a categoria aberta.

const bList = $('b-list');
const bEmpty = $('b-empty');
const bTotal = $('b-total');
const bForm = $('b-form');
const bError = $('b-error');

async function loadBookmarks() {
  const items = await window.evl.bookmarksList();
  bTotal.textContent = items.length ? `· ${items.length}` : '';
  bEmpty.hidden = items.length > 0;
  lazyList(bList, items, (item) => {
    const li = document.createElement('li');
    li.className = 'b-row';
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'h-item b-item'; // visual das linhas do histórico + estrela
    open.title = item.url;
    const star = document.createElement('span');
    star.className = 'b-star';
    star.textContent = '\u2605';
    const title = document.createElement('span');
    title.className = 'h-title';
    title.textContent = item.title;
    const url = document.createElement('span');
    url.className = 'h-url hint';
    url.textContent = item.url;
    open.append(star, title, url);
    open.addEventListener('click', () => window.evl.bookmarksOpen(item.url));
    li.append(open, textButton(t('Remover'), async () => {
      await window.evl.bookmarksRemove(item.id);
      loadBookmarks();
    }));
    return li;
  });
}

function closeBookmarkForm() {
  bForm.hidden = true;
  bForm.reset();
  bError.hidden = true;
}
$('b-add').addEventListener('click', () => {
  bForm.hidden = false;
  $('b-url').focus();
});
$('b-cancel').addEventListener('click', closeBookmarkForm);
bForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const r = await window.evl.bookmarksAdd($('b-url').value, $('b-title').value);
  if (!r?.ok) {
    bError.textContent = t('Endereço inválido. Exemplo: exemplo.com');
    bError.hidden = false;
    return;
  }
  closeBookmarkForm();
  loadBookmarks();
});
