const fs = require("fs");
const path = require("path");
const { train, ANCHOR_RULES, infer } = require("../anfis/securityAnfis");

const outPath = path.join(__dirname, "..", "anfis", "security-weights.json");
const weights = train({ samples: 800, seed: 42 });

const anchors = ANCHOR_RULES.map((rule) => {
  const inputs = {
    energy: { low: 0, medium: 40, high: 100 }[rule.E],
    strength: { low: 0, medium: 60, high: 100 }[rule.S],
    response: { low: 0, medium: 50, high: 100 }[rule.T],
  };
  const predicted = infer(inputs, weights).value;
  return {
    rule: `${rule.E}/${rule.S}/${rule.T}`,
    target: rule.r,
    predicted: Number(predicted.toFixed(2)),
  };
});

fs.writeFileSync(outPath, `${JSON.stringify(weights, null, 2)}\n`);

console.log(`ANFIS weights written to ${path.relative(process.cwd(), outPath)}`);
console.log("Anchor fit:");
anchors.forEach((row) => {
  console.log(`  ${row.rule}: target ${row.target} → ${row.predicted}`);
});
