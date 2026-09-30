const request = require("supertest");
const app = require("../server");
const { controllers, trustController, securityController } = require("../src/controllers");
const { computeSurface } = require("../src/controllers/surface");

describe("Response surface", () => {
  const inputs = { errors: 0.1, connections: 20, bytes: 5 };

  test("every grid value equals calculate() with the third input fixed", () => {
    const surface = computeSurface(trustController, { xKey: "errors", yKey: "connections", inputs, points: 7 });
    expect(surface.x).toHaveLength(7);
    expect(surface.y).toHaveLength(7);
    expect(surface.x[0]).toBe(0);
    expect(surface.x.at(-1)).toBe(1);
    expect(surface.y.at(-1)).toBe(200);
    expect(surface.fixed).toEqual({ bytes: 5 });
    surface.y.forEach((y, j) =>
      surface.x.forEach((x, i) => {
        const { value } = trustController.calculate({ errors: x, connections: y, bytes: 5 });
        expect(surface.z[j][i]).toBeCloseTo(value, 10);
      })
    );
  });

  test("points where no Security rule fires are null (holes)", () => {
    const surface = computeSurface(securityController, {
      xKey: "energy",
      yKey: "response",
      inputs: { energy: 0.03, strength: 25, response: 6 },
      points: 11,
    });
    const flat = surface.z.flat();
    expect(flat.some((v) => v === null)).toBe(true);
    expect(flat.some((v) => typeof v === "number")).toBe(true);
    // Lat = 0 or EC = 0 makes every rule weight zero at TP = 25.
    expect(surface.z[0].every((v) => v === null)).toBe(true);
  });

  test("the grid size is clamped", () => {
    const small = computeSurface(trustController, { xKey: "errors", yKey: "bytes", inputs, points: 1 });
    expect(small.x).toHaveLength(5);
    const large = computeSurface(trustController, { xKey: "errors", yKey: "bytes", inputs, points: 999 });
    expect(large.x).toHaveLength(61);
  });

  test("registry rejects invalid axes and inputs", () => {
    expect(controllers.trust.surface({ xKey: "errors", yKey: "errors", inputs }).errors).toBeTruthy();
    expect(controllers.trust.surface({ xKey: "errors", yKey: "rate", inputs }).errors).toBeTruthy();
    expect(controllers.trust.surface({ xKey: "errors", yKey: "bytes", inputs: { errors: 2 } }).errors).toBeTruthy();
  });
});

describe("Surface API", () => {
  test("POST /surface returns the grid", async () => {
    const response = await request(app)
      .post("/api/controllers/intrusion/surface")
      .send({ xKey: "packets", yKey: "rate", inputs: { packets: 9.5, rate: 150, weight: 141.5 }, points: 5 });
    expect(response.status).toBe(200);
    expect(response.body.x).toHaveLength(5);
    expect(response.body.z).toHaveLength(5);
    expect(response.body.fixed).toEqual({ weight: 141.5 });
  });

  test("invalid request gives 400 with fields", async () => {
    const response = await request(app)
      .post("/api/controllers/trust/surface")
      .send({ xKey: "errors", yKey: "errors", inputs: { errors: 0.1, connections: 20, bytes: 5 } });
    expect(response.status).toBe(400);
    expect(response.body.fields.axes).toBeTruthy();
  });

  test("every page has the surface button and script", async () => {
    for (const page of ["/index.html", "/security.html", "/intrusion.html"]) {
      const res = await request(app).get(page);
      expect(res.text).toContain("data-surface");
      expect(res.text).toContain('<script src="surface-view.js"></script>');
    }
    const i18n = await request(app).get("/i18n.json");
    expect(i18n.body.uk.common.surface.button).toBe("Поверхня відгуку");
    expect(i18n.body.en.common.surface.title).toContain("{output}");
  });
});
