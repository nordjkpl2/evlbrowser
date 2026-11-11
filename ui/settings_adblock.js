'use strict';
// ---------- bloqueador de anúncios ----------
// Interruptor liga/desliga e contador. Só consulta o main.js com a categoria aberta.

const abSwitch = $('ab-switch');
const abCount = $('ab-count');

function showAdblock(state) {
  if (!state) return;
  abSwitch.setAttribute('aria-checked', String(state.enabled));
  abCount.textContent = String(state.blocked);
}

async function loadAdblock() {
  showAdblock(await window.evl.adblockGet());
}

abSwitch.addEventListener('click', async () => {
  const on = abSwitch.getAttribute('aria-checked') !== 'true';
  showAdblock(await window.evl.adblockSet(on));
});
