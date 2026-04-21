/**
 * Elixir hex-style version constraint matching.
 *
 * Supported operators:
 *   ~> 2.0     >= 2.0.0 and < 3.0.0   (major-locked)
 *   ~> 2.0.1   >= 2.0.1 and < 2.1.0   (minor-locked)
 *   == 2.0.1   exact match
 *   >= 2.0     floor only
 *   > 2.0      strict floor
 *   <= 2.0     ceiling only
 *   < 2.0      strict ceiling
 *
 * Bare version string without operator is treated as == (exact match).
 */

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  /** Number of segments originally specified (2 for "2.0", 3 for "2.0.1") */
  segments: 2 | 3;
}

export interface ParsedConstraint {
  op: "~>" | "==" | ">=" | ">" | "<=" | "<";
  version: SemVer;
}

/**
 * Parse a version string like "2.0" or "2.0.1" into components.
 * Two-segment versions have patch = 0 but segments = 2.
 */
export function parseVersion(version: string): SemVer {
  const parts = version.trim().split(".");

  if (parts.length < 2 || parts.length > 3) {
    throw new Error(`Invalid version format: "${version}" (expected MAJOR.MINOR or MAJOR.MINOR.PATCH)`);
  }

  const major = Number(parts[0]);
  const minor = Number(parts[1]);
  const patch = parts.length === 3 ? Number(parts[2]) : 0;

  if (!Number.isInteger(major) || !Number.isInteger(minor) || !Number.isInteger(patch)) {
    throw new Error(`Invalid version format: "${version}" (non-integer component)`);
  }

  return { major, minor, patch, segments: parts.length as 2 | 3 };
}

/**
 * Parse a constraint string like "~> 2.0" or ">= 2.0.1".
 * A bare version with no operator is treated as "==".
 */
export function parseConstraint(raw: string): ParsedConstraint {
  const trimmed = raw.trim();
  const match = /^(~>|==|>=|>|<=|<)\s+(.+)$/.exec(trimmed);

  if (match) {
    return { op: match[1] as ParsedConstraint["op"], version: parseVersion(match[2]!) };
  }

  // Bare version — exact match
  return { op: "==", version: parseVersion(trimmed) };
}

/**
 * Compare two SemVer values. Returns negative if a < b, 0 if equal, positive if a > b.
 */
export function compareSemVer(a: SemVer, b: SemVer): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

/**
 * Test whether a concrete version satisfies a parsed constraint.
 */
export function satisfies(version: SemVer, constraint: ParsedConstraint): boolean {
  const cmp = compareSemVer(version, constraint.version);

  switch (constraint.op) {
    case "==":
      return cmp === 0;
    case ">=":
      return cmp >= 0;
    case ">":
      return cmp > 0;
    case "<=":
      return cmp <= 0;
    case "<":
      return cmp < 0;

    case "~>": {
      // Must be >= the specified version
      if (cmp < 0) return false;

      // Upper bound depends on how many segments were specified:
      // 2-segment ("~> 2.0"): bump major -> < 3.0.0
      // 3-segment ("~> 2.0.1"): bump minor -> < 2.1.0
      if (constraint.version.segments === 2) {
        return version.major === constraint.version.major;
      } else {
        return (
          version.major === constraint.version.major &&
          version.minor === constraint.version.minor
        );
      }
    }
  }
}

/**
 * Test whether a version string satisfies a constraint string.
 */
export function matchesConstraint(version: string, constraint: string): boolean {
  return satisfies(parseVersion(version), parseConstraint(constraint));
}

/**
 * Given a list of version entries and a constraint string, find the highest
 * version that satisfies the constraint. Excludes "eol" versions unless they
 * are the only match.
 *
 * Returns null if no version matches.
 */
export function resolveVersion(
  versions: readonly { version: string; status: string }[],
  constraint: string | null,
): { version: string; status: string } | null {
  if (versions.length === 0) return null;

  // No constraint: pick the entry marked "current", or highest version
  if (constraint === null) {
    const current = versions.find((v) => v.status === "current");
    if (current) return current;

    // Fall back to the highest non-eol version
    return pickHighest(versions) ?? null;
  }

  const parsed = parseConstraint(constraint);

  // Filter to matching versions, prefer non-eol
  const matching = versions.filter((v) => satisfies(parseVersion(v.version), parsed));
  if (matching.length === 0) return null;

  return pickHighest(matching) ?? null;
}

/** Pick the highest version from a list, preferring non-eol. */
function pickHighest(
  entries: readonly { version: string; status: string }[],
): { version: string; status: string } | undefined {
  const nonEol = entries.filter((v) => v.status !== "eol");
  const pool = nonEol.length > 0 ? nonEol : entries;

  let best: { version: string; status: string } | undefined;
  let bestParsed: SemVer | undefined;

  for (const entry of pool) {
    const parsed = parseVersion(entry.version);
    
    if (!best || !bestParsed || compareSemVer(parsed, bestParsed) > 0) {
      best = entry;
      bestParsed = parsed;
    }
  }

  return best;
}
