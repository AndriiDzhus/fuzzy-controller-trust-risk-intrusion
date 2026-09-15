const request = require("supertest");
const app = require("../server");

describe("Unified controllers API", () => {
  test("trust calculate endpoint works", async () => {
    const response = await request(app)
      .post("/api/controllers/trust/calculate")
      .send({ errors: 50, connections: 50, bytes: 50 });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("value");
    expect(response.body).toHaveProperty("dominantTerm");
    expect(response.body).toHaveProperty("membershipData");
    expect(Array.isArray(response.body.aggregatedOutput)).toBe(true);
    expect(response.body.aggregatedOutput.length).toBeGreaterThan(0);
    expect(response.body.aggregatedOutput[0]).toHaveProperty("x");
    expect(response.body.aggregatedOutput[0]).toHaveProperty("y");
  });

  test("security calculate endpoint works", async () => {
    const response = await request(app)
      .post("/api/controllers/security/calculate")
      .send({ energy: 0, strength: 100, response: 0 });

    expect(response.status).toBe(200);
    expect(response.body.value).toBe(0);
    expect(response.body.dominantTerm).toBe("none");
    expect(response.body.noRuleFired).toBe(false);
    expect(response.body.membershipData).toHaveProperty("risk");
  });

  test("security calculate endpoint reports uncovered inputs", async () => {
    const response = await request(app)
      .post("/api/controllers/security/calculate")
      .send({ energy: 50, strength: 50, response: 50 });

    expect(response.status).toBe(200);
    expect(response.body.value).toBeNull();
    expect(response.body.dominantTerm).toBeNull();
    expect(response.body.noRuleFired).toBe(true);
  });

  test("intrusion calculate endpoint works", async () => {
    const response = await request(app)
      .post("/api/controllers/intrusion/calculate")
      .send({ packets: 80, rate: 35, delivery: 60 });

    expect(response.status).toBe(200);
    expect(response.body.value).toBeGreaterThanOrEqual(0);
    expect(response.body.value).toBeLessThanOrEqual(100);
    expect(response.body.membershipData).toHaveProperty("intrusion");
  });

  test("membership functions endpoint works for each controller", async () => {
    const trustMF = await request(app).get("/api/controllers/trust/membership-functions");
    const securityMF = await request(app).get("/api/controllers/security/membership-functions");
    const intrusionMF = await request(app).get("/api/controllers/intrusion/membership-functions");

    expect(trustMF.status).toBe(200);
    expect(securityMF.status).toBe(200);
    expect(intrusionMF.status).toBe(200);

    expect(trustMF.body).toHaveProperty("inputs");
    expect(securityMF.body.meta).toHaveProperty("singletonValues");
    expect(intrusionMF.body.output).toHaveProperty("intrusion");
  });
});
