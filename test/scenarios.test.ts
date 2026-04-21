/**
 * Real-world scenario validation for the runtime resolver.
 *
 * These tests simulate the practical situations the resolver will face
 * in production, using the actual data files in the repository.
 */
import { describe, it, expect } from "vitest";
import {
  resolveRuntimeBundle,
  intersectApis,
  ResolutionError,
} from "../src/resolver.js";
import type { HostFunctionDescriptor, EventDescriptor } from "../src/types.js";

describe("Real-World Scenarios", () => {
  // =========================================================================
  // Scenario 1: Lovense driver plugin (existing real plugin)
  // =========================================================================
  describe("Scenario 1: Lovense driver is a @eom-only BLE plugin", () => {
    // This is the actual metadata from eom-plugins/drivers/lovense/plugin.mtp:
    //   @sdk_version "~> 1.0"   (note: was "~>1.0.0" but we're using hex-style now)
    //   @platforms   ["@eom"]
    //   @permissions ["ble:write"]

    it("resolves the plugin's runtime requirements", () => {
      const bundle = resolveRuntimeBundle({
        sdkVersion: "~> 1.0",
        platforms: ["@eom"],
      });

      // Builtins: the plugin uses concat, strlen, chr, setbyte, getbyte
      const builtinFns = bundle.builtins.functions.map((f) => f.name);
      expect(builtinFns).toContain("concat");
      expect(builtinFns).toContain("strlen");
      expect(builtinFns).toContain("chr");
      expect(builtinFns).toContain("setbyte");
      expect(builtinFns).toContain("getbyte");

      // Platform: the plugin uses ble_write and responds to speed_change
      const platformFns = bundle.platformApi!.functions.map((f) => f.name);
      expect(platformFns).toContain("ble_write");

      const platformEvents = bundle.platformApi!.events.map((e) => e.name);
      expect(platformEvents).toContain("speed_change");
    });

    it("family contract does not expose SKU-specific getSystemConfig", () => {
      const bundle = resolveRuntimeBundle({
        sdkVersion: "~> 1.0",
        platforms: ["@eom"],
      });

      const platformFns = bundle.platformApi!.functions.map((f) => f.name);
      // getSystemConfig and setSystemConfig are EOM3K-specific, not in the
      // @eom family contract (they require syscfg:read/syscfg:write permissions
      // and aren't guaranteed on all EOM devices)
      expect(platformFns).not.toContain("get_system_config");
      expect(platformFns).not.toContain("set_system_config");
    });
  });

  // =========================================================================
  // Scenario 2: Plugin targeting a specific SKU for device-specific features
  // =========================================================================
  describe("Scenario 2: EOM3K-specific plugin with system config access", () => {
    // A hypothetical plugin that reads/writes system config which only works on
    // the specific EOM3K hardware, not the whole family.
    //   @platforms ["eom3k ~> 2.0"]

    it("resolves with full EOM3K API including device-specific functions", () => {
      const bundle = resolveRuntimeBundle({
        sdkVersion: "~> 1.0",
        platforms: ["eom3k ~> 2.0"],
      });

      const fnNames = bundle.platformApi!.functions.map((f) => f.name);
      expect(fnNames).toContain("get_system_config");
      expect(fnNames).toContain("set_system_config");
      expect(fnNames).toContain("ble_write");
      // All EOM3K functions should be available
      expect(fnNames).toContain("get_plugin_config");
      expect(fnNames).toContain("delay");
      expect(fnNames).toContain("random");
    });
  });

  // =========================================================================
  // Scenario 3: Cross-platform plugin (hypothetical)
  // =========================================================================
  describe("Scenario 3: Cross-family intersection", () => {
    // If someone writes a plugin targeting both @eom and a SKU, the intersection
    // should only contain functions available on both.

    it("@eom + eom3k intersection narrows to family contract", () => {
      const bundle = resolveRuntimeBundle({
        platforms: ["@eom ~> 1.0", "eom3k ~> 2.0"],
      });

      const fnNames = bundle.platformApi!.functions.map((f) => f.name);

      // Everything in @eom family is in EOM3K, so family is the intersection
      expect(fnNames).toContain("ble_write");
      expect(fnNames).toContain("log");
      expect(fnNames).toContain("delay");

      // EOM3K-specific stuff gets excluded
      expect(fnNames).not.toContain("get_system_config");
    });
  });

  // =========================================================================
  // Scenario 4: @all is a runtime-only plugin (no device APIs)
  // =========================================================================
  describe("Scenario 4: @all is a pure mt-actions plugin", () => {
    // A plugin that only uses core language features, runs on any device
    //   @platforms ["@all"]

    it("resolves with builtins only, no platform API", () => {
      const bundle = resolveRuntimeBundle({
        sdkVersion: "~> 1.0",
        platforms: ["@all"],
      });

      expect(bundle.platformApi).toBeNull();
      expect(bundle.resolvedPlatforms).toHaveLength(0);
      expect(bundle.builtins.functions.length).toBeGreaterThan(0);

      // Core builtins always available
      const builtinFns = bundle.builtins.functions.map((f) => f.name);
      expect(builtinFns).toContain("add");
      expect(builtinFns).toContain("sub");
      expect(builtinFns).toContain("eq");
    });
  });

  // =========================================================================
  // Scenario 5: Version pinning prevents accidental upgrades
  // =========================================================================
  describe("Scenario 5: Exact version pinning", () => {
    it("== 2.0.1 resolves to exactly 2.0.1", () => {
      const bundle = resolveRuntimeBundle({
        platforms: ["eom3k == 2.0.1"],
      });
      expect(bundle.resolvedPlatforms[0]!.resolvedVersion).toBe("2.0.1");
    });

    it("sdk version exact pin works", () => {
      const bundle = resolveRuntimeBundle({
        sdkVersion: "== 1.1.0",
      });
      expect(bundle.builtins.version).toBe("1.1.0");
    });
  });

  // =========================================================================
  // Scenario 6: Future-proofing is a what happens with new products/versions
  // =========================================================================
  describe("Scenario 6: Error messages for missing data", () => {
    it("clear error when a SKU exists but has no versions (e.g. Mercury M1K)", () => {
      // M1K is in the catalog but has no versions yet
      try {
        resolveRuntimeBundle({ platforms: ["m1k"] });
        expect.fail("should throw");
      } catch (e) {
        expect(e).toBeInstanceOf(ResolutionError);
        const err = e as ResolutionError;
        expect(err.details[0]).toContain("M1K");
      }
    });

    it("clear error for non-existent family", () => {
      try {
        resolveRuntimeBundle({ platforms: ["@widget"] });
        expect.fail("should throw");
      } catch (e) {
        const err = e as ResolutionError;
        expect(err.details[0]).toContain("@widget");
      }
    });

    it("clear error for non-existent SKU", () => {
      try {
        resolveRuntimeBundle({ platforms: ["xr5000"] });
        expect.fail("should throw");
      } catch (e) {
        const err = e as ResolutionError;
        expect(err.details[0]).toContain("xr5000");
        expect(err.details[0]).toContain("XR5000");
      }
    });
  });

  // =========================================================================
  // Scenario 7: Intersection correctness is a function signature matching
  // =========================================================================
  describe("Scenario 7: API intersection edge cases", () => {
    it("functions with different arg types are excluded from intersection", () => {
      const fnBle1: HostFunctionDescriptor = {
        name: "write",
        module: "io",
        permission: null,
        args: [{ name: "data", type: "string" }],
      };
      const fnBle2: HostFunctionDescriptor = {
        name: "write",
        module: "io",
        permission: null,
        args: [{ name: "data", type: "bytes" }],
      };

      const result = intersectApis([
        { functions: [fnBle1], events: [] },
        { functions: [fnBle2], events: [] },
      ]);

      // Same name but different type = NOT compatible
      expect(result.functions).toHaveLength(0);
    });

    it("functions with same name but different modules are separate", () => {
      const fn1: HostFunctionDescriptor = {
        name: "write",
        module: "ble",
        permission: null,
        args: [{ name: "data", type: "string" }],
      };
      const fn2: HostFunctionDescriptor = {
        name: "write",
        module: "serial",
        permission: null,
        args: [{ name: "data", type: "string" }],
      };

      const result = intersectApis([
        { functions: [fn1, fn2], events: [] },
        { functions: [fn1], events: [] },
      ]);

      // ble.write is in both, serial.write is not
      expect(result.functions).toHaveLength(1);
      expect(result.functions[0]!.module).toBe("ble");
    });

    it("events with different payloads are excluded", () => {
      const ev1: EventDescriptor = {
        name: "data_received",
        module: "io",
        permission: null,
        payload: [{ name: "data", type: "string" }],
      };
      const ev2: EventDescriptor = {
        name: "data_received",
        module: "io",
        permission: null,
        payload: [{ name: "data", type: "bytes" }],
      };

      const result = intersectApis([
        { functions: [], events: [ev1] },
        { functions: [], events: [ev2] },
      ]);

      expect(result.events).toHaveLength(0);
    });
  });

  // =========================================================================
  // Scenario 8: The resolver returns machine-readable metadata
  // =========================================================================
  describe("Scenario 8: Resolver metadata for diagnostics", () => {
    it("resolvedPlatforms contains enough info for diagnostics", () => {
      const bundle = resolveRuntimeBundle({
        sdkVersion: "~> 1.0",
        platforms: ["@eom ~> 1.0"],
      });

      expect(bundle.resolvedPlatforms).toHaveLength(1);
      const p = bundle.resolvedPlatforms[0]!;
      expect(p.identifier).toBe("@eom");
      expect(p.isFamily).toBe(true);
      expect(p.resolvedVersion).toBe("1.0.0");
      expect(p.source).toBe("edge-o-matic");
    });

    it("platformApi.product encodes the combined platform target", () => {
      const bundle = resolveRuntimeBundle({
        platforms: ["@eom ~> 1.0", "eom3k ~> 2.0"],
      });

      // Synthetic product should identify what was combined
      expect(bundle.platformApi!.product).toContain("@eom");
      expect(bundle.platformApi!.product).toContain("eom3k");
    });
  });
});
