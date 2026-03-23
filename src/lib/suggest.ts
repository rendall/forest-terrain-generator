function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dist: number[][] = Array.from({ length: rows }, () =>
    Array<number>(cols).fill(0)
  );

  for (let i = 0; i < rows; i += 1) {
    dist[i][0] = i;
  }
  for (let j = 0; j < cols; j += 1) {
    dist[0][j] = j;
  }

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dist[i][j] = Math.min(
        dist[i - 1][j] + 1,
        dist[i][j - 1] + 1,
        dist[i - 1][j - 1] + cost
      );
    }
  }

  return dist[a.length][b.length];
}

export function suggestClosest(
  value: string,
  candidates: readonly string[],
  maxDistance = 3
): string | undefined {
  let bestCandidate: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const distance = levenshteinDistance(value, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestCandidate = candidate;
    }
  }

  if (bestDistance <= maxDistance) {
    return bestCandidate;
  }
  return undefined;
}
