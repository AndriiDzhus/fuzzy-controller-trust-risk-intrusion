// --- 1. Define Membership Functions (Helper functions for Trapezoidal and Triangular) ---

// Trapezoidal Membership Function
function trapezoidal(x, a, b, c, d) {
  if (x <= a || x >= d) return 0;
  if (x >= b && x <= c) return 1;
  if (x > a && x < b) return (x - a) / (b - a);
  if (x > c && x < d) return (d - x) / (d - c);
  return 0; // Should not be reached
}

// Triangular Membership Function
function triangular(x, a, b, c) {
  if (x <= a || x >= c) return 0;
  if (x >= a && x <= b) return (x - a) / (b - a);
  if (x > b && x <= c) return (c - x) / (c - b);
  return 0; // Should not be reached
}

// --- 2. Instantiate Fuzzy System and Define Variables & Membership Sets ---
const fuzzySystem = new Fuzzy.FuzzySystem();

// Input Variables: Connection Strength, Response Time, Energy Consumption
// Range: 0-100 for all inputs. Parameters for trapezoidal MFs are assumed.
const connectionStrength = new Fuzzy.InputVariable(
  "connectionStrength",
  0,
  100
);
connectionStrength.addFuzzySet(
  "Low",
  new Fuzzy.FuzzySet("Low", (x) => trapezoidal(x, 0, 0, 35, 60))
);
connectionStrength.addFuzzySet(
  "Medium",
  new Fuzzy.FuzzySet("Medium", (x) => trapezoidal(x, 30, 55, 75, 90))
);
connectionStrength.addFuzzySet(
  "High",
  new Fuzzy.FuzzySet("High", (x) => trapezoidal(x, 80, 95, 100, 100))
);
fuzzySystem.addInputVariable(connectionStrength);

const responseTime = new Fuzzy.InputVariable("responseTime", 0, 100);
responseTime.addFuzzySet(
  "Low",
  new Fuzzy.FuzzySet("Low", (x) => trapezoidal(x, 0, 0, 35, 60))
);
responseTime.addFuzzySet(
  "Medium",
  new Fuzzy.FuzzySet("Medium", (x) => trapezoidal(x, 30, 55, 75, 90))
);
responseTime.addFuzzySet(
  "High",
  new Fuzzy.FuzzySet("High", (x) => trapezoidal(x, 80, 95, 100, 100))
);
fuzzySystem.addInputVariable(responseTime);

const energyConsumption = new Fuzzy.InputVariable("energyConsumption", 0, 100);
energyConsumption.addFuzzySet(
  "Low",
  new Fuzzy.FuzzySet("Low", (x) => trapezoidal(x, 0, 0, 35, 60))
);
energyConsumption.addFuzzySet(
  "Medium",
  new Fuzzy.FuzzySet("Medium", (x) => trapezoidal(x, 30, 55, 75, 90))
);
energyConsumption.addFuzzySet(
  "High",
  new Fuzzy.FuzzySet("High", (x) => trapezoidal(x, 80, 95, 100, 100))
);
fuzzySystem.addInputVariable(energyConsumption);

// Output Variable: Security Risk Level
// Range: 0-100. Parameters for triangular MFs are assumed.
const securityRiskLevel = new Fuzzy.OutputVariable("securityRiskLevel", 0, 100);
securityRiskLevel.addFuzzySet(
  "VeryLow",
  new Fuzzy.FuzzySet("VeryLow", (x) => triangular(x, 0, 0, 20))
);
securityRiskLevel.addFuzzySet(
  "Low",
  new Fuzzy.FuzzySet("Low", (x) => triangular(x, 10, 30, 50))
);
securityRiskLevel.addFuzzySet(
  "Medium",
  new Fuzzy.FuzzySet("Medium", (x) => triangular(x, 40, 60, 80))
);
securityRiskLevel.addFuzzySet(
  "High",
  new Fuzzy.FuzzySet("High", (x) => triangular(x, 70, 90, 100))
);
securityRiskLevel.addFuzzySet(
  "VeryHigh",
  new Fuzzy.FuzzySet("VeryHigh", (x) => triangular(x, 85, 100, 100))
);
fuzzySystem.addOutputVariable(securityRiskLevel);

// --- 3. Define Fuzzy Rules (Based on "База правил.docx.pdf") ---
// Note: fuzzyIS uses Fuzzy.Rule which is simplified.
// For Mamdani, you typically define an aggregation (AND), implication (MIN), and accumulation (MAX).
// The fuzzyIS library's default Rule evaluation and defuzzification often align with Mamdani.

// Helper to create a rule
function createRule(connStr, resTime, engCons, secRisk) {
  const rule = new Fuzzy.Rule();
  rule.addAntecedent(connectionStrength.getFuzzySet(connStr));
  rule.addAntecedent(responseTime.getFuzzySet(resTime));
  rule.addAntecedent(energyConsumption.getFuzzySet(engCons));
  rule.setConsequent(securityRiskLevel.getFuzzySet(secRisk));
  fuzzySystem.addRule(rule);
}

// Adding all 27 rules from "База правил.docx.pdf" [1]
// Format: createRule(connection_strength, response_time, energy_consumption, security_risk_level);
createRule("Low", "Low", "Low", "High");
createRule("Low", "Low", "Medium", "High");
createRule("Low", "Low", "High", "High");
createRule("Low", "Medium", "Low", "High");
createRule("Low", "Medium", "Medium", "VeryHigh");
createRule("Low", "Medium", "High", "VeryHigh");
createRule("Low", "High", "Low", "High");
createRule("Low", "High", "Medium", "VeryHigh");
createRule("Low", "High", "High", "VeryHigh");

createRule("Medium", "Low", "Low", "VeryLow");
createRule("Medium", "Low", "Medium", "Medium");
createRule("Medium", "Low", "High", "Medium");
createRule("Medium", "Medium", "Low", "Low");
createRule("Medium", "Medium", "Medium", "Medium");
createRule("Medium", "Medium", "High", "High");
createRule("Medium", "High", "Low", "Medium");
createRule("Medium", "High", "Medium", "Medium");
createRule("Medium", "High", "High", "VeryHigh");

createRule("High", "Low", "Low", "VeryLow");
createRule("High", "Low", "Medium", "VeryLow");
createRule("High", "Low", "High", "Low");
createRule("High", "Medium", "Low", "VeryLow");
createRule("High", "Medium", "Medium", "VeryLow");
createRule("High", "Medium", "High", "Low");
createRule("High", "High", "Low", "Low");
createRule("High", "High", "Medium", "Low");
createRule("High", "High", "High", "Low");

// --- 4. Get UI Elements and Set up Event Listener ---
const connectionStrengthInput = document.getElementById("connectionStrength");
const responseTimeInput = document.getElementById("responseTime");
const energyConsumptionInput = document.getElementById("energyConsumption");
const calculateBtn = document.getElementById("calculateBtn");
const securityRiskOutputSpan = document.getElementById("securityRiskOutput");
const activeOutputTermSpan = document.getElementById("activeOutputTerm");

// Canvas elements for graphing
const connectionStrengthCanvas = document.getElementById(
  "connectionStrengthCanvas"
);
const responseTimeCanvas = document.getElementById("responseTimeCanvas");
const energyConsumptionCanvas = document.getElementById(
  "energyConsumptionCanvas"
);
const securityRiskCanvas = document.getElementById("securityRiskCanvas");

const csCtx = connectionStrengthCanvas.getContext("2d");
const rtCtx = responseTimeCanvas.getContext("2d");
const ecCtx = energyConsumptionCanvas.getContext("2d");
const srCtx = securityRiskCanvas.getContext("2d");

calculateBtn.addEventListener("click", calculateAndDisplayFuzzyOutput);
connectionStrengthInput.addEventListener(
  "input",
  calculateAndDisplayFuzzyOutput
);
responseTimeInput.addEventListener("input", calculateAndDisplayFuzzyOutput);
energyConsumptionInput.addEventListener(
  "input",
  calculateAndDisplayFuzzyOutput
);

// --- 5. Main Calculation and Display Function ---
function calculateAndDisplayFuzzyOutput() {
  const connectionStrengthVal = parseFloat(connectionStrengthInput.value);
  const responseTimeVal = parseFloat(responseTimeInput.value);
  const energyConsumptionVal = parseFloat(energyConsumptionInput.value);

  if (
    isNaN(connectionStrengthVal) ||
    isNaN(responseTimeVal) ||
    isNaN(energyConsumptionVal)
  ) {
    securityRiskOutputSpan.textContent = "Invalid input";
    activeOutputTermSpan.textContent = "--";
    return;
  }

  // Set input values for the fuzzy system
  connectionStrength.setValue(connectionStrengthVal);
  responseTime.setValue(responseTimeVal);
  energyConsumption.setValue(energyConsumptionVal);

  // Perform fuzzy inference
  // fuzzyIS automatically fuzzifies, infers, and defuzzifies when getValue() is called on output variable
  const crispOutput = securityRiskLevel.getValue(); // This triggers the entire fuzzy process
  securityRiskOutputSpan.textContent = crispOutput.toFixed(2);

  // Determine the most active output term for highlighting
  let maxMembership = -1;
  let mostActiveTerm = "N/A";
  let outputVariable = fuzzySystem.getOutputVariable("securityRiskLevel");

  for (const setName in outputVariable.fuzzySets) {
    if (outputVariable.fuzzySets.hasOwnProperty(setName)) {
      const fuzzySet = outputVariable.fuzzySets[setName];
      // Calculate membership for the crisp output value
      const membership = fuzzySet.calculate(crispOutput);
      if (membership > maxMembership) {
        maxMembership = membership;
        mostActiveTerm = setName;
      }
    }
  }
  activeOutputTermSpan.textContent = mostActiveTerm;

  // Redraw graphs with current values
  drawAllGraphs(
    connectionStrengthVal,
    responseTimeVal,
    energyConsumptionVal,
    crispOutput,
    mostActiveTerm
  );
}
// Step 4: Implement Visualization (Graphing)
// For visualization, you'll draw the membership functions on canvas elements. This will involve iterating through the range of values (0-100), calculating the membership degree for each linguistic term, and drawing lines to represent the trapezoidal and triangular shapes. You'll then mark the current input/output value on its respective graph.
// script.js (continued)

// --- 6. Graphing Functions ---

function drawMembershipFunctionGraph(
  canvas,
  ctx,
  variable,
  currentValue,
  highlightTerm = null
) {
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  // Draw axes
  ctx.beginPath();
  ctx.strokeStyle = "#999";
  ctx.lineWidth = 1;
  ctx.moveTo(0, height - 20); // X-axis
  ctx.lineTo(width, height - 20);
  ctx.moveTo(20, 0); // Y-axis
  ctx.lineTo(20, height - 20);
  ctx.stroke();

  // Draw labels for axes (simplified for 0-100 range)
  ctx.fillStyle = "#333";
  ctx.font = "10px Arial";
  ctx.fillText("0", 10, height - 5);
  ctx.fillText("100", width - 25, height - 5);
  ctx.fillText("1.0", 5, 10); // Max membership degree

  // Iterate through fuzzy sets and draw their curves
  const fuzzySets = variable.fuzzySets;
  const step = (variable.max - variable.min) / (width - 40); // Convert pixel x to variable value
  const colors = {
    Low: "blue",
    Medium: "green",
    High: "red",
    VeryLow: "darkblue",
    VeryHigh: "darkred",
  };

  for (const setName in fuzzySets) {
    if (fuzzySets.hasOwnProperty(setName)) {
      const fuzzySet = fuzzySets[setName];
      ctx.beginPath();
      ctx.strokeStyle = colors[setName] || "purple";
      ctx.lineWidth = 2;
      if (setName === highlightTerm) {
        ctx.lineWidth = 4; // Make highlighted term thicker
        ctx.strokeStyle = "orange"; // Change color for highlighted term
      }

      // Draw curve by sampling points
      for (let i = 0; i <= width - 40; i++) {
        const xVal = variable.min + i * step;
        const yVal = fuzzySet.calculate(xVal);
        const plotX = i + 20; // Offset for axis
        const plotY = height - 20 - yVal * (height - 40); // Scale to canvas height

        if (i === 0) {
          ctx.moveTo(plotX, plotY);
        } else {
          ctx.lineTo(plotX, plotY);
        }
      }
      ctx.stroke();
      // Label the fuzzy set
      const labelX = width / 2; // Approximate center for label
      const labelY =
        height -
        20 -
        fuzzySet.calculate(variable.min + (variable.max - variable.min) / 2) *
          (height - 40) -
        10;
      ctx.fillStyle = colors[setName] || "purple";
      ctx.fillText(setName, labelX, labelY);
      ctx.fillStyle = "#333"; // Reset color
    }
  }

  // Draw current value marker
  if (currentValue !== undefined && currentValue !== null) {
    const plotX =
      20 +
      ((currentValue - variable.min) / (variable.max - variable.min)) *
        (width - 40);
    ctx.beginPath();
    ctx.strokeStyle = "black";
    ctx.lineWidth = 2;
    ctx.setLineDash([19, 19]); // Dashed line
    ctx.moveTo(plotX, height - 20);
    ctx.lineTo(plotX, 0);
    ctx.stroke();
    ctx.setLineDash([]); // Reset line dash

    ctx.fillStyle = "black";
    ctx.fillText(currentValue.toFixed(1), plotX - 15, height - 5);
  }
}

function drawAllGraphs(csVal, rtVal, ecVal, srVal, activeTerm) {
  drawMembershipFunctionGraph(
    connectionStrengthCanvas,
    csCtx,
    connectionStrength,
    csVal
  );
  drawMembershipFunctionGraph(responseTimeCanvas, rtCtx, responseTime, rtVal);
  drawMembershipFunctionGraph(
    energyConsumptionCanvas,
    ecCtx,
    energyConsumption,
    ecVal
  );
  drawMembershipFunctionGraph(
    securityRiskCanvas,
    srCtx,
    securityRiskLevel,
    srVal,
    activeTerm
  );
}

// Initial draw when page loads
document.addEventListener("DOMContentLoaded", () => {
  // Manually trigger the calculation to draw initial graphs
  calculateAndDisplayFuzzyOutput();
});
