/* eslint-disable ts-patterns/no-magic-numbers -- assertions compare against literal expected values */
// دروازه کنتراست: هر چهار پوسته همه جفت‌های متن/زمینه را با WCAG رعایت می‌کنند؛ CSS پوسته‌ها کامل ساخته می‌شود.
import { describe, expect, it } from "vitest";
import { contrast, contrastFailures } from "@/theme/contrast";
import { COLOR_TOKENS, rgbTriplet, SKIN_IDS, SKINS, skinCss } from "@/theme/skins";

// Six upper-case hex digits: matches "2563EB", rejects "#2563eb" and "FFF".
// https://regex101.com/?regex=%5E%5B0-9A-F%5D%7B6%7D%24&testString=2563EB&flavor=javascript
const HEX6 = /^[0-9A-F]{6}$/;
// Each declaration of the previous-period chart colour: matches "--chart-prev:" in "--chart-prev:163 174 194;", rejects "--chart-pos:".
// https://regex101.com/?regex=--chart-prev%3A&testString=--chart-prev%3A163%20174%20194%3B&flavor=javascript&flags=g
const CHART_PREV = /--chart-prev:/g;

describe("contrast math", () => {
  it("matches the WCAG reference values", () => {
    expect(contrast("000000", "FFFFFF")).toBeCloseTo(21, 5);
    expect(contrast("777777", "FFFFFF")).toBeCloseTo(4.48, 2);
    expect(contrast("FFFFFF", "FFFFFF")).toBe(1);
  });
});

describe.each(SKIN_IDS.map((id) => [id] as const))("skin %s", (id) => {
  it("passes every text and UI contrast pair", () => {
    expect(contrastFailures(SKINS[id]).map((f) => `${f.pair.fg} on ${f.pair.bg} (${f.pair.use}): ${f.ratio.toFixed(2)} < ${f.pair.min}`)).toEqual([]);
  });

  it("defines every colour token as six hex digits", () => {
    COLOR_TOKENS.forEach((t) => expect(SKINS[id].colors[t], t).toMatch(HEX6));
  });
});

describe("skin css", () => {
  it("emits one block per skin with all variables", () => {
    const css = skinCss();
    SKIN_IDS.forEach((id) => expect(css).toContain(`[data-skin="${id}"]{`));
    expect(css.match(CHART_PREV)).toHaveLength(SKIN_IDS.length);
    expect(rgbTriplet("2563EB")).toBe("37 99 235");
  });
});
