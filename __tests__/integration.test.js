const request = require("supertest");
const app = require("../server");

describe("Unified controllers API", () => {
  test("trust calculate endpoint works", async () => {
    const response = await request(app)
      .post("/api/controllers/trust/calculate")
      .send({ errors: 0.25, connections: 50, bytes: 7.5 });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("value");
    expect(response.body).toHaveProperty("dominantTerm");
    expect(response.body).toHaveProperty("membershipData");
    expect(Array.isArray(response.body.aggregatedOutput)).toBe(true);
    expect(response.body.aggregatedOutput.length).toBeGreaterThan(0);
    expect(response.body.aggregatedOutput[0]).toHaveProperty("x");
    expect(response.body.aggregatedOutput[0]).toHaveProperty("y");
    expect(response.body.ruleOutputs).toHaveProperty("Medium");
    expect(response.body.ruleEvaluations).toHaveLength(27);
    expect(response.body.ruleEvaluations[13].out).toBe("Low");
    expect(response.body.ruleEvaluations[13].alpha).toBeCloseTo(1, 5);
  });

  test("security calculate endpoint works", async () => {
    const response = await request(app)
      .post("/api/controllers/security/calculate")
      .send({ energy: 0, strength: 0, response: 0 });

    expect(response.status).toBe(200);
    expect(response.body.value).toBe(0);
    expect(response.body.dominantTerm).toBe("none");
    expect(response.body.noRuleFired).toBe(false);
    expect(response.body.membershipData).toHaveProperty("risk");
    expect(response.body.ruleEvaluations).toHaveLength(6);
    expect(response.body.ruleEvaluations[0].out).toBe("none");
    expect(response.body.ruleEvaluations[0].alpha).toBeCloseTo(1, 5);
    expect(response.body.ruleEvaluations[0].tnorm).toBe("product");
    expect(response.body.weightedConsequents).toHaveLength(6);
    expect(response.body.weightedConsequents[0].normalizedWeight).toBeCloseTo(1, 6);
    expect(response.body.normalizedOutputs.none).toBeCloseTo(1, 6);
  });

  test("security calculate endpoint reports uncovered inputs", async () => {
    const response = await request(app)
      .post("/api/controllers/security/calculate")
      .send({ energy: 0.025, strength: 0, response: 0 });

    expect(response.status).toBe(200);
    expect(response.body.value).toBeNull();
    expect(response.body.dominantTerm).toBeNull();
    expect(response.body.noRuleFired).toBe(true);
  });

  test("intrusion calculate endpoint works", async () => {
    const response = await request(app)
      .post("/api/controllers/intrusion/calculate")
      .send({ packets: 9.5, rate: 15, weight: 141.5 });

    expect(response.status).toBe(200);
    expect(response.body.value).toBeGreaterThanOrEqual(0);
    expect(response.body.value).toBeLessThanOrEqual(100);
    expect(response.body.membershipData).toHaveProperty("intrusion");
    expect(response.body.ruleEvaluations).toHaveLength(12);
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

describe("API input validation", () => {
  const post = (body) => request(app).post("/api/controllers/trust/calculate").send(body);
  const valid = { errors: 0.25, connections: 50, bytes: 7.5 };

  test.each([
    ["null", { ...valid, errors: null }],
    ["empty string", { ...valid, errors: "" }],
    ["boolean", { ...valid, errors: true }],
    ["hex string", { ...valid, errors: "0x0" }],
    ["array", { ...valid, bytes: [7.5] }],
    ["object", { ...valid, bytes: { value: 7.5 } }],
    ["missing key", { errors: 0.25, connections: 50 }],
    ["out of range", { ...valid, connections: 201 }],
    ["text", { ...valid, errors: "abc" }],
  ])("rejects %s with 400 and names the field", async (_name, body) => {
    const response = await post(body);
    expect(response.status).toBe(400);
    expect(Object.keys(response.body.fields).length).toBeGreaterThan(0);
  });

  test("accepts decimal strings with a dot or a comma and returns numbers", async () => {
    const response = await post({ errors: "0,25", connections: "50", bytes: "7.5" });
    expect(response.status).toBe(200);
    expect(response.body.inputs).toEqual(valid);
    expect(response.body.value).toBe(25);
  });

  test("drops unknown keys from the echoed inputs", async () => {
    const response = await post({ ...valid, foo: "bar" });
    expect(response.status).toBe(200);
    expect(response.body.inputs).toEqual(valid);
  });
});
