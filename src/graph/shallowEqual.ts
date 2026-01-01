export function shallowEqualNumberRecord(
  a: Record<string, number>,
  b: Record<string, number>,
  eps = 1e-4
): boolean {
  if (a === b) return true;
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    const av = a[k];
    const bv = b[k];
    if (bv == null) return false;
    if (Math.abs((av ?? 0) - (bv ?? 0)) > eps) return false;
  }
  return true;
}

export function shallowEqualRecordByValueRef(
  a: Record<string, unknown>,
  b: Record<string, unknown>
): boolean {
  if (a === b) return true;
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}
