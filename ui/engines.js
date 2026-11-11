'use strict';
// ---------- motores de busca ----------
const eList = $('e-list');
const eForm = $('e-form');
const eName = $('e-name');
const eUrl = $('e-url');
const eError = $('e-error');
let engines = [];
let editingId = null; // null = adicionando um novo

function textButton(label, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'text-btn';
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

function showEngines(data) {
  if (!data) return;
  engines = data.engines;
  eList.replaceChildren(
    ...engines.map((e) => {
      const li = document.createElement('li');
      li.className = 'e-row';
      const pick = document.createElement('button');
      pick.type = 'button';
      pick.className = 'e-pick';
      pick.setAttribute('role', 'radio');
      pick.setAttribute('aria-checked', String(e.id === data.selected));
      const dot = document.createElement('span');
      dot.className = 'e-dot';
      dot.setAttribute('aria-hidden', 'true');
      const name = document.createElement('span');
      name.className = 'e-name';
      name.textContent = e.name;
      const url = document.createElement('span');
      url.className = 'e-url mono hint';
      url.textContent = e.url;
      pick.append(dot, name, url);
      pick.addEventListener('click', async () => showEngines(await window.evl.enginesSelect(e.id)));
      const del = textButton(t('Apagar'), async () => showEngines(await window.evl.enginesRemove(e.id)));
      del.disabled = engines.length <= 1; // sempre sobra um
      li.append(pick, textButton(t('Editar'), () => openEngineForm(e)), del);
      return li;
    })
  );
}

async function loadEngines() {
  showEngines(await window.evl.enginesList());
}

function openEngineForm(engine) {
  editingId = engine?.id ?? null;
  eName.value = engine?.name ?? '';
  eUrl.value = engine?.url ?? '';
  eError.hidden = true;
  eForm.hidden = false;
  eName.focus();
}

function closeEngineForm() {
  eForm.hidden = true;
  editingId = null;
}

$('e-add').addEventListener('click', () => openEngineForm(null));
$('e-cancel').addEventListener('click', closeEngineForm);
eForm.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeEngineForm();
});
eForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const r = await window.evl.enginesSave({ id: editingId, name: eName.value, url: eUrl.value });
  if (!r) return;
  if (!r.ok) {
    eError.textContent = r.error;
    eError.hidden = false;
    return;
  }
  showEngines(r);
  closeEngineForm();
});
