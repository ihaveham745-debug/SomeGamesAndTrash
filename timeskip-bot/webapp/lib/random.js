// Честный случай: crypto.getRandomValues, без перекоса по модулю.

export function randInt(n) {
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf); while (buf[0] >= limit);
  return buf[0] % n;
}

export function shuffle(items) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Выбор по весам: [{ weight }, …] → элемент. */
export function weighted(items) {
  const total = items.reduce((s, x) => s + x.weight, 0);
  let r = randInt(total);
  for (const x of items) {
    if (r < x.weight) return x;
    r -= x.weight;
  }
  return items.at(-1);
}
