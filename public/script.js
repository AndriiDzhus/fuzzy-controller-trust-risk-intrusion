// Глобальні змінні для зберігання даних
let membershipFunctions = null;
let currentCalculation = null;

// DOM елементи
const connectionStrengthInput = document.getElementById("connectionStrength");
const responseTimeInput = document.getElementById("responseTime");
const energyConsumptionInput = document.getElementById("energyConsumption");
const calculateBtn = document.getElementById("calculateBtn");
const securityRiskOutputSpan = document.getElementById("securityRiskOutput");
const activeOutputTermSpan = document.getElementById("activeOutputTerm");

// Елементи для відображення значень
const csValue = document.getElementById("csValue");
const rtValue = document.getElementById("rtValue");
const ecValue = document.getElementById("ecValue");

// Canvas елементи для графіків
const connectionStrengthCanvas = document.getElementById(
  "connectionStrengthCanvas"
);
const responseTimeCanvas = document.getElementById("responseTimeCanvas");
const energyConsumptionCanvas = document.getElementById(
  "energyConsumptionCanvas"
);
const securityRiskCanvas = document.getElementById("securityRiskCanvas");

// Контексти для малювання
const canvases = {
  connectionStrength: {
    canvas: connectionStrengthCanvas,
    ctx: connectionStrengthCanvas.getContext("2d"),
  },
  responseTime: {
    canvas: responseTimeCanvas,
    ctx: responseTimeCanvas.getContext("2d"),
  },
  energyConsumption: {
    canvas: energyConsumptionCanvas,
    ctx: energyConsumptionCanvas.getContext("2d"),
  },
  securityRiskLevel: {
    canvas: securityRiskCanvas,
    ctx: securityRiskCanvas.getContext("2d"),
  },
};

// Кольори для різних термів
const colors = {
  Low: "#3498db",
  Medium: "#f39c12",
  High: "#e74c3c",
  VeryLow: "#9b59b6",
  VeryHigh: "#c0392b",
};

// Event listeners
calculateBtn.addEventListener("click", calculateAndDisplayFuzzyOutput);
connectionStrengthInput.addEventListener("input", () => {
  csValue.textContent = connectionStrengthInput.value;
  debounceCalculation();
});
responseTimeInput.addEventListener("input", () => {
  rtValue.textContent = responseTimeInput.value;
  debounceCalculation();
});
energyConsumptionInput.addEventListener("input", () => {
  ecValue.textContent = energyConsumptionInput.value;
  debounceCalculation();
});

// Debounce для автоматичного перерахунку
let debounceTimer;
function debounceCalculation() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(calculateAndDisplayFuzzyOutput, 300);
}

// Завантаження функцій приналежності при ініціалізації
async function loadMembershipFunctions() {
  try {
    const response = await fetch("/api/membership-functions");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    membershipFunctions = await response.json();
    drawAllGraphs();
    return true;
  } catch (error) {
    console.error("Error loading membership functions:", error);
    showError("Помилка завантаження функцій приналежності");
    return false;
  }
}

// Основна функція для обчислення та відображення результату
async function calculateAndDisplayFuzzyOutput() {
  const connectionStrengthVal = parseFloat(connectionStrengthInput.value);
  const responseTimeVal = parseFloat(responseTimeInput.value);
  const energyConsumptionVal = parseFloat(energyConsumptionInput.value);

  // Валідація вхідних даних
  if (
    isNaN(connectionStrengthVal) ||
    isNaN(responseTimeVal) ||
    isNaN(energyConsumptionVal)
  ) {
    showError("Некоректні вхідні дані");
    return;
  }

  if (
    connectionStrengthVal < 0 ||
    connectionStrengthVal > 100 ||
    responseTimeVal < 0 ||
    responseTimeVal > 100 ||
    energyConsumptionVal < 0 ||
    energyConsumptionVal > 100
  ) {
    showError("Всі значення повинні бути в діапазоні 0-100");
    return;
  }

  // Показати індикатор завантаження
  calculateBtn.classList.add("loading");

  try {
    const response = await fetch("/api/calculate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        connectionStrength: connectionStrengthVal,
        responseTime: responseTimeVal,
        energyConsumption: energyConsumptionVal,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    currentCalculation = result;

    // Відображення результатів
    securityRiskOutputSpan.textContent = result.securityRisk;
    activeOutputTermSpan.textContent = translateTerm(result.mostActiveTerm);

    // Оновлення відображення приналежності
    updateMembershipDisplay(result.membershipData);

    // Перемалювання графіків з поточними значеннями
    drawAllGraphs(
      connectionStrengthVal,
      responseTimeVal,
      energyConsumptionVal,
      result.securityRisk,
      result.mostActiveTerm
    );

    // Очистити повідомлення про помилку
    clearError();
  } catch (error) {
    console.error("Error calculating result:", error);
    showError("Помилка при обчисленні результату");
  } finally {
    calculateBtn.classList.remove("loading");
  }
}

// Функція для відображення значень приналежності
function updateMembershipDisplay(membershipData) {
  updateMembershipSection("csMembership", membershipData.connectionStrength);
  updateMembershipSection("rtMembership", membershipData.responseTime);
  updateMembershipSection("ecMembership", membershipData.energyConsumption);
  updateMembershipSection("srMembership", membershipData.securityRiskLevel);
}

function updateMembershipSection(elementId, data) {
  const container = document.getElementById(elementId);
  container.innerHTML = "";

  // Знаходимо максимальне значення для виділення
  let maxValue = -1;
  let maxKey = "";
  for (const [key, value] of Object.entries(data)) {
    if (value > maxValue) {
      maxValue = value;
      maxKey = key;
    }
  }

  for (const [term, value] of Object.entries(data)) {
    const item = document.createElement("div");
    item.className = `membership-item ${
      term === maxKey && value > 0.1 ? "active" : ""
    }`;

    item.innerHTML = `
            <span class="membership-label">${translateTerm(term)}</span>
            <span class="membership-value">${value.toFixed(3)}</span>
        `;

    container.appendChild(item);
  }
}

// Функція для перекладу термів
function translateTerm(term) {
  const translations = {
    Low: "Низький",
    Medium: "Середній",
    High: "Високий",
    VeryLow: "Дуже Низький",
    VeryHigh: "Дуже Високий",
  };
  return translations[term] || term;
}

// Функції для малювання графіків
function drawAllGraphs(
  csVal = null,
  rtVal = null,
  ecVal = null,
  srVal = null,
  activeTerm = null
) {
  if (!membershipFunctions) return;

  drawMembershipGraph("connectionStrength", csVal, activeTerm);
  drawMembershipGraph("responseTime", rtVal, activeTerm);
  drawMembershipGraph("energyConsumption", ecVal, activeTerm);
  drawMembershipGraph("securityRiskLevel", srVal, activeTerm);
}

function drawMembershipGraph(
  variableName,
  currentValue = null,
  highlightTerm = null
) {
  if (!membershipFunctions) return;

  const isOutput = variableName === "securityRiskLevel";
  const data = isOutput
    ? membershipFunctions.output[variableName]
    : membershipFunctions.inputs[variableName];
  const canvasInfo = canvases[variableName];

  if (!canvasInfo || !data) return;

  const { canvas, ctx } = canvasInfo;
  const width = canvas.width;
  const height = canvas.height;

  // Очистити canvas
  ctx.clearRect(0, 0, width, height);

  // Налаштування для малювання
  const padding = 40;
  const graphWidth = width - 2 * padding;
  const graphHeight = height - 2 * padding;

  // Малювання осей
  drawAxes(ctx, padding, width, height, graphWidth, graphHeight);

  // Малювання функцій приналежності
  for (const [termName, points] of Object.entries(data)) {
    const color = colors[termName] || "#333";
    const isHighlighted = termName === highlightTerm;

    drawMembershipCurve(
      ctx,
      points,
      padding,
      graphWidth,
      graphHeight,
      color,
      isHighlighted
    );

    // Додати підпис терма
    drawTermLabel(ctx, termName, color, padding, graphWidth);
  }

  // Малювання поточного значення
  if (currentValue !== null) {
    drawCurrentValueMarker(ctx, currentValue, padding, graphWidth, graphHeight);
  }

  // Додати підписи осей
  drawAxisLabels(ctx, width, height, padding);
}

function drawAxes(ctx, padding, width, height, graphWidth, graphHeight) {
  ctx.beginPath();
  ctx.strokeStyle = "#bdc3c7";
  ctx.lineWidth = 2;

  // X-вісь
  ctx.moveTo(padding, height - padding);
  ctx.lineTo(width - padding, height - padding);

  // Y-вісь
  ctx.moveTo(padding, height - padding);
  ctx.lineTo(padding, padding);

  ctx.stroke();

  // Сітка
  ctx.beginPath();
  ctx.strokeStyle = "#ecf0f1";
  ctx.lineWidth = 1;

  // Вертикальні лінії сітки
  for (let i = 1; i <= 4; i++) {
    const x = padding + (graphWidth * i) / 4;
    ctx.moveTo(x, padding);
    ctx.lineTo(x, height - padding);
  }

  // Горизонтальні лінії сітки
  for (let i = 1; i <= 4; i++) {
    const y = padding + (graphHeight * i) / 4;
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
  }

  ctx.stroke();
}

function drawMembershipCurve(
  ctx,
  points,
  padding,
  graphWidth,
  graphHeight,
  color,
  isHighlighted
) {
  if (points.length === 0) return;

  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = isHighlighted ? 4 : 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  points.forEach((point, index) => {
    const x = padding + (point.x / 100) * graphWidth;
    const y = padding + graphHeight - point.y * graphHeight;

    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.stroke();

  // Заливка під кривою для виділеного терма
  if (isHighlighted) {
    ctx.beginPath();
    ctx.fillStyle = color + "20"; // Прозорість 20%

    points.forEach((point, index) => {
      const x = padding + (point.x / 100) * graphWidth;
      const y = padding + graphHeight - point.y * graphHeight;

      if (index === 0) {
        ctx.moveTo(x, padding + graphHeight);
        ctx.lineTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.lineTo(
      padding + (points[points.length - 1].x / 100) * graphWidth,
      padding + graphHeight
    );
    ctx.closePath();
    ctx.fill();
  }
}

function drawTermLabel(ctx, termName, color, padding, graphWidth) {
  ctx.fillStyle = color;
  ctx.font = "bold 12px Arial";
  ctx.textAlign = "center";

  // Позиціонування підписів
  const positions = {
    Low: 0.2,
    VeryLow: 0.1,
    Medium: 0.5,
    High: 0.8,
    VeryHigh: 0.9,
  };

  const position = positions[termName] || 0.5;
  const x = padding + graphWidth * position;
  const y = padding - 10;

  ctx.fillText(translateTerm(termName), x, y);
}

function drawCurrentValueMarker(ctx, value, padding, graphWidth, graphHeight) {
  const x = padding + (value / 100) * graphWidth;

  ctx.beginPath();
  ctx.strokeStyle = "#2c3e50";
  ctx.lineWidth = 3;
  ctx.setLineDash([5, 5]);

  ctx.moveTo(x, padding);
  ctx.lineTo(x, padding + graphHeight);
  ctx.stroke();
  ctx.setLineDash([]);

  // Підпис значення
  ctx.fillStyle = "#2c3e50";
  ctx.font = "bold 14px Arial";
  ctx.textAlign = "center";
  ctx.fillText(value.toFixed(1), x, padding + graphHeight + 20);
}

function drawAxisLabels(ctx, width, height, padding) {
  ctx.fillStyle = "#7f8c8d";
  ctx.font = "12px Arial";
  ctx.textAlign = "center";

  // Підписи для X-осі
  ctx.fillText("0", padding, height - padding + 20);
  ctx.fillText("50", width / 2, height - padding + 20);
  ctx.fillText("100", width - padding, height - padding + 20);

  // Підписи для Y-осі
  ctx.save();
  ctx.translate(15, height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Ступінь приналежності", 0, 0);
  ctx.restore();

  ctx.fillText("1.0", padding - 20, padding + 5);
  ctx.fillText("0.5", padding - 20, height / 2 + 5);
  ctx.fillText("0.0", padding - 20, height - padding + 5);
}

// Функції для показу помилок
function showError(message) {
  // Видалити попередні повідомлення про помилки
  clearError();

  const errorDiv = document.createElement("div");
  errorDiv.className = "error";
  errorDiv.textContent = message;
  errorDiv.id = "error-message";

  const container = document.querySelector(".container");
  container.insertBefore(errorDiv, container.firstChild);
}

function clearError() {
  const errorMessage = document.getElementById("error-message");
  if (errorMessage) {
    errorMessage.remove();
  }
}

// Ініціалізація при завантаженні сторінки
document.addEventListener("DOMContentLoaded", async () => {
  console.log("Ініціалізація додатку...");

  // Завантажити функції приналежності
  const loaded = await loadMembershipFunctions();

  if (loaded) {
    // Встановити початкові значення
    csValue.textContent = connectionStrengthInput.value;
    rtValue.textContent = responseTimeInput.value;
    ecValue.textContent = energyConsumptionInput.value;

    // Виконати початковий розрахунок
    await calculateAndDisplayFuzzyOutput();

    console.log("Додаток успішно ініціалізовано");
  } else {
    showError("Не вдалося ініціалізувати додаток");
  }
});

// Функція для експорту результатів (додаткова функціональність)
function exportResults() {
  if (!currentCalculation) {
    showError("Немає даних для експорту");
    return;
  }

  const data = {
    inputs: {
      connectionStrength: parseFloat(connectionStrengthInput.value),
      responseTime: parseFloat(responseTimeInput.value),
      energyConsumption: parseFloat(energyConsumptionInput.value),
    },
    output: {
      securityRisk: currentCalculation.securityRisk,
      mostActiveTerm: currentCalculation.mostActiveTerm,
    },
    membershipValues: currentCalculation.membershipData,
    timestamp: new Date().toISOString(),
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fuzzy_results_${new Date()
    .toISOString()
    .slice(0, 19)
    .replace(/:/g, "-")}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
