// --- Fuzzy Controller Client using Server API ---
// Глобальні змінні для зберігання даних від сервера
let membershipFunctionsData = null;
let currentCalculation = null;

// --- DOM Elements and Variables ---
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

// Tooltip елементи
const tooltips = {
  connectionStrength: document.getElementById("csTooltip"),
  responseTime: document.getElementById("rtTooltip"),
  energyConsumption: document.getElementById("ecTooltip"),
  securityRiskLevel: document.getElementById("srTooltip"),
};

// --- API Functions ---
// Функція для отримання даних функцій приналежності з сервера
async function loadMembershipFunctions() {
  try {
    const response = await fetch("/api/membership-functions");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    membershipFunctionsData = await response.json();
    console.log(
      "Membership functions loaded from server:",
      membershipFunctionsData
    );
  } catch (error) {
    console.error("Error loading membership functions:", error);
    showError("Помилка завантаження даних з сервера");
  }
}

// Функція для відправки запиту на обчислення результату
async function calculateFuzzyResult(
  connectionStrength,
  responseTime,
  energyConsumption
) {
  try {
    const response = await fetch("/api/calculate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        connectionStrength,
        responseTime,
        energyConsumption,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        errorData.error || `HTTP error! status: ${response.status}`
      );
    }

    const result = await response.json();
    console.log("Calculation result from server:", result);
    return result;
  } catch (error) {
    console.error("Error calculating fuzzy result:", error);
    throw error;
  }
}

// --- Event Listeners ---
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

// --- Main Calculation Function ---
async function calculateAndDisplayFuzzyOutput() {
  console.log("🧮 Початок обчислення...");

  const connectionStrengthVal = parseFloat(connectionStrengthInput.value);
  const responseTimeVal = parseFloat(responseTimeInput.value);
  const energyConsumptionVal = parseFloat(energyConsumptionInput.value);

  console.log("📊 Вхідні дані:", {
    connectionStrengthVal,
    responseTimeVal,
    energyConsumptionVal,
  });

  // Валідація вхідних даних
  if (
    isNaN(connectionStrengthVal) ||
    isNaN(responseTimeVal) ||
    isNaN(energyConsumptionVal)
  ) {
    console.error("❌ Некоректні вхідні дані");
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
    console.error("❌ Значення поза діапазоном 0-100");
    showError("Всі значення повинні бути в діапазоні 0-100");
    return;
  }

  try {
    console.log("📡 Відправка запиту на сервер...");
    // Відправляємо запит на сервер для обчислення
    const result = await calculateFuzzyResult(
      connectionStrengthVal,
      responseTimeVal,
      energyConsumptionVal
    );

    console.log("✅ Результат отримано:", result);

    // Зберігаємо результат
    currentCalculation = {
      securityRisk: result.securityRisk,
      mostActiveTerm: result.mostActiveTerm,
      membershipData: result.membershipData,
      inputValues: result.inputValues,
    };

    console.log("💾 Збережено результат:", currentCalculation);

    // Відображення результатів
    securityRiskOutputSpan.textContent = currentCalculation.securityRisk;
    activeOutputTermSpan.textContent = translateTerm(
      currentCalculation.mostActiveTerm
    );

    console.log("📝 Оновлено UI результатів");

    // Оновлення відображення приналежності
    updateMembershipDisplay(currentCalculation.membershipData);

    console.log("📊 Оновлено відображення приналежності");

    // Перемалювання графіків з поточними значеннями
    drawAllGraphs(
      connectionStrengthVal,
      responseTimeVal,
      energyConsumptionVal,
      currentCalculation.securityRisk,
      currentCalculation.mostActiveTerm
    );

    // Очистити повідомлення про помилку
    clearError();

    console.log("✅ Обчислення завершено успішно");
  } catch (error) {
    console.error("❌ Error calculating result:", error);
    showError("Помилка при обчисленні результату: " + error.message);
  }
}

// --- Display Functions ---
// Функція для відображення значень приналежності
function updateMembershipDisplay(membershipData) {
  updateMembershipSection("csMembership", membershipData.connectionStrength);
  updateMembershipSection("rtMembership", membershipData.responseTime);
  updateMembershipSection("ecMembership", membershipData.energyConsumption);
  updateMembershipSection("srMembership", membershipData.securityRiskLevel);
}

function updateMembershipSection(elementId, data) {
  const container = document.getElementById(elementId);
  if (!container) return;

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

// --- Graph Drawing Functions ---
function drawAllGraphs(
  csVal = null,
  rtVal = null,
  ecVal = null,
  srVal = null,
  activeTerm = null
) {
  console.log("🎨 Малювання графіків:", {
    csVal,
    rtVal,
    ecVal,
    srVal,
    activeTerm,
  });

  if (!membershipFunctionsData) {
    console.warn("⚠️ Membership functions data not loaded yet");
    return;
  }

  console.log("📊 Дані для малювання:", membershipFunctionsData);

  drawMembershipGraph("connectionStrength", csVal, activeTerm);
  drawMembershipGraph("responseTime", rtVal, activeTerm);
  drawMembershipGraph("energyConsumption", ecVal, activeTerm);
  drawMembershipGraph("securityRiskLevel", srVal, activeTerm);

  console.log("✅ Графіки намальовані");
}

function drawMembershipGraph(
  variableName,
  currentValue = null,
  highlightTerm = null
) {
  const canvasInfo = canvases[variableName];

  if (!canvasInfo || !membershipFunctionsData) return;

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

  // Отримуємо дані для змінної з сервера
  const variableData =
    variableName === "securityRiskLevel"
      ? membershipFunctionsData.output[variableName]
      : membershipFunctionsData.inputs[variableName];

  if (!variableData) return;

  // Малювання функцій приналежності
  Object.keys(variableData).forEach((termName) => {
    const points = variableData[termName];
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
  });

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
  if (!points || points.length === 0) return;

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

// --- Error Handling Functions ---
function showError(message) {
  // Видалити попередні повідомлення про помилки
  clearError();

  const errorDiv = document.createElement("div");
  errorDiv.className = "error";
  errorDiv.textContent = message;
  errorDiv.id = "error-message";

  const container = document.querySelector(".container");
  if (container) {
    container.insertBefore(errorDiv, container.firstChild);
  }
}

function clearError() {
  const errorMessage = document.getElementById("error-message");
  if (errorMessage) {
    errorMessage.remove();
  }
}

// --- Tooltip Functions ---
function setupCanvasTooltips() {
  Object.keys(canvases).forEach((variableName) => {
    const { canvas } = canvases[variableName];
    const tooltip = tooltips[variableName];

    if (!tooltip) return;

    canvas.addEventListener("mousemove", (event) => {
      handleCanvasMouseMove(event, variableName, canvas, tooltip);
    });

    canvas.addEventListener("mouseleave", () => {
      hideTooltip(tooltip);
    });
  });
}

function handleCanvasMouseMove(event, variableName, canvas, tooltip) {
  if (!membershipFunctionsData) return;

  const rect = canvas.getBoundingClientRect();
  const mouseX = event.clientX - rect.left;
  const mouseY = event.clientY - rect.top;

  // Розрахуємо координати відносно графіка
  const padding = 40;
  const graphWidth = canvas.width - 2 * padding;
  const graphHeight = canvas.height - 2 * padding;

  // Перевіримо, чи курсор знаходиться в межах графіка
  if (
    mouseX < padding ||
    mouseX > canvas.width - padding ||
    mouseY < padding ||
    mouseY > canvas.height - padding
  ) {
    hideTooltip(tooltip);
    return;
  }

  // Конвертуємо координати курсора в значення графіка
  const xValue = ((mouseX - padding) / graphWidth) * 100;

  // Знайдемо значення функцій приналежності
  const membershipInfo = getMembershipInfoAtX(variableName, xValue);

  showTooltip(tooltip, event.clientX, event.clientY, xValue, membershipInfo);
}

function getMembershipInfoAtX(variableName, xValue) {
  if (!membershipFunctionsData) return null;

  const variableData =
    variableName === "securityRiskLevel"
      ? membershipFunctionsData.output[variableName]
      : membershipFunctionsData.inputs[variableName];

  if (!variableData) return null;

  const info = {};

  Object.keys(variableData).forEach((termName) => {
    const points = variableData[termName];

    // Знаходимо найближчу точку до xValue
    let closestPoint = points[0];
    let minDistance = Math.abs(points[0].x - xValue);

    for (const point of points) {
      const distance = Math.abs(point.x - xValue);
      if (distance < minDistance) {
        minDistance = distance;
        closestPoint = point;
      }
    }

    info[termName] = {
      x: xValue,
      y: closestPoint.y,
      color: colors[termName] || "#333",
    };
  });

  return info;
}

function showTooltip(tooltip, mouseX, mouseY, xValue, membershipInfo) {
  if (!tooltip) return;

  let content = `<strong>Координати:</strong><br>X: ${xValue.toFixed(1)}<br>`;

  if (membershipInfo) {
    content +=
      '<hr style="margin: 6px 0; border: none; border-top: 1px solid rgba(255,255,255,0.3);">';
    content += "<strong>Функції приналежності:</strong><br>";

    // Сортуємо терми за значенням приналежності
    const sortedTerms = Object.entries(membershipInfo).sort(
      ([, a], [, b]) => b.y - a.y
    );

    sortedTerms.forEach(([termName, info]) => {
      const colorDot = `<span style="display: inline-block; width: 10px; height: 10px; background: ${info.color}; border-radius: 50%; margin-right: 6px; vertical-align: middle; border: 1px solid rgba(255,255,255,0.3);"></span>`;
      const membershipValue = info.y.toFixed(3);
      const percentage = (info.y * 100).toFixed(1);
      content += `${colorDot}<strong>${termName}:</strong> ${membershipValue} (${percentage}%)<br>`;
    });
  }

  tooltip.innerHTML = content;

  // Позиціонуємо tooltip у межах екрана
  const { x, y } = positionTooltip(tooltip, mouseX, mouseY);
  tooltip.style.left = x + "px";
  tooltip.style.top = y + "px";
  tooltip.classList.add("visible");
}

function hideTooltip(tooltip) {
  if (!tooltip) return;
  tooltip.classList.remove("visible");
}

// Функція для позиціонування tooltip у межах екрана
function positionTooltip(tooltip, mouseX, mouseY) {
  const tooltipRect = tooltip.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let x = mouseX;
  let y = mouseY;

  // Перевіряємо, чи tooltip виходить за правий край екрана
  if (x + tooltipRect.width > viewportWidth) {
    x = viewportWidth - tooltipRect.width - 10;
  }

  // Перевіряємо, чи tooltip виходить за лівий край екрана
  if (x < 10) {
    x = 10;
  }

  // Перевіряємо, чи tooltip виходить за верхній край екрана
  if (y - tooltipRect.height - 15 < 10) {
    y = mouseY + 25; // Показуємо знизу від курсора
    tooltip.style.transform = "translate(-50%, 0)";
    // Змінюємо стрілку для відображення зверху
    tooltip.style.setProperty("--arrow-position", "top");
  } else {
    tooltip.style.transform = "translate(-50%, calc(-100% - 15px))";
    tooltip.style.setProperty("--arrow-position", "bottom");
  }

  return { x, y };
}

// --- Export Functions ---
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

// --- Initialization ---
document.addEventListener("DOMContentLoaded", async () => {
  console.log("🚀 Ініціалізація додатку...");
  console.log("DOM елементи:", {
    connectionStrengthInput: !!connectionStrengthInput,
    responseTimeInput: !!responseTimeInput,
    energyConsumptionInput: !!energyConsumptionInput,
    canvases: Object.keys(canvases).map((key) => ({
      [key]: !!canvases[key].canvas,
    })),
  });

  // Встановити початкові значення
  if (csValue && connectionStrengthInput) {
    csValue.textContent = connectionStrengthInput.value;
  }
  if (rtValue && responseTimeInput) {
    rtValue.textContent = responseTimeInput.value;
  }
  if (ecValue && energyConsumptionInput) {
    ecValue.textContent = energyConsumptionInput.value;
  }

  try {
    // Завантажити дані функцій приналежності з сервера
    console.log("📡 Завантаження функцій приналежності...");
    await loadMembershipFunctions();

    if (membershipFunctionsData) {
      console.log("✅ Функції приналежності завантажено успішно");
    } else {
      console.error("❌ Функції приналежності не завантажились");
    }

    // Налаштувати tooltip для графіків
    console.log("🖱️ Налаштування tooltips...");
    setupCanvasTooltips();

    // Виконати початковий розрахунок
    console.log("🧮 Початковий розрахунок...");
    await calculateAndDisplayFuzzyOutput();

    console.log("✅ Додаток успішно ініціалізовано");
  } catch (error) {
    console.error("❌ Помилка ініціалізації:", error);
    showError("Помилка ініціалізації додатку: " + error.message);
  }
});
