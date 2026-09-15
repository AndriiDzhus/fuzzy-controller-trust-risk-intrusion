const request = require("supertest");
const app = require("../server");

describe("E2E smoke: navigation and i18n", () => {
  test("all pages include menu links to all controllers", async () => {
    const pages = ["/index.html", "/security.html", "/intrusion.html"];

    for (const page of pages) {
      const res = await request(app).get(page);
      expect(res.status).toBe(200);
      expect(res.text).toContain('href="index.html"');
      expect(res.text).toContain('href="security.html"');
      expect(res.text).toContain('href="intrusion.html"');
    }
  });

  test("all pages contain language switcher", async () => {
    const pages = ["/index.html", "/security.html", "/intrusion.html"];

    for (const page of pages) {
      const res = await request(app).get(page);
      expect(res.status).toBe(200);
      expect(res.text).toContain('id="languageSwitcher"');
      expect(res.text).toContain('value="uk"');
      expect(res.text).toContain('value="en"');
    }
  });

  test("i18n dictionary has docs popup labels", async () => {
    const res = await request(app).get("/i18n.json");
    expect(res.status).toBe(200);
    expect(res.body.uk.common.docs.formulasBtn).toBeTruthy();
    expect(res.body.uk.common.docs.rulesBtn).toBeTruthy();
    expect(res.body.en.common.docs.formulasBtn).toBeTruthy();
    expect(res.body.en.common.docs.rulesBtn).toBeTruthy();
  });

  test("i18n dictionary has sticky input bar labels", async () => {
    const res = await request(app).get("/i18n.json");
    expect(res.status).toBe(200);
    expect(res.body.uk.common.noRuleFired).toBeTruthy();
    expect(res.body.en.common.noRuleFired).toBeTruthy();
    expect(res.body.uk.common.noRuleFiredHint).toBeTruthy();
    expect(res.body.en.common.noRuleFiredHint).toBeTruthy();
    expect(res.body.uk.common.sticky.result).toBeTruthy();
    expect(res.body.uk.common.tooltip.current).toBeTruthy();
    expect(res.body.uk.common.tooltip.aggregatedMu).toBeTruthy();
    expect(res.body.uk.common.tooltip.singletonAt).toBeTruthy();
    expect(res.body.uk.index.stickyTitle).toBeTruthy();
    expect(res.body.uk.security.stickyTitle).toBeTruthy();
    expect(res.body.uk.common.meta.mamdani).toBeTruthy();
    expect(res.body.uk.common.meta.centerOfGravity).toBe(res.body.uk.common.meta.centroid);
    expect(res.body.en.common.meta.centerOfGravity).toBe(res.body.en.common.meta.centroid);
    expect(res.body.uk.common.meta.weightedAverage).toBeTruthy();
    expect(res.body.uk.intrusion.stickyTitle).toBeTruthy();
    expect(res.body.en.common.sticky.result).toBeTruthy();
    expect(res.body.en.index.stickyTitle).toBeTruthy();
    expect(res.body.en.security.stickyTitle).toBeTruthy();
    expect(res.body.en.intrusion.stickyTitle).toBeTruthy();
  });

  test("i18n dictionary has uk/en navigation labels", async () => {
    const res = await request(app).get("/i18n.json");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("uk.app.name");
    expect(res.body).toHaveProperty("uk.app.tagline");
    expect(res.body).toHaveProperty("uk.navigation.main");
    expect(res.body).toHaveProperty("uk.navigation.security");
    expect(res.body).toHaveProperty("uk.navigation.intrusion");
    expect(res.body).toHaveProperty("en.navigation.main");
    expect(res.body).toHaveProperty("en.navigation.security");
    expect(res.body).toHaveProperty("en.navigation.intrusion");
  });

  test("all pages include platform branding", async () => {
    const pages = ["/index.html", "/security.html", "/intrusion.html"];

    for (const page of pages) {
      const res = await request(app).get(page);
      expect(res.status).toBe(200);
      expect(res.text).toContain('data-i18n="app.name"');
      expect(res.text).toContain('class="app-header"');
      expect(res.text).toContain('class="page-head"');
    }
  });

  test("i18n dictionary has rules interpretation copy for all controllers", async () => {
    const res = await request(app).get("/i18n.json");
    expect(res.status).toBe(200);

    for (const prefix of ["index", "security", "intrusion"]) {
      expect(res.body.uk[prefix].rules.title).toBeTruthy();
      expect(res.body.uk[prefix].rules.category1).toBeTruthy();
      expect(res.body.en[prefix].rules.title).toBeTruthy();
      expect(res.body.en[prefix].rules.category1).toBeTruthy();
    }
  });

  test("trust and intrusion pages show model and defuzzification marks", async () => {
    const trust = await request(app).get("/index.html");
    expect(trust.status).toBe(200);
    expect(trust.text).toContain('data-i18n="common.meta.mamdani"');
    expect(trust.text).toContain('data-i18n="common.meta.centerOfGravity"');

    const intrusion = await request(app).get("/intrusion.html");
    expect(intrusion.status).toBe(200);
    expect(intrusion.text).toContain('data-i18n="common.meta.mamdani"');
    expect(intrusion.text).toContain('data-i18n="common.meta.centerOfGravity"');
  });

  test("security page shows singleton defuzzification mark", async () => {
    const res = await request(app).get("/security.html");
    expect(res.status).toBe(200);
    expect(res.text).toContain('data-i18n="common.meta.sugeno"');
    expect(res.text).toContain('data-i18n="common.meta.weightedAverage"');
    expect(res.text).not.toContain('id="controllerModeSelect"');
  });

  test("all pages split inference into accordion pipeline steps", async () => {
    const pages = ["/index.html", "/security.html", "/intrusion.html"];

    for (const page of pages) {
      const res = await request(app).get(page);
      expect(res.status).toBe(200);
      expect(res.text).toContain('class="workspace"');
      expect(res.text).toContain('class="process-step"');
      expect(res.text).toContain('data-step="fuzzification"');
      expect(res.text).toContain('data-step="accumulation"');
      expect(res.text).toContain('data-step="defuzzification"');
      expect(res.text).toContain('data-i18n="common.pipeline.fuzzification"');
    }
  });

  test("i18n dictionary has pipeline step labels", async () => {
    const res = await request(app).get("/i18n.json");
    expect(res.status).toBe(200);
    expect(res.body.uk.common.pipeline.fuzzification).toBe("Фазифікація");
    expect(res.body.uk.common.pipeline.fuzzificationHint).toContain("μ(x)");
    expect(res.body.uk.common.pipeline.fuzzificationHint).toContain("лінгвістичних термів");
    expect(res.body.en.common.pipeline.fuzzificationHint).toContain("μ(x)");
    expect(res.body.uk.common.tooltip.muX).toContain("{vars}");
    expect(res.body.en.common.tooltip.muOut).toContain("{var}");
    expect(res.body.uk.common.pipeline.accumulationHintMamdani).toContain("{tip:max}");
    expect(res.body.uk.common.pipeline.accumulationHintMamdani).toContain("{tip:cog}");
    expect(res.body.uk.common.pipeline.defuzzificationHintCog).toBe(
      res.body.uk.common.pipeline.defuzzificationHintCentroid
    );
    expect(res.body.uk.common.pipeline.defuzzificationHintCog).toContain("лінгвістичних термах");
    expect(res.body.uk.common.glossary.max.hint).toContain("max");
    expect(res.body.uk.common.glossary.cog.hint).toContain("Σ");
    expect(res.body.uk.common.glossary.wavg.hint).toContain("w");
    expect(res.body.uk.common.pipeline.defuzzificationHintSugeno).toContain("{tip:wavg}");
    expect(res.body.uk.common.pipeline.accumulation).toBe("Акумуляція");
    expect(res.body.uk.common.pipeline.defuzzification).toBe("Дефазифікація");
    expect(res.body.en.common.pipeline.fuzzification).toBe("Fuzzification");
    expect(res.body.en.common.pipeline.accumulation).toBe("Accumulation");
    expect(res.body.en.common.pipeline.defuzzification).toBe("Defuzzification");
  });

  test("all pages include formula and rule-base buttons", async () => {
    const pages = ["/index.html", "/security.html", "/intrusion.html"];

    for (const page of pages) {
      const res = await request(app).get(page);
      expect(res.status).toBe(200);
      expect(res.text).toContain('data-docs="formulas"');
      expect(res.text).toContain('data-docs="rules"');
      expect(res.text).toContain('src="controller-docs.js"');
      expect(res.text).toContain("vendor/katex/katex.min.js");
      expect(res.text).toContain("vendor/katex/katex.min.css");
    }
  });

  test("KaTeX assets are served from the katex package", async () => {
    const js = await request(app).get("/vendor/katex/katex.min.js");
    const css = await request(app).get("/vendor/katex/katex.min.css");
    expect(js.status).toBe(200);
    expect(css.status).toBe(200);
    expect(js.text).toContain("katex");
  });

  test("shared graph core and i18n helper are loaded on all pages", async () => {
    const pages = ["/index.html", "/security.html", "/intrusion.html"];

    for (const page of pages) {
      const res = await request(app).get(page);
      expect(res.status).toBe(200);
      expect(res.text).toContain('src="i18n-helper.js"');
      expect(res.text).toContain('src="fuzzy-page-core.js"');
    }
  });
});
