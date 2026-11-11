'use strict';
// ---------- favoritos ----------
// Lista dos favoritos: clicar abre numa aba nova. Só consulta com a categoria aberta.

const bList = $('b-list');
const bEmpty = $('b-empty');
const bTotal = $('b-total');

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
