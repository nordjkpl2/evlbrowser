'use strict';
// ---------- bloqueador de anúncios ----------
// Interruptor liga/desliga e contador. Só consulta o main.js com a categoria aberta.

const abSwitch = $('ab-switch');
const abCount = $('ab-count');

const abAllow = $('ab-allow');

function showAdblock(state) {
  if (!state) return;
  abSwitch.setAttribute('aria-checked', String(state.enabled));
  abCount.textContent = String(state.blocked);
  abAllow.replaceChildren(
    ...state.allow.map((site) => {
      const li = document.createElement('li');
      li.className = 'ab-row';
      const name = document.createElement('span');
      name.className = 'ab-site';
      name.textContent = site;
      li.append(name, textButton(t('Remover'), async () => showAdblock(await window.evl.adblockAllow(site, false))));
      return li;
    })
  );
}

$('ab-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = $('ab-site');
  const state = await window.evl.adblockAllow(input.value, true);
  if (state) {
    input.value = '';
    showAdblock(state);
  }
});

async function loadAdblock() {
  showAdblock(await window.evl.adblockGet());
}

abSwitch.addEventListener('click', async () => {
  const on = abSwitch.getAttribute('aria-checked') !== 'true';
  showAdblock(await window.evl.adblockSet(on));
});
