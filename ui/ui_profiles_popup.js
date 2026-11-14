'use strict';
// ---------- perfis (botão à esquerda da barra) ----------
// Trocar de perfil, criar e apagar. Cada perfil tem a sua sessão (cookies, logins) e o seu cofre de senhas.
// O main.js manda a lista (state.profiles) e o perfil que está na tela (state.profile).

const profBtn = $('prof-btn');
const profPop = $('prof-pop');
const profList = $('prof-list');
const profNameEl = $('prof-name');
const profForm = $('prof-new');
const profInput = $('prof-input');
const profErr = $('prof-err');
let profOpen = false;
let profList_ = []; // última lista recebida do main
let profActiveId = 'default';
let profKey = ''; // o que está desenhado na lista (evita refazer à toa)
let profConfirm = null; // perfil que espera o 2º clique para ser apagado

const PROF_ERRORS = {
  name: 'Escreva um nome para o perfil',
  limit: 'Você já tem o máximo de perfis',
};

const profLabel = (p) => (p.id === 'default' ? t('Pessoal') : p.name);

function showProfErr(text) {
  profErr.textContent = text || '';
  profErr.hidden = !text;
}

// Chamado pelo ui_main.js a cada estado.
function syncProfiles(state) {
  const list = state.profiles ?? [];
  const active = list.find((p) => p.id === state.profile) ?? list[0];
  if (!active) return;
  profList_ = list;
  profActiveId = active.id;
  // A cor do perfil pinta a faixa de cima e o botão: dá para ver de relance em qual perfil você está.
  document.documentElement.style.setProperty('--profile', active.color);
  const label = profLabel(active);
  profNameEl.textContent = label;
  profBtn.querySelector('.prof-dot').style.background = active.color;
  profBtn.title = t('Perfil ativo: {name}. Clique para trocar ou criar perfis', { name: label });
  profBtn.setAttribute('aria-label', profBtn.title);
  if (!!state.profilesOpen !== profOpen) setProfOpenLocal(!!state.profilesOpen);
  if (profOpen) renderProfList();
}

function renderProfList() {
  const key = JSON.stringify([profList_, profActiveId, profConfirm]);
  if (key === profKey) return;
  profKey = key;
  profList.replaceChildren(
    ...profList_.map((p) => {
      const li = document.createElement('li');
      li.className = 'prof-item';

      const pick = document.createElement('button');
      pick.type = 'button';
      pick.className = 'prof-pick';
      const current = p.id === profActiveId;
      if (current) pick.setAttribute('aria-current', 'true');
      const dot = document.createElement('span');
      dot.className = 'prof-dot';
      dot.setAttribute('aria-hidden', 'true');
      dot.style.background = p.color;
      const name = document.createElement('span');
      name.className = 'prof-row-name';
      name.textContent = profLabel(p);
      pick.append(dot, name);
      if (current) {
        const mark = document.createElement('span');
        mark.className = 'prof-mark';
        mark.textContent = '✓';
        mark.setAttribute('aria-hidden', 'true');
        pick.append(mark);
      }
      pick.addEventListener('click', () => {
        window.evl.profileSwitch(p.id);
        setProfOpen(false);
      });
      li.append(pick);

      // O padrão ("Pessoal") não se apaga. Os outros: um clique muda para "Confirmar exclusão".
      if (p.id !== 'default') {
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'prof-del';
        const asking = profConfirm === p.id;
        del.textContent = asking ? t('Confirmar exclusão') : '×';
        del.title = t('Apagar perfil');
        del.setAttribute('aria-label', `${t('Apagar perfil')}: ${profLabel(p)}`);
        del.addEventListener('click', () => onDelete(p.id));
        li.append(del);
      }
      return li;
    })
  );
}

async function onDelete(id) {
  if (profConfirm !== id) {
    profConfirm = id;
    renderProfList();
    return;
  }
  profConfirm = null;
  const ok = await window.evl.profileDelete(id);
  if (!ok) showProfErr(t('Não foi possível apagar o perfil'));
  profKey = '';
}

function setProfOpenLocal(open) {
  profOpen = open;
  profPop.hidden = !open;
  profBtn.setAttribute('aria-expanded', String(open));
  if (open) {
    profConfirm = null;
    profKey = '';
    showProfErr('');
    renderProfList();
  }
}

// O painel cresce por cima da página (o main.js recalcula a altura da interface).
function setProfOpen(open) {
  window.evl.profilesPanel(open);
  setProfOpenLocal(open);
}

profBtn.addEventListener('click', () => setProfOpen(!profOpen));

profForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const r = await window.evl.profileCreate(profInput.value.trim());
  if (!r?.ok) {
    showProfErr(t(PROF_ERRORS[r?.error] ?? 'Não foi possível criar o perfil'));
    return;
  }
  profInput.value = '';
  setProfOpen(false); // a aba nova já é desse perfil
});

// Clicar fora (inclusive na área sobre a página) ou Esc fecha.
document.addEventListener('mousedown', (event) => {
  if (profOpen && !profPop.contains(event.target) && !profBtn.contains(event.target)) setProfOpen(false);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && profOpen) setProfOpen(false);
});
