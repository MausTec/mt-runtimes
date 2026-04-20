import { describe, it, expect } from "vitest";
import {
  parseVersion,
  parseConstraint,
  matchesConstraint,
  resolveVersion,
  satisfies,
  compareSemVer,
} from "../src/version.js";

describe("parseVersion", () => {
  it("parses 3-segment version", () => {
    const v = parseVersion("2.0.1");
    expect(v).toEqual({ major: 2, minor: 0, patch: 1, segments: 3 });
  });

  it("parses 2-segment version", () => {
    const v = parseVersion("2.0");
    expect(v).toEqual({ major: 2, minor: 0, patch: 0, segments: 2 });
  });

  it("rejects 1-segment version", () => {
    expect(() => parseVersion("2")).toThrow("Invalid version format");
  });

  it("rejects non-numeric", () => {
    expect(() => parseVersion("2.x.0")).toThrow("non-integer");
  });
});

describe("parseConstraint", () => {
  it("parses ~> with 2 segments", () => {
    const c = parseConstraint("~> 2.0");
    expect(c.op).toBe("~>");
    expect(c.version).toEqual({ major: 2, minor: 0, patch: 0, segments: 2 });
  });

  it("parses ~> with 3 segments", () => {
    const c = parseConstraint("~> 2.0.1");
    expect(c.op).toBe("~>");
    expect(c.version).toEqual({ major: 2, minor: 0, patch: 1, segments: 3 });
  });

  it("parses == constraint", () => {
    const c = parseConstraint("== 1.2.3");
    expect(c.op).toBe("==");
    expect(c.version.major).toBe(1);
  });

  it("parses >= constraint", () => {
    const c = parseConstraint(">= 1.0");
    expect(c.op).toBe(">=");
  });

  it("bare version becomes ==", () => {
    const c = parseConstraint("2.0.1");
    expect(c.op).toBe("==");
    expect(c.version).toEqual({ major: 2, minor: 0, patch: 1, segments: 3 });
  });
});

describe("satisfies / matchesConstraint", () => {
  describe("~> operator", () => {
    it("~> 2.0 matches 2.0.0", () => {
      expect(matchesConstraint("2.0.0", "~> 2.0")).toBe(true);
    });

    it("~> 2.0 matches 2.5.0", () => {
      expect(matchesConstraint("2.5.0", "~> 2.0")).toBe(true);
    });

    it("~> 2.0 matches 2.99.99", () => {
      expect(matchesConstraint("2.99.99", "~> 2.0")).toBe(true);
    });

    it("~> 2.0 does NOT match 3.0.0", () => {
      expect(matchesConstraint("3.0.0", "~> 2.0")).toBe(false);
    });

    it("~> 2.0 does NOT match 1.9.9", () => {
      expect(matchesConstraint("1.9.9", "~> 2.0")).toBe(false);
    });

    it("~> 2.1 matches 2.1.0", () => {
      expect(matchesConstraint("2.1.0", "~> 2.1")).toBe(true);
    });

    it("~> 2.1 matches 2.5.0 (same major)", () => {
      expect(matchesConstraint("2.5.0", "~> 2.1")).toBe(true);
    });

    it("~> 2.1 does NOT match 2.0.9 (below floor)", () => {
      expect(matchesConstraint("2.0.9", "~> 2.1")).toBe(false);
    });

    it("~> 2.0.1 matches 2.0.1", () => {
      expect(matchesConstraint("2.0.1", "~> 2.0.1")).toBe(true);
    });

    it("~> 2.0.1 matches 2.0.5", () => {
      expect(matchesConstraint("2.0.5", "~> 2.0.1")).toBe(true);
    });

    it("~> 2.0.1 does NOT match 2.1.0 (minor bumped)", () => {
      expect(matchesConstraint("2.1.0", "~> 2.0.1")).toBe(false);
    });

    it("~> 2.0.1 does NOT match 2.0.0 (below floor)", () => {
      expect(matchesConstraint("2.0.0", "~> 2.0.1")).toBe(false);
    });
  });

  describe("== operator", () => {
    it("== 2.0.1 matches exact", () => {
      expect(matchesConstraint("2.0.1", "== 2.0.1")).toBe(true);
    });

    it("== 2.0.1 does NOT match 2.0.2", () => {
      expect(matchesConstraint("2.0.2", "== 2.0.1")).toBe(false);
    });
  });

  describe(">= operator", () => {
    it(">= 2.0 matches 2.0.0", () => {
      expect(matchesConstraint("2.0.0", ">= 2.0")).toBe(true);
    });

    it(">= 2.0 matches 3.0.0", () => {
      expect(matchesConstraint("3.0.0", ">= 2.0")).toBe(true);
    });

    it(">= 2.0 does NOT match 1.9.9", () => {
      expect(matchesConstraint("1.9.9", ">= 2.0")).toBe(false);
    });
  });

  describe("< operator", () => {
    it("< 3.0 does NOT match 3.0.0", () => {
      expect(matchesConstraint("3.0.0", "< 3.0")).toBe(false);
    });

    it("< 3.0 matches 2.9.9", () => {
      expect(matchesConstraint("2.9.9", "< 3.0")).toBe(true);
    });
  });
});

describe("compareSemVer", () => {
  it("equal versions return 0", () => {
    expect(compareSemVer(parseVersion("1.2.3"), parseVersion("1.2.3"))).toBe(0);
  });

  it("higher major is positive", () => {
    expect(compareSemVer(parseVersion("2.0.0"), parseVersion("1.0.0"))).toBeGreaterThan(0);
  });

  it("higher minor is positive", () => {
    expect(compareSemVer(parseVersion("1.2.0"), parseVersion("1.1.0"))).toBeGreaterThan(0);
  });

  it("higher patch is positive", () => {
    expect(compareSemVer(parseVersion("1.0.2"), parseVersion("1.0.1"))).toBeGreaterThan(0);
  });
});

describe("resolveVersion", () => {
  const versions = [
    { version: "1.0.0", status: "eol" },
    { version: "1.1.0", status: "supported" },
    { version: "2.0.0", status: "supported" },
    { version: "2.0.1", status: "current" },
  ];

  it("null constraint picks the 'current' entry", () => {
    const result = resolveVersion(versions, null);
    expect(result?.version).toBe("2.0.1");
  });

  it("~> 1.0 picks highest 1.x (non-eol preferred)", () => {
    const result = resolveVersion(versions, "~> 1.0");
    expect(result?.version).toBe("1.1.0");
  });

  it("~> 2.0 picks 2.0.1", () => {
    const result = resolveVersion(versions, "~> 2.0");
    expect(result?.version).toBe("2.0.1");
  });

  it("== 1.0.0 matches even eol", () => {
    const result = resolveVersion(versions, "== 1.0.0");
    expect(result?.version).toBe("1.0.0");
  });

  it(">= 3.0 returns null (no match)", () => {
    const result = resolveVersion(versions, ">= 3.0");
    expect(result).toBeNull();
  });

  it("empty version list returns null", () => {
    const result = resolveVersion([], null);
    expect(result).toBeNull();
  });
});
