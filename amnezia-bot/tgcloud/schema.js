// schema — таблицы базы данных (именованные экспорты).

import { integer, sql, table, text, uniqueIndex } from 'sdk/db';

// Настройки: 'owner' — Telegram id владельца (первый, кто нажал /start),
// 'panel' — { url, password } панели amnezia-wg-easy. Пароль хранится только здесь, не в коде.
export const settings = table('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }),
});

// Семья: кто пользуется ботом. status: 'ok' — пустили, 'pending' — ждёт ответа владельца.
export const members = table('members', {
  userId: integer('user_id').primaryKey(),
  name: text('name').notNull(),
  username: text('username'),
  status: text('status').notNull(),
  created: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// Ключи: у человека по одному на устройство (device — см. DEVICES в lib/app.js).
// clientId — id клиента в панели amnezia-wg-easy.
export const vpnKeys = table('vpn_keys', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  device: text('device').notNull(),
  clientId: text('client_id').notNull(),
  clientName: text('client_name'),
  created: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (t) => ({
  userDeviceIdx: uniqueIndex('idx_vpn_keys_user_device').on(t.userId, t.device),
}));
