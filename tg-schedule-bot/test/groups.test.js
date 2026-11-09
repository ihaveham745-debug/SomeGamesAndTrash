import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const LIB = new URL('../tgcloud/lib/', import.meta.url);
const GROUPS = readdirSync(new URL('groups/', LIB)).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3));

/** Копия lib/ с timetable.js на нужную группу — как делает scripts/deploy.mjs. */
async function libFor(group) {
  const dir = mkdtempSync(join(tmpdir(), `lib-${group}-`));
  cpSync(LIB, dir, { recursive: true });
  writeFileSync(join(dir, 'timetable.js'), `export * from './groups/${group}.js';\n`);
  const load = (name) => import(pathToFileURL(join(dir, name)).href);
  return { schedule: await load('schedule.js'), bot: await load('bot.js'), homework: await load('homework.js') };
}

test('файлы групп корректны и у каждой свой бот', async () => {
  assert.deepEqual(GROUPS.sort(), ['b-eo-26', 'b-tmms-26']);
  const apps = new Set();
  for (const id of GROUPS) {
    const g = await import(new URL(`groups/${id}.js`, LIB));
    assert.match(g.GROUP, /^Б-[А-Я]+-\d\d$/, id);
    assert.match(g.APP_ID, /^app\d+$/, id);
    assert.equal(g.MINI_APP_URL, `https://${g.APP_ID}.tgcloud.ai/`, id);
    apps.add(g.APP_ID);
    for (const [day, pairs] of Object.entries(g.TIMETABLE)) {
      for (const p of pairs) {
        const where = `${id} день ${day}, ${p.n} пара ${p.subject}`;
        assert.ok(g.BELLS[p.n], `нет звонков: ${where}`);
        assert.ok([undefined, 'odd', 'even'].includes(p.week), where);
        assert.ok(p.subject && p.teacher && p.room, where);
      }
      // в одной паре в одну и ту же неделю — не больше одного занятия
      const slots = pairs.flatMap((p) => (p.week ? [`${p.n}${p.week}`] : [`${p.n}odd`, `${p.n}even`]));
      assert.equal(new Set(slots).size, slots.length, `${id}: накладка в день ${day}`);
    }
  }
  assert.equal(apps.size, GROUPS.length);
});

test('Б-ТММС-26: расписание по чётности и тексты бота', async () => {
  const { schedule, bot, homework } = await libFor('b-tmms-26');
  const day = (iso) => schedule.pairsFor(schedule.parseDate(iso)).map((p) => `${p.n} ${p.subject} ${p.type ?? ''}`.trim());

  // пн 12.10 — нечётная: история; пн 19.10 — чётная: физика и БЖД
  assert.deepEqual(day('2026-10-12'), [
    '1 Введение в сквозные цифровые технологии (подгр. 1) лаб.',
    '2 История практика',
  ]);
  assert.deepEqual(day('2026-10-19'), [
    '1 Введение в сквозные цифровые технологии (подгр. 1) лаб.',
    '2 Физика лекция',
    '3 Безопасность жизнедеятельности практика',
  ]);
  // чт: русский — лекция по нечётным, практика по чётным
  assert.ok(day('2026-10-15').includes('2 Русский язык и культура речи лекция'));
  assert.ok(day('2026-10-22').includes('2 Русский язык и культура речи практика'));
  // ср по чётным начинается с 3-й пары
  assert.equal(day('2026-10-21')[0], '3 Высшая математика практика');
  assert.equal(day('2026-10-18').length, 0);

  const NOW = Date.UTC(2026, 9, 14, 1, 10); // ср 14.10 10:10
  const start = await bot.replyTo({ text: '/start', chat: { type: 'private' } }, NOW);
  assert.match(start.text, /бот расписания группы Б-ТММС-26/);
  assert.match(bot.DESCRIPTION, /Б-ТММС-26/);
  assert.equal(bot.MENU_BUTTON.web_app.url, 'https://app8622906808.tgcloud.ai/');
  const today = await bot.replyTo({ text: '/today', chat: { type: 'private' } }, NOW);
  assert.match(today.text, /Высшая математика/);
  assert.ok(!today.text.includes('Математика</b> · <i>лекция'));

  // предметы для /dz — свои, без подгрупп
  assert.ok(homework.SUBJECTS.includes('Безопасность жизнедеятельности'));
  assert.ok(homework.SUBJECTS.includes('Введение в сквозные цифровые технологии'));
  assert.ok(!homework.SUBJECTS.some((s) => s.includes('подгр')));
  assert.equal(homework.findSubject('бжд').subject, 'Безопасность жизнедеятельности');
  assert.equal(homework.findSubject('вышмат').subject, 'Высшая математика');
  assert.equal(homework.findSubject('мат').subject, 'Высшая математика');
  assert.equal(homework.findSubject('кур').subject, 'Кураторский час');
});
