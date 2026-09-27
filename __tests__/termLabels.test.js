/**
 * Ukrainian term labels follow the rule tables of the assignments
 * (docs/tasks/*): the page config picks the grammatical form per variable and
 * i18n common.termForms holds the words.
 */
const fs = require("fs");
const path = require("path");

const i18n = JSON.parse(fs.readFileSync(path.join(__dirname, "../public/i18n.json"), "utf8"));
const page = (name) => fs.readFileSync(path.join(__dirname, `../public/${name}.js`), "utf8");
const { f, n } = i18n.uk.common.termForms;
const terms = i18n.uk.common.terms;

describe("Trust", () => {
  const config = page("trust");

  test("inputs ER, CC, BS read Мала / Середня / Велика", () => {
    ["errors", "connections", "bytes"].forEach((key) => {
      expect(config).toMatch(new RegExp(`${key}: "f"`));
    });
    expect([f.Low, f.Medium, f.High]).toEqual(["Мала", "Середня", "Велика"]);
  });

  test("output TI keeps Дуже низький … Дуже високий", () => {
    expect(config).not.toMatch(/trustIndex: "[fn]"/);
    expect([terms.VeryLow, terms.Low, terms.Medium, terms.High, terms.VeryHigh]).toEqual([
      "Дуже низький",
      "Низький",
      "Середній",
      "Високий",
      "Дуже високий",
    ]);
  });
});

describe("Intrusion", () => {
  const config = page("intrusion");

  test("inputs NP and Rate are feminine, We is neuter", () => {
    expect(config).toMatch(/packets: "f"/);
    expect(config).toMatch(/rate: "f"/);
    expect(config).toMatch(/weight: "n"/);
    expect([n.low, n.medium, n.high]).toEqual(["Мале", "Середнє", "Велике"]);
  });

  test("output IP reads Відсутня / Мала / Середня / Велика", () => {
    expect(config).toMatch(/intrusion: "f"/);
    expect([f.none, f.low, f.medium, f.high]).toEqual(["Відсутня", "Мала", "Середня", "Велика"]);
  });
});
