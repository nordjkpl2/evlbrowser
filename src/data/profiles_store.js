// Perfis: cada um tem cookies, logins, sessões e senhas próprios (pra separar trabalho de casa etc).
// Aqui fica só a lista (id, nome, cor) e as regras dela. Quem usa a sessão e o cofre é o main.js.
//
// O perfil "default" é o que já existia antes dos perfis: os dados dele continuam nos mesmos arquivos.

const DEFAULT_ID = 'default';
const COLORS = ['#ffb429', '#4f9dff', '#34c759', '#ff6b6b', '#b07cff', '#2ec4b6', '#ff8fab', '#8d99ae'];
const NAME_MAX = 30;
const MAX_PROFILES = 12;

const defaultProfile = () => ({ id: DEFAULT_ID, name: 'Pessoal', color: COLORS[0] });

// Nome válido: texto sem espaços sobrando, de 1 a 30 caracteres.
function cleanName(name) {
  return String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

// Lista salva (settings.json) -> lista segura. Sempre tem o perfil padrão primeiro.
function normalizeProfiles(saved) {
  const list = [defaultProfile()];
  const seen = new Set([DEFAULT_ID]);
  for (const p of Array.isArray(saved) ? saved : []) {
    if (!p || typeof p !== 'object' || typeof p.id !== 'string' || seen.has(p.id)) continue;
    if (!/^[a-z0-9]{1,24}$/.test(p.id)) continue;
    const name = cleanName(p.name);
    if (!name) continue;
    seen.add(p.id);
    list.push({ id: p.id, name, color: /^#[0-9a-f]{6}$/i.test(p.color) ? p.color.toLowerCase() : COLORS[list.length % COLORS.length] });
    if (list.length >= MAX_PROFILES) break;
  }
  return list;
}

// Novo perfil no fim da lista. Devolve { ok, list, profile } ou { ok: false, error }.
function createProfile(list, name, makeId = () => Math.random().toString(36).slice(2, 10)) {
  const clean = cleanName(name);
  if (!clean) return { ok: false, error: 'name' };
  if (list.length >= MAX_PROFILES) return { ok: false, error: 'limit' };
  let id = '';
  do id = `p${makeId()}`.replace(/[^a-z0-9]/g, '').slice(0, 24); // único, só letras/números (vai no nome da partição)
  while (!id || id === DEFAULT_ID || list.some((p) => p.id === id));
  const profile = { id, name: clean, color: COLORS[list.length % COLORS.length] };
  return { ok: true, list: [...list, profile], profile };
}

// Tira um perfil da lista. O padrão nunca sai. Devolve a lista nova (ou a mesma, se não der).
function removeProfile(list, id) {
  if (id === DEFAULT_ID || !list.some((p) => p.id === id)) return list;
  return list.filter((p) => p.id !== id);
}

// Nome da partição do Electron para o perfil (o padrão usa a sessão já existente).
const partitionOf = (id) => (id === DEFAULT_ID ? null : `persist:evl-${id}`);

// Nome do arquivo do cofre de senhas (o padrão mantém passwords.json).
const vaultFileOf = (id) => (id === DEFAULT_ID ? 'passwords.json' : `passwords-${id}.json`);

module.exports = { DEFAULT_ID, COLORS, NAME_MAX, MAX_PROFILES, normalizeProfiles, createProfile, removeProfile, partitionOf, vaultFileOf, cleanName };
