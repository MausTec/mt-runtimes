import { describe, it, expect } from "vitest";
import {
  resolveRuntimeBundle,
  parsePlatformEntry,
  intersectApis,
  resolveAlias,
  allAliases,
  ResolutionError,
} from "../src/resolver.js";
import type { HostFunctionDescriptor, EventDescriptor } from "../src/types.js";

// ---------------------------------------------------------------------------
// parsePlatformEntry
// ---------------------------------------------------------------------------

describe("parsePlatformEntry", () => {
  it("parses family with constraint", () => {
    const entry = parsePlatformEntry("@eom ~> 2.0");
    expect(entry).toEqual({
      raw: "@eom ~> 2.0",
      identifier: "@eom",
      constraint: "~> 2.0",
      isFamily: true,
    });
  });

  it("parses SKU with constraint", () => {
    const entry = parsePlatformEntry("eom3k == 2.0.1");
    expect(entry).toEqual({
      raw: "eom3k == 2.0.1",
      identifier: "eom3k",
      constraint: "== 2.0.1",
      isFamily: false,
    });
  });

  it("parses family without constraint", () => {
    const entry = parsePlatformEntry("@eom");
    expect(entry).toEqual({
      raw: "@eom",
      identifier: "@eom",
      constraint: null,
      isFamily: true,
    });
  });

  it("parses @all", () => {
    const entry = parsePlatformEntry("@all");
    expect(entry.identifier).toBe("@all");
    expect(entry.isFamily).toBe(true);
    expect(entry.constraint).toBeNull();
  });

  it("parses SKU without constraint", () => {
    const entry = parsePlatformEntry("eom3k");
    expect(entry.isFamily).toBe(false);
    expect(entry.constraint).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveAlias
// ---------------------------------------------------------------------------

describe("resolveAlias", () => {
  it("resolves @eom to edge-o-matic family", () => {
    const alias = resolveAlias("@eom");
    expect(alias).not.toBeNull();
    expect(alias!.product).toBe("edge-o-matic");
    expect(alias!.skus).toContain("EOM3K");
  });

  it("resolves @mercury to mercury family", () => {
    const alias = resolveAlias("@mercury");
    expect(alias).not.toBeNull();
    expect(alias!.product).toBe("mercury");
  });

  it("returns null for unknown alias", () => {
    expect(resolveAlias("@nonexistent")).toBeNull();
  });
});

describe("allAliases", () => {
  it("lists known aliases", () => {
    const aliases = allAliases();
    expect(aliases).toContain("@eom");
    expect(aliases).toContain("@mercury");
  });
});

// ---------------------------------------------------------------------------
// intersectApis
// ---------------------------------------------------------------------------

describe("intersectApis", () => {
  const fnA: HostFunctionDescriptor = {
    name: "bleWrite",
    module: "ble",
    permission: "ble:write",
    args: [{ name: "data", type: "string" }],
    returns: { type: "int" },
  };

  const fnB: HostFunctionDescriptor = {
    name: "log",
    module: "system",
    permission: null,
    args: [{ name: "msg", type: "string" }],
  };

  const fnC: HostFunctionDescriptor = {
    name: "setSpeed",
    module: "output",
    permission: "output:write",
    args: [{ name: "speed", type: "int" }],
  };

  const evA: EventDescriptor = {
    name: "speed_change",
    module: "system",
    permission: null,
    payload: [{ name: "speed", type: "int" }],
  };

  const evB: EventDescriptor = {
    name: "connect",
    module: "ble",
    permission: null,
  };

  it("returns empty for no descriptors", () => {
    const result = intersectApis([]);
    expect(result.functions).toEqual([]);
    expect(result.events).toEqual([]);
  });

  it("returns the full descriptor for a single input", () => {
    const result = intersectApis([{ functions: [fnA, fnB], events: [evA] }]);
    expect(result.functions).toHaveLength(2);
    expect(result.events).toHaveLength(1);
  });

  it("intersects to only shared functions", () => {
    const desc1 = { functions: [fnA, fnB, fnC], events: [evA, evB] };
    const desc2 = { functions: [fnA, fnC], events: [evA] };

    const result = intersectApis([desc1, desc2]);

    expect(result.functions.map((f) => f.name).sort()).toEqual(["bleWrite", "setSpeed"]);
    expect(result.events.map((e) => e.name)).toEqual(["speed_change"]);
  });

  it("excludes functions with incompatible arg types", () => {
    const fnADifferent: HostFunctionDescriptor = {
      name: "bleWrite",
      module: "ble",
      permission: "ble:write",
      args: [{ name: "data", type: "int" }], // different type!
    };

    const result = intersectApis([
      { functions: [fnA], events: [] },
      { functions: [fnADifferent], events: [] },
    ]);

    expect(result.functions).toHaveLength(0);
  });

  it("intersects optional args across descriptors", () => {
    const fnWithOpt1: HostFunctionDescriptor = {
      name: "random",
      module: "system",
      permission: null,
      args: [
        { name: "min", type: "int", optional: true },
        { name: "max", type: "int", optional: true },
      ],
    };
    const fnWithOpt2: HostFunctionDescriptor = {
      name: "random",
      module: "system",
      permission: null,
      args: [
        { name: "min", type: "int", optional: true },
        // max not present in this descriptor
      ],
    };

    const result = intersectApis([
      { functions: [fnWithOpt1], events: [] },
      { functions: [fnWithOpt2], events: [] },
    ]);

    expect(result.functions).toHaveLength(1);
    const args = result.functions[0]!.args!;
    // Only "min" should survive — it's in both
    expect(args).toHaveLength(1);
    expect(args[0]!.name).toBe("min");
  });
});

// ---------------------------------------------------------------------------
// resolveRuntimeBundle — integration tests using real data files
// ---------------------------------------------------------------------------

describe("resolveRuntimeBundle", () => {
  describe("@sdk_version resolution", () => {
    it("resolves without sdk_version (uses latest)", () => {
      const bundle = resolveRuntimeBundle({});
      expect(bundle.builtins.product).toBe("core");
      expect(bundle.builtins.version).toBe("1.1.0");
    });

    it("resolves with exact sdk_version constraint", () => {
      const bundle = resolveRuntimeBundle({ sdkVersion: "== 1.1.0" });
      expect(bundle.builtins.version).toBe("1.1.0");
    });

    it("resolves with ~> sdk_version constraint", () => {
      const bundle = resolveRuntimeBundle({ sdkVersion: "~> 1.0" });
      expect(bundle.builtins.version).toBe("1.1.0");
    });

    it("errors on unsatisfiable sdk_version", () => {
      expect(() =>
        resolveRuntimeBundle({ sdkVersion: "~> 99.0" }),
      ).toThrow(ResolutionError);
    });
  });

  describe("@platforms family resolution", () => {
    it("resolves @eom family without constraint (latest current)", () => {
      const bundle = resolveRuntimeBundle({
        platforms: ["@eom"],
      });
      expect(bundle.platformApi).not.toBeNull();
      expect(bundle.resolvedPlatforms).toHaveLength(1);
      expect(bundle.resolvedPlatforms[0]!.identifier).toBe("@eom");
      expect(bundle.resolvedPlatforms[0]!.resolvedVersion).toBe("2.0.1");
      expect(bundle.resolvedPlatforms[0]!.isFamily).toBe(true);

      // Should contain functions from the family contract
      const fnNames = bundle.platformApi!.functions.map((f) => f.name);
      expect(fnNames).toContain("ble_write");
      expect(fnNames).toContain("log");
    });

    it("resolves @eom family with ~> constraint", () => {
      const bundle = resolveRuntimeBundle({
        platforms: ["@eom ~> 1.0"],
      });
      expect(bundle.resolvedPlatforms[0]!.resolvedVersion).toBe("1.0.0");
    });

    it("errors on unknown family alias", () => {
      expect(() =>
        resolveRuntimeBundle({ platforms: ["@nonexistent"] }),
      ).toThrow(ResolutionError);
    });

    it("errors on unsatisfiable family version", () => {
      expect(() =>
        resolveRuntimeBundle({ platforms: ["@eom ~> 99.0"] }),
      ).toThrow(ResolutionError);
    });
  });

  describe("@platforms SKU resolution", () => {
    it("resolves eom3k SKU without constraint", () => {
      const bundle = resolveRuntimeBundle({
        platforms: ["eom3k"],
      });
      expect(bundle.platformApi).not.toBeNull();
      expect(bundle.resolvedPlatforms).toHaveLength(1);
      expect(bundle.resolvedPlatforms[0]!.identifier).toBe("eom3k");
      expect(bundle.resolvedPlatforms[0]!.isFamily).toBe(false);
      expect(bundle.resolvedPlatforms[0]!.resolvedVersion).toBe("2.0.1");
    });

    it("resolves eom3k SKU with exact version pin", () => {
      const bundle = resolveRuntimeBundle({
        platforms: ["eom3k == 2.0.1"],
      });
      expect(bundle.resolvedPlatforms[0]!.resolvedVersion).toBe("2.0.1");

      // Should have the full EOM3K API, including SKU-specific functions
      const fnNames = bundle.platformApi!.functions.map((f) => f.name);
      expect(fnNames).toContain("get_system_config");
      expect(fnNames).toContain("set_system_config");
    });

    it("errors on unknown SKU", () => {
      expect(() =>
        resolveRuntimeBundle({ platforms: ["nonexistent_sku"] }),
      ).toThrow(ResolutionError);
    });

    it("errors on SKU with no matching version", () => {
      expect(() =>
        resolveRuntimeBundle({ platforms: ["eom3k == 99.0.0"] }),
      ).toThrow(ResolutionError);
    });
  });

  describe("@all special case", () => {
    it("resolves @all with only builtins (no platform API)", () => {
      const bundle = resolveRuntimeBundle({
        platforms: ["@all"],
        sdkVersion: "~> 1.0",
      });
      expect(bundle.platformApi).toBeNull();
      expect(bundle.resolvedPlatforms).toHaveLength(0);
      expect(bundle.builtins.functions.length).toBeGreaterThan(0);
    });
  });

  describe("multi-platform intersection", () => {
    it("intersects @eom family + eom3k SKU (family is subset of SKU)", () => {
      const bundle = resolveRuntimeBundle({
        platforms: ["@eom ~> 1.0", "eom3k ~> 2.0"],
      });

      expect(bundle.resolvedPlatforms).toHaveLength(2);
      expect(bundle.platformApi).not.toBeNull();

      const fnNames = bundle.platformApi!.functions.map((f) => f.name);

      // Functions in the family contract AND the SKU should survive
      expect(fnNames).toContain("ble_write");
      expect(fnNames).toContain("log");

      // get_system_config is in EOM3K but NOT in the @eom family contract
      expect(fnNames).not.toContain("get_system_config");
    });
  });

  describe("combined resolution", () => {
    it("resolves both @sdk_version and @platforms together", () => {
      const bundle = resolveRuntimeBundle({
        sdkVersion: "~> 1.0",
        platforms: ["@eom ~> 1.0"],
      });

      expect(bundle.builtins.product).toBe("core");
      expect(bundle.builtins.version).toBe("1.1.0");
      expect(bundle.platformApi).not.toBeNull();
      expect(bundle.resolvedPlatforms[0]!.identifier).toBe("@eom");

      // Builtins: core language functions
      const builtinNames = bundle.builtins.functions.map((f) => f.name);
      expect(builtinNames).toContain("add");
      expect(builtinNames).toContain("concat");

      // Platform: device-specific functions
      const platformNames = bundle.platformApi!.functions.map((f) => f.name);
      expect(platformNames).toContain("ble_write");

      // Events come from the platform, not builtins
      expect(bundle.builtins.events).toHaveLength(0);
      expect(bundle.platformApi!.events.length).toBeGreaterThan(0);
    });
  });

  describe("error quality", () => {
    it("ResolutionError includes details array", () => {
      try {
        resolveRuntimeBundle({ platforms: ["@nonexistent"] });
        expect.fail("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(ResolutionError);
        const err = e as ResolutionError;
        expect(err.details).toHaveLength(1);
        expect(err.details[0]).toContain("@nonexistent");
      }
    });

    it("collects multiple platform errors", () => {
      try {
        resolveRuntimeBundle({ platforms: ["@nonexistent", "@alsonotreal"] });
        expect.fail("should have thrown");
      } catch (e) {
        const err = e as ResolutionError;
        expect(err.details).toHaveLength(2);
      }
    });
  });
});
