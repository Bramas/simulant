/**
 * What distinguishes each branch of a step from the others: the choices of its witness (parts
 * separated by "; ") that every branch makes alike are left out. In gathering-on-rings, every
 * activated agent's frame is part of the witness ("a0: as is; a1: as is; ...; crash [a0]"), and
 * usually only the crash differs.
 */
export function distinguishing(labels: string[]): string[] {
  const parts = labels.map(l => l.split('; ').filter(Boolean));
  const common = parts.length > 1 ? new Set(parts[0].filter(p => parts.every(ps => ps.includes(p)))) : new Set<string>();
  return parts.map(ps => ps.filter(p => !common.has(p)).join('; '));
}

export type WitnessChoice = { site: string; index: number; label: string };

/**
 * As `distinguishing`, from the steps' witnesses: of the choices that differ between the
 * branches, only those that did not take the first option (the default: "as is", "no crash",
 * "stays inactive") are named. A branch that differs only by first options is named by its one
 * differing choice, or "default choices".
 */
export function distinguishingChoices(witnesses: WitnessChoice[][]): string[] {
  const key = (c: WitnessChoice) => `${c.site}\u0000${c.label}`;
  const common = new Set(witnesses.length > 1 ? witnesses[0].map(key).filter(k => witnesses.every(w => w.some(c => key(c) === k))) : []);
  return witnesses.map(w => {
    const distinct = w.filter(c => !common.has(key(c)));
    const named = distinct.filter(c => c.index > 0);
    if (named.length) return named.map(c => c.label).join('; ');
    return distinct.length === 1 ? distinct[0].label : distinct.length ? 'default choices' : '';
  });
}
