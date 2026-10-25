/** Floating-point geometry for illustrations only. No values here enter the .sim interpreter. */
export type Point = { x: number; y: number };
export type Circle = { center: Point; radius: number };
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const towards = (a: Point, b: Point, fraction: number): Point =>
  fraction === 1 ? { ...b } : { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction };

export function distinctPoints(points: Point[], tolerance: number): Point[] {
  const out: Point[] = [];
  for (const p of points) if (!out.some(q => distance(p, q) <= tolerance)) out.push(p);
  return out;
}

export function diameter(points: Point[]): number {
  let d = 0;
  for (const p of points) for (const q of points) d = Math.max(d, distance(p, q));
  return d;
}

/** Enumerating support sets of size at most three is adequate for these small previews. */
export function smallestCircle(points: Point[], tolerance: number): Circle {
  if (!points.length) throw new Error('An enclosing circle needs at least one point.');
  let best: Circle | undefined;
  const consider = (center: Point, radius: number) => {
    if ((!best || radius < best.radius) && points.every(p => distance(p, center) <= radius + tolerance)) best = { center, radius };
  };
  points.forEach(p => consider(p, 0));
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i], b = points[j];
      consider(towards(a, b, 0.5), distance(a, b) / 2);
      for (let k = j + 1; k < points.length; k++) {
        // Work relative to a to limit cancellation under translations.
        const bx = b.x - a.x, by = b.y - a.y;
        const cx = points[k].x - a.x, cy = points[k].y - a.y;
        const det = 2 * (bx * cy - by * cx);
        if (Math.abs(det) <= 1e-14 * Math.hypot(bx, by) * Math.hypot(cx, cy)) continue;
        const b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
        const center = { x: a.x + (cy * b2 - by * c2) / det, y: a.y + (bx * c2 - cx * b2) / det };
        consider(center, distance(a, center));
      }
    }
  }
  if (!best) throw new Error('Could not construct an enclosing circle at this numerical precision.');
  return best;
}

/** Section 5.1's exact ratios, compared approximately in this numerical preview. */
export const extremeRatios = [1 / 9, 1 / 8, 9 / 80, 10 / 81, 10 / 18, 9 / 16, 80 / 81];

export function distinguishedExtreme(points: Point[], tolerance: number): Point | undefined {
  if (points.length < 3) return undefined;
  let a = points[0], b = points[1], d = 0;
  for (const p of points) for (const q of points) {
    const gap = distance(p, q);
    if (gap > d) { a = p; b = q; d = gap; }
  }
  if (d <= tolerance) return undefined;
  if (!points.every(p => Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) <= tolerance * d)) return undefined;
  const candidates = [a, b].filter(p => {
    const nearest = Math.min(...points.filter(q => distance(p, q) > tolerance).map(q => distance(p, q)));
    return extremeRatios.some(r => Math.abs(nearest / d - r) <= tolerance / d);
  });
  return candidates.length === 1 ? candidates[0] : undefined;
}
