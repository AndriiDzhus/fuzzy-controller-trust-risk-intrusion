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

  test("i18n dictionary has sticky input bar labels", async () => {
    const res = await request(app).get("/i18n.json");
    expect(res.status).toBe(200);
    expect(res.body.uk.common.sticky.result).toBeTruthy();
    expect(res.body.uk.index.stickyTitle).toBeTruthy();
    expect(res.body.uk.security.stickyTitle).toBeTruthy();
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
      expect(res.text).toContain('data-i18n="app.tagline"');
    }
  });

  test("all pages include rules interpretation section", async () => {
    const pages = [
      { path: "/index.html", prefix: "index" },
      { path: "/security.html", prefix: "security" },
      { path: "/intrusion.html", prefix: "intrusion" },
    ];

    for (const { path, prefix } of pages) {
      const res = await request(app).get(path);
      expect(res.status).toBe(200);
      expect(res.text).toContain('class="rules-section"');
      expect(res.text).toContain(`data-i18n="${prefix}.rules.title"`);
      expect(res.text).toContain(`data-i18n="${prefix}.rules.category1"`);
    }
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
