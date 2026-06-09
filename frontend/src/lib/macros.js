// Shared macro math for comidas (cooked batches) and marmita templates.
// Nutrition lives per-gram on produtos; a comida sums its produtos, and a comida
// with a yield (peso pronto) can be portioned by grams: macro/g = total / yield.

export function comidaTotals(c, produtos) {
  let cal = 0, prot = 0;
  for (const it of c.items || []) {
    const p = produtos.find(x => x.id === it.produtoId);
    if (p) { cal += p.caloriesPerGram * it.quantityGrams; prot += p.proteinPerGram * it.quantityGrams; }
  }
  return { cal, prot };
}

/** Per-gram macros of the cooked batch, or null when no yield_grams is set. */
export function comidaPerGram(c, produtos) {
  if (!c?.yieldGrams || c.yieldGrams <= 0) return null;
  const t = comidaTotals(c, produtos);
  return { cal: t.cal / c.yieldGrams, prot: t.prot / c.yieldGrams };
}

/**
 * Per-gram macros of an inline marmita group (ex: molho branco): sum the batch
 * produtos and divide by the estimated finished weight (groupYieldGrams). Falls
 * back to the sum of batch grams when no yield was given. Returns null if empty.
 */
export function groupPerGram(group, groupYieldGrams, produtos) {
  if (!group || !group.length) return null;
  let cal = 0, prot = 0, sumG = 0;
  for (const g of group) {
    const p = produtos.find(x => x.id === g.produtoId);
    if (p) { cal += p.caloriesPerGram * g.grams; prot += p.proteinPerGram * g.grams; }
    sumG += g.grams || 0;
  }
  const yld = groupYieldGrams > 0 ? groupYieldGrams : sumG;
  if (!yld) return null;
  return { cal: cal / yld, prot: prot / yld };
}

/**
 * Turn a template item ({produtoId|comidaId|group, quantity, unit}) into a meal_item
 * snapshot ({produtoId, comidaId, name, quantity, calories, protein, unit}).
 * Returns null if the referenced produto/comida is missing or can't be portioned.
 */
export function snapshotItem(ti, produtos, comidas) {
  if (ti.groupName && ti.group?.length) {
    const pg = groupPerGram(ti.group, ti.groupYieldGrams, produtos);
    if (!pg) return null;
    return {
      produtoId: null, comidaId: null, name: ti.groupName, quantity: ti.quantity,
      calories: Math.round(pg.cal * ti.quantity),
      protein: +(pg.prot * ti.quantity).toFixed(1), unit: "g",
    };
  }
  if (ti.produtoId) {
    const p = produtos.find(x => x.id === ti.produtoId);
    if (!p) return null;
    return {
      produtoId: p.id, comidaId: null, name: p.name, quantity: ti.quantity,
      calories: Math.round(p.caloriesPerGram * ti.quantity),
      protein: +(p.proteinPerGram * ti.quantity).toFixed(1), unit: "g",
    };
  }
  const c = comidas.find(x => x.id === ti.comidaId);
  if (!c) return null;
  if (ti.unit === "g") {
    const pg = comidaPerGram(c, produtos);
    if (!pg) return null;
    return {
      produtoId: null, comidaId: c.id, name: c.name, quantity: ti.quantity,
      calories: Math.round(pg.cal * ti.quantity),
      protein: +(pg.prot * ti.quantity).toFixed(1), unit: "g",
    };
  }
  const t = comidaTotals(c, produtos);
  return {
    produtoId: null, comidaId: c.id, name: c.name, quantity: ti.quantity,
    calories: Math.round(t.cal * ti.quantity),
    protein: +(t.prot * ti.quantity).toFixed(1), unit: "porcao",
  };
}

const pad = (n) => String(n).padStart(2, "0");
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * Absolute ISO dates for the coming 7 days whose weekday is in `weekdaySet`
 * (0=Sun..6=Sat), starting today inclusive. Frontend resolves dates so the
 * backend stays dumb (receives an explicit list).
 */
export function comingWeekDates(weekdaySet) {
  const out = [];
  const base = new Date(); base.setHours(0, 0, 0, 0);
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    if (weekdaySet.has(d.getDay())) out.push(toISO(d));
  }
  return out;
}
