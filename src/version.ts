export interface SemanticVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: readonly string[];
}

export const minimumServerVersion = "0.0.43";

export function parseSemanticVersion(value: string): SemanticVersion | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
    value.trim(),
  );
  if (match === null) {
    return undefined;
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (![major, minor, patch].every(Number.isSafeInteger)) {
    return undefined;
  }

  return {
    major,
    minor,
    patch,
    prerelease: match[4]?.split(".") ?? [],
  };
}

export function parseShuckVersion(output: string): string | undefined {
  const match = /(?:^|\s)shuck(?:-cli)?\s+v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/i.exec(output);
  return match?.[1];
}

export function compareSemanticVersions(left: SemanticVersion, right: SemanticVersion): number {
  for (const key of ["major", "minor", "patch"] as const) {
    const difference = left[key] - right[key];
    if (difference !== 0) {
      return Math.sign(difference);
    }
  }

  if (left.prerelease.length === 0 || right.prerelease.length === 0) {
    return left.prerelease.length === right.prerelease.length
      ? 0
      : left.prerelease.length === 0
        ? 1
        : -1;
  }

  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left.prerelease[index];
    const rightPart = right.prerelease[index];
    if (leftPart === undefined || rightPart === undefined) {
      return leftPart === rightPart ? 0 : leftPart === undefined ? -1 : 1;
    }
    if (leftPart === rightPart) {
      continue;
    }

    const leftNumber = /^\d+$/.test(leftPart) ? Number(leftPart) : undefined;
    const rightNumber = /^\d+$/.test(rightPart) ? Number(rightPart) : undefined;
    if (leftNumber !== undefined && rightNumber !== undefined) {
      return Math.sign(leftNumber - rightNumber);
    }
    if (leftNumber !== undefined || rightNumber !== undefined) {
      return leftNumber !== undefined ? -1 : 1;
    }
    return leftPart < rightPart ? -1 : 1;
  }

  return 0;
}

export function isVersionAtLeast(version: string, minimum: string): boolean | undefined {
  const parsedVersion = parseSemanticVersion(version);
  const parsedMinimum = parseSemanticVersion(minimum);
  if (parsedVersion === undefined || parsedMinimum === undefined) {
    return undefined;
  }
  return compareSemanticVersions(parsedVersion, parsedMinimum) >= 0;
}
