// POST /api/remindTick — разослать напоминания, чьё время пришло.
// Его раз в 10 минут запускает GitHub Actions (.github/workflows/school-reminders.yml):
// своего расписания у платформы нет. Вызвать может кто угодно — вреда нет:
// отправится только то, что и так пора отправить, и каждое напоминание — один раз.

import { sendDueReminders } from '../lib/reminders.js';

export default async function () {
  return { sent: await sendDueReminders() };
}
