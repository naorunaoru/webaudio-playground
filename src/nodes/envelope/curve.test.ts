import { describe, it, expect } from "vitest";
import { shapedT, invTFromU } from "./curve";

describe("shapedT and invTFromU", () => {
  const shapes = [-1, -0.6, -0.3, 0, 0.3, 0.6, 1];
  const tValues = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];

  describe("shapedT properties", () => {
    it("should return 0 when t=0", () => {
      for (const shape of shapes) {
        expect(shapedT(0, shape)).toBeCloseTo(0, 10);
      }
    });

    it("should return 1 when t=1", () => {
      for (const shape of shapes) {
        expect(shapedT(1, shape)).toBeCloseTo(1, 10);
      }
    });

    it("should be monotonically increasing", () => {
      for (const shape of shapes) {
        let prev = -Infinity;
        for (const t of tValues) {
          const val = shapedT(t, shape);
          expect(val).toBeGreaterThanOrEqual(prev);
          prev = val;
        }
      }
    });
  });

  describe("invTFromU should be the inverse of shapedT", () => {
    it("invTFromU(shapedT(t)) should equal t for all shapes", () => {
      for (const shape of shapes) {
        for (const t of tValues) {
          const u = shapedT(t, shape);
          const recovered = invTFromU(u, shape);
          expect(recovered).toBeCloseTo(t, 8);
        }
      }
    });

    it("shapedT(invTFromU(u)) should equal u for all shapes", () => {
      for (const shape of shapes) {
        for (const u of tValues) {
          const t = invTFromU(u, shape);
          const recovered = shapedT(t, shape);
          expect(recovered).toBeCloseTo(u, 8);
        }
      }
    });
  });

  describe("curve shape characteristics", () => {
    it("positive shape should give fast-start (value at t=0.5 should be > 0.5)", () => {
      expect(shapedT(0.5, 0.6)).toBeGreaterThan(0.5);
      expect(shapedT(0.5, 1)).toBeGreaterThan(0.5);
    });

    it("negative shape should give slow-start (value at t=0.5 should be < 0.5)", () => {
      expect(shapedT(0.5, -0.6)).toBeLessThan(0.5);
      expect(shapedT(0.5, -1)).toBeLessThan(0.5);
    });

    it("zero shape should be linear (value at t=0.5 should equal 0.5)", () => {
      expect(shapedT(0.5, 0)).toBeCloseTo(0.5, 10);
    });
  });
});
