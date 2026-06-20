// store.js
// Простое хранилище записей блога: данные лежат в файле data/entries.json
// в этом же репозитории на GitHub. Чтение идёт через raw.githubusercontent.com
// (без авторизации, быстро), а запись — через GitHub Contents API
// с персональным токеном, который хранится только в localStorage браузера.

const Store = (() => {
  const CONFIG_KEY = "blog_config_v1";

  function getConfig() {
    try {
      return JSON.parse(localStorage.getItem(CONFIG_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function setConfig(cfg) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  }

  function isConfigured() {
    const c = getConfig();
    return !!(c.owner && c.repo && c.token);
  }

  function clean(v) {
    return (v || "").trim().replace(/^\/+|\/+$/g, "");
  }

  function rawUrl(owner, repo, branch) {
    return `https://raw.githubusercontent.com/${clean(owner)}/${clean(repo)}/${clean(branch)}/data/entries.json?t=${Date.now()}`;
  }

  function apiUrl(owner, repo) {
    return `https://api.github.com/repos/${clean(owner)}/${clean(repo)}/contents/data/entries.json`;
  }

  async function fetchEntries() {
    const cfg = getConfig();
    if (!cfg.owner || !cfg.repo) return [];
    const branch = cfg.branch || "main";
    try {
      const res = await fetch(rawUrl(cfg.owner, cfg.repo, branch), { cache: "no-store" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  }

  async function getFileSha() {
    const cfg = getConfig();
    const res = await fetch(apiUrl(cfg.owner, cfg.repo) + `?ref=${clean(cfg.branch) || "main"}`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error("GitHub отклонил токен (код " + res.status + "). Проверь, что токен скопирован полностью и не истёк.");
      }
      throw new Error("Не удалось получить файл данных (код " + res.status + "). Проверь имя пользователя «" + clean(cfg.owner) + "» и репозиторий «" + clean(cfg.repo) + "» в настройках.");
    }
    const json = await res.json();
    return json.sha;
  }

  function b64EncodeUnicode(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }

  async function saveEntries(entries) {
    const cfg = getConfig();
    if (!cfg.owner || !cfg.repo || !cfg.token) {
      throw new Error("Не настроено подключение к GitHub. Зайди в Настройки.");
    }
    const sha = await getFileSha();
    const content = b64EncodeUnicode(JSON.stringify(entries, null, 2));
    const body = {
      message: sha ? "Обновление записей блога" : "Создание файла записей блога",
      content,
      branch: cfg.branch || "main",
    };
    if (sha) body.sha = sha;

    const res = await fetch(apiUrl(cfg.owner, cfg.repo), {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 404) {
        throw new Error("GitHub не нашёл репозиторий «" + clean(cfg.owner) + "/" + clean(cfg.repo) + "». Проверь имя пользователя и название репозитория в настройках — без опечаток и без слова github.com.");
      }
      if (res.status === 401 || res.status === 403) {
        throw new Error("GitHub отклонил токен. Проверь, что он скопирован полностью и имеет права на запись (repo).");
      }
      throw new Error("Ошибка сохранения: " + (err.message || res.status));
    }
    return true;
  }

  async function addEntry(entry) {
    const entries = await fetchEntries();
    entries.unshift(entry);
    await saveEntries(entries);
    return entries;
  }

  async function deleteEntry(id) {
    const entries = await fetchEntries();
    const filtered = entries.filter((e) => e.id !== id);
    await saveEntries(filtered);
    return filtered;
  }

  function makeId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  return {
    getConfig,
    setConfig,
    isConfigured,
    fetchEntries,
    saveEntries,
    addEntry,
    deleteEntry,
    makeId,
  };
})();
