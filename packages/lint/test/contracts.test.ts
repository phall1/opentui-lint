import { describe, expect, test } from "bun:test";
import {
  compileContracts,
  ContractConfigError,
  RESTYLE_CATEGORIES,
} from "../src/project/contracts.js";

describe("no contracts configured", () => {
  test("everything is reported — a design-system component owns its look by default", () => {
    const contracts = compileContracts(undefined);
    for (const category of RESTYLE_CATEGORIES) {
      expect(contracts.decide("Button", category).allowed).toBe(false);
    }
  });

  test("an empty contracts array behaves the same as undefined", () => {
    const contracts = compileContracts([]);
    expect(contracts.decide("Button", "color").allowed).toBe(false);
  });
});

describe("the omitted-vs-empty table, per contract", () => {
  test("no allow and no deny: everything on the matched component is reported", () => {
    const contracts = compileContracts([{ pattern: "^Button$" }]);
    expect(contracts.decide("Button", "color").allowed).toBe(false);
    expect(contracts.decide("Button", "spacing").allowed).toBe(false);
  });

  test("deny alone: everything else is allowed by default", () => {
    const contracts = compileContracts([{ pattern: "^Button$", deny: ["color"] }]);
    expect(contracts.decide("Button", "color").allowed).toBe(false);
    expect(contracts.decide("Button", "spacing").allowed).toBe(true);
    expect(contracts.decide("Button", "border").allowed).toBe(true);
  });

  test("allow alone: only the listed categories are allowed", () => {
    const contracts = compileContracts([{ pattern: "^Button$", allow: ["spacing"] }]);
    expect(contracts.decide("Button", "spacing").allowed).toBe(true);
    expect(contracts.decide("Button", "color").allowed).toBe(false);
  });

  test("a component matching no contract falls back to the same no-allow-no-deny baseline", () => {
    const contracts = compileContracts([{ pattern: "^Button$", allow: ["color"] }]);
    expect(contracts.decide("Panel", "color").allowed).toBe(false);
  });
});

describe("deny beats allow", () => {
  test("within one contract, a category in both allow and deny is denied", () => {
    const contracts = compileContracts([
      { pattern: "^Badge$", allow: ["color", "spacing"], deny: ["color"] },
    ]);
    expect(contracts.decide("Badge", "color").allowed).toBe(false);
    expect(contracts.decide("Badge", "spacing").allowed).toBe(true);
  });
});

describe("last matching contract wins, no merging", () => {
  test("a later, more specific match completely replaces an earlier one's allow list", () => {
    const contracts = compileContracts([
      { pattern: "Button", allow: ["color"] },
      { pattern: "^Button$", deny: ["spacing"] },
    ]);
    // The second contract has no allow of its own and a deny, so it opens
    // every other category by default — including "color", which the first
    // contract's allow list is powerless to add back once it has lost the
    // match. Nothing from the first contract survives into the second.
    expect(contracts.decide("Button", "color").allowed).toBe(true);
    expect(contracts.decide("Button", "spacing").allowed).toBe(false);
  });

  test("an unanchored pattern matching a substring still loses to a later, narrower match", () => {
    const contracts = compileContracts([
      { pattern: "Button", deny: ["color"] },
      { pattern: "^IconButton$", allow: ["color"] },
    ]);
    expect(contracts.decide("IconButton", "color").allowed).toBe(true);
    expect(contracts.decide("SubmitButton", "color").allowed).toBe(false);
  });
});

describe("pattern semantics", () => {
  test("an unanchored pattern matches a component name as a substring", () => {
    const contracts = compileContracts([{ pattern: "Button", allow: ["color"] }]);
    expect(contracts.decide("IconButton", "color").allowed).toBe(true);
  });

  test("an anchored pattern matches only the exact name", () => {
    const contracts = compileContracts([{ pattern: "^Button$", allow: ["color"] }]);
    expect(contracts.decide("IconButton", "color").allowed).toBe(false);
    expect(contracts.decide("Button", "color").allowed).toBe(true);
  });
});

describe("messages", () => {
  test("a denied verdict carries the matching contract's own message", () => {
    const contracts = compileContracts([
      { pattern: "^Panel$", deny: ["border"], message: "Panel always has a border." },
    ]);
    expect(contracts.decide("Panel", "border")).toEqual({
      allowed: false,
      message: "Panel always has a border.",
    });
  });

  test("an allowed verdict carries no message", () => {
    const contracts = compileContracts([
      { pattern: "^Panel$", allow: ["border"], message: "unused" },
    ]);
    expect(contracts.decide("Panel", "border").message).toBeUndefined();
  });

  test("a contract with no message of its own reports undefined, for the caller to fall back on", () => {
    const contracts = compileContracts([{ pattern: "^Panel$", deny: ["border"] }]);
    expect(contracts.decide("Panel", "border").message).toBeUndefined();
  });
});

describe("config errors — never silently enforce less than was written", () => {
  test("an invalid regex pattern throws", () => {
    expect(() => compileContracts([{ pattern: "(unterminated" }])).toThrow(ContractConfigError);
  });

  test("the regex error names the bad pattern", () => {
    expect(() => compileContracts([{ pattern: "(unterminated" }])).toThrow(/\(unterminated/);
  });

  test("an allow entry that names no real category throws", () => {
    expect(() => compileContracts([{ pattern: "^Button$", allow: ["colour"] }])).toThrow(
      ContractConfigError,
    );
  });

  test("a deny entry that names no real category throws", () => {
    expect(() => compileContracts([{ pattern: "^Button$", deny: ["layout"] }])).toThrow(
      ContractConfigError,
    );
  });

  test("the category error lists the real categories, so the fix is obvious without a docs lookup", () => {
    expect(() => compileContracts([{ pattern: "^Button$", allow: ["colour"] }])).toThrow(
      /color, border, typography, spacing, internalLayout/,
    );
  });
});
