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

  test("i18n dictionary has uk/en navigation labels", async () => {
    const res = await request(app).get("/i18n.json");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("uk.navigation.main");
    expect(res.body).toHaveProperty("uk.navigation.security");
    expect(res.body).toHaveProperty("uk.navigation.intrusion");
    expect(res.body).toHaveProperty("en.navigation.main");
    expect(res.body).toHaveProperty("en.navigation.security");
    expect(res.body).toHaveProperty("en.navigation.intrusion");
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
