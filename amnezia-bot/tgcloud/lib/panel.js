// lib/panel — клиент веб-панели amnezia-wg-easy (https://github.com/spcfox/amnezia-wg-easy,
// https://github.com/w0rng/amnezia-wg-easy). Без 'sdk': fetch передаём снаружи — так проверяется тестами.
//
// API панели: POST /api/session {password} → cookie; дальше с этой cookie:
//   GET    /api/wireguard/client                    — список клиентов [{ id, name, createdAt, … }]
//   POST   /api/wireguard/client {name}             — новый клиент (id в ответе нет — ищем по имени)
//   DELETE /api/wireguard/client/:id                — удалить
//   GET    /api/wireguard/client/:id/configuration  — текст конфига (.conf для AmneziaVPN / AmneziaWG)

export class PanelError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // 'offline' | 'password' | 'missing' | 'http'
  }
}

/** 'a=1; Path=/; HttpOnly, b=2; Path=/' → 'a=1; b=2' */
export function cookieHeader(setCookie) {
  if (!setCookie) return '';
  return setCookie.split(/,(?=\s*[^;,=\s]+=)/).map((c) => c.split(';')[0].trim()).filter(Boolean).join('; ');
}

export function normalizeUrl(url) {
  return String(url ?? '').trim().replace(/\/+$/, '');
}

export function panelClient({ url, password }, fetch) {
  const base = normalizeUrl(url);
  let cookie = null;

  async function request(method, path, body, headers = {}) {
    try {
      return await fetch(base + path, {
        method,
        headers: { ...headers, ...(body !== undefined && { 'Content-Type': 'application/json' }) },
        ...(body !== undefined && { body: JSON.stringify(body) }),
      });
    } catch (err) {
      throw new PanelError('offline', `не достучался до панели ${base}: ${err?.message ?? err}`);
    }
  }

  async function login() {
    cookie = '';
    if (!password) return;
    const res = await request('POST', '/api/session', { password, remember: true });
    if (res.status === 401) throw new PanelError('password', 'панель не приняла пароль');
    if (!res.ok) throw new PanelError('http', `панель ответила ${res.status} на вход`);
    cookie = cookieHeader(res.headers.get('set-cookie'));
  }

  async function call(method, path, body) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (cookie === null) await login();
      const res = await request(method, path, body, cookie ? { Cookie: cookie } : {});
      if (res.status === 401 && attempt === 0) {
        cookie = null; // сессия кончилась (панель перезапускали) — войдём заново
        continue;
      }
      if (res.status === 404) throw new PanelError('missing', 'на сервере такого нет');
      if (!res.ok) throw new PanelError('http', `панель ответила ${res.status}`);
      return res;
    }
    throw new PanelError('password', 'панель не пускает');
  }

  const clients = async () => {
    const list = await (await call('GET', '/api/wireguard/client')).json();
    if (!Array.isArray(list)) throw new PanelError('http', 'панель ответила не тем — это точно amnezia-wg-easy?');
    return list;
  };

  return {
    clients,
    /** Создать клиента → { id, name }. Имя должно быть уникальным: по нему находим id. */
    async create(name) {
      await call('POST', '/api/wireguard/client', { name });
      const found = (await clients()).filter((c) => c.name === name)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
      if (!found) throw new PanelError('http', 'клиент создан, но в списке его нет');
      return { id: String(found.id), name: found.name };
    },
    async remove(id) {
      try {
        await call('DELETE', `/api/wireguard/client/${encodeURIComponent(id)}`);
      } catch (err) {
        if (err.code !== 'missing') throw err; // уже удалён — это нам и нужно
      }
    },
    /** Текст конфига; PanelError 'missing' — клиента на сервере нет. */
    async config(id) {
      let res;
      try {
        res = await call('GET', `/api/wireguard/client/${encodeURIComponent(id)}/configuration`);
      } catch (err) {
        // на удалённого клиента панель отвечает то 404, то 500 — сверяемся со списком
        if (err.code === 'http' && !(await clients()).some((c) => String(c.id) === String(id))) throw new PanelError('missing', 'на сервере такого нет');
        throw err;
      }
      const text = await res.text();
      if (!/\[Interface\]/.test(text)) throw new PanelError('http', 'панель вернула не конфиг');
      return text;
    },
  };
}
