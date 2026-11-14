// Perfis: trocar, criar, apagar e abrir o painel (botão à esquerda da barra).
// A lista e as regras ficam em src/data/profiles_store.js; aqui só ligamos aos canais.

const { createProfile, removeProfile } = require('../data/profiles_store');

// ctx: { ipcMain, fromUi, getProfiles(), saveProfiles(list), getTabs, deleteData(id) }
//   saveProfiles: grava a lista nova e avisa a interface. deleteData: apaga cookies/cache/senhas do perfil.
function registerProfilesIpc({ ipcMain, fromUi, getProfiles, saveProfiles, getTabs, deleteData }) {
  const exists = (id) => getProfiles().some((p) => p.id === id);

  ipcMain.on('profile:switch', (event, id) => {
    if (fromUi(event) && typeof id === 'string' && exists(id)) getTabs()?.switchProfile(id);
  });

  ipcMain.handle('profile:create', (event, name) => {
    if (!fromUi(event) || typeof name !== 'string') return { ok: false, error: 'name' };
    const r = createProfile(getProfiles(), name);
    if (!r.ok) return r;
    saveProfiles(r.list);
    getTabs()?.switchProfile(r.profile.id); // já abre uma aba nova nele
    return { ok: true, id: r.profile.id };
  });

  // Apaga o perfil: fecha as abas dele e limpa os dados. O padrão nunca é apagado.
  ipcMain.handle('profile:delete', async (event, id) => {
    if (!fromUi(event) || typeof id !== 'string' || !exists(id)) return false;
    const next = removeProfile(getProfiles(), id);
    if (next.length === getProfiles().length) return false;
    getTabs()?.closeProfile(id);
    saveProfiles(next);
    await deleteData(id);
    return true;
  });

  ipcMain.on('profile:panel', (event, open) => {
    if (fromUi(event)) getTabs()?.setProfilesPanel(open === true);
  });
}

module.exports = { registerProfilesIpc };
