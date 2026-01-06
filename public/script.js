// --- Fuzzy Controller Client using Server API ---
// Глобальні змінні для зберігання даних від сервера
let membershipFunctionsData = null;
let currentCalculation = null;

// --- DOM Elements and Variables ---
// DOM елементи
const errorsInput = document.getElementById("errors");
const connectionsInput = document.getElementById("connections");
const bytesInput = document.getElementById("bytes");
const calculateBtn = document.getElementById("calculateBtn");
const trustIndexOutputSpan = document.getElementById("trustIndexOutput");
const activeOutputTermSpan = document.getElementById("activeOutputTerm");

// Елементи для відображення значень
const eValue = document.getElementById("eValue");
const cValue = document.getElementById("cValue");
const bValue = document.getElementById("bValue");

// Canvas елементи для графіків
const errorsCanvas = document.getElementById(
  "errorsCanvas"
);
const connectionsCanvas = document.getElementById("connectionsCanvas");
const bytesCanvas = document.getElementById(
  "bytesCanvas"
);
const trustIndexCanvas = document.getElementById("trustIndexCanvas");

// Контексти для малювання
const canvases = {
  errors: {
    canvas: errorsCanvas,
    ctx: errorsCanvas.getContext("2d"),
  },
  connections: {
    canvas: connectionsCanvas,
    ctx: connectionsCanvas.getContext("2d"),
  },
  bytes: {
    canvas: bytesCanvas,
    ctx: bytesCanvas.getContext("2d"),
  },
  trustIndex: {
    canvas: trustIndexCanvas,
    ctx: trustIndexCanvas.getContext("2d"),
  },
};

// Кольори для різних термів
const colors = {
  Low: "#e74c3c",      // червоний
  Medium: "#3498db",    // синій
  High: "#27ae60",      // зелений
  VeryLow: "#3498db",   // синій
  VeryHigh: "#3498db",  // синій
};

// Tooltip елементи
const tooltips = {
  errors: document.getElementById("eTooltip"),
  connections: document.getElementById("cTooltip"),
  bytes: document.getElementById("bTooltip"),
  trustIndex: document.getElementById("tTooltip"),
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
  errors,
  connections,
  bytes
) {
  try {
    const response = await fetch("/api/calculate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        errors,
        connections,
        bytes,
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
errorsInput.addEventListener("input", () => {
  eValue.textContent = errorsInput.value;
  debounceCalculation();
});
connectionsInput.addEventListener("input", () => {
  cValue.textContent = connectionsInput.value;
  debounceCalculation();
});
bytesInput.addEventListener("input", () => {
  bValue.textContent = bytesInput.value;
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

  const errorsVal = parseFloat(errorsInput.value);
  const connectionsVal = parseFloat(connectionsInput.value);
  const bytesVal = parseFloat(bytesInput.value);

  console.log("📊 Вхідні дані:", {
    errorsVal,
    connectionsVal,
    bytesVal,
  });

  // Валідація вхідних даних
  if (
    isNaN(errorsVal) ||
    isNaN(connectionsVal) ||
    isNaN(bytesVal)
  ) {
    console.error("❌ Некоректні вхідні дані");
    showError("Некоректні вхідні дані");
    return;
  }

  if (
    errorsVal < 0 ||
    errorsVal > 100 ||
    connectionsVal < 0 ||
    connectionsVal > 100 ||
    bytesVal < 0 ||
    bytesVal > 100
  ) {
    console.error("❌ Значення поза допустимим діапазоном");
    showError("Всі значення повинні бути в діапазоні 0-100");
    return;
  }

  try {
    console.log("📡 Відправка запиту на сервер...");
    // Відправляємо запит на сервер для обчислення
    const result = await calculateFuzzyResult(
      errorsVal,
      connectionsVal,
      bytesVal
    );

    console.log("✅ Результат отримано:", result);

    // Зберігаємо результат
    currentCalculation = {
      trustIndex: result.trustIndex,
      mostActiveTerm: result.mostActiveTerm,
      membershipData: result.membershipData,
      inputValues: result.inputValues,
    };

    console.log("💾 Збережено результат:", currentCalculation);

    // Відображення результатів
    trustIndexOutputSpan.textContent = currentCalculation.trustIndex;
    activeOutputTermSpan.textContent = translateTerm(
      currentCalculation.mostActiveTerm
    );

    console.log("📝 Оновлено UI результатів");

    // Оновлення відображення приналежності
    updateMembershipDisplay(currentCalculation.membershipData);

    console.log("📊 Оновлено відображення приналежності");

    // Перемалювання графіків з поточними значеннями
    drawAllGraphs(
      errorsVal,
      connectionsVal,
      bytesVal,
      currentCalculation.trustIndex,
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
  updateMembershipSection("eMembership", membershipData.errors);
  updateMembershipSection("cMembership", membershipData.connections);
  updateMembershipSection("bMembership", membershipData.bytes);
  updateMembershipSection("tMembership", membershipData.trustIndex);
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

// Функція для знаходження найактивнішого терма з даних приналежності
function getMostActiveTermFromData(membershipData) {
  if (!membershipData) return null;

  let maxValue = -1;
  let maxTerm = null;

  for (const [term, value] of Object.entries(membershipData)) {
    if (value > maxValue) {
      maxValue = value;
      maxTerm = term;
    }
  }

  // Повертаємо терм тільки якщо його значення > 0
  return maxValue > 0 ? maxTerm : null;
}

// --- Graph Drawing Functions ---
function drawAllGraphs(
  eVal = null,
  cVal = null,
  bVal = null,
  tVal = null,
  activeTerm = null
) {
  console.log("🎨 Малювання графіків:", {
    eVal,
    cVal,
    bVal,
    tVal,
    activeTerm,
  });

  if (!membershipFunctionsData) {
    console.warn("⚠️ Membership functions data not loaded yet");
    return;
  }

  console.log("📊 Дані для малювання:", membershipFunctionsData);

  // Визначаємо активні терми для кожної вхідної змінної
  let activeErrorsTerm = null;
  let activeConnectionsTerm = null;
  let activeBytesTerm = null;

  if (currentCalculation && currentCalculation.membershipData) {
    // Знаходимо найактивніший терм для кожної вхідної змінної
    activeErrorsTerm = getMostActiveTermFromData(currentCalculation.membershipData.errors);
    activeConnectionsTerm = getMostActiveTermFromData(currentCalculation.membershipData.connections);
    activeBytesTerm = getMostActiveTermFromData(currentCalculation.membershipData.bytes);
  }

  drawMembershipGraph("errors", eVal, activeErrorsTerm);
  drawMembershipGraph("connections", cVal, activeConnectionsTerm);
  drawMembershipGraph("bytes", bVal, activeBytesTerm);
  drawMembershipGraph("trustIndex", tVal, activeTerm);

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
    variableName === "trustIndex"
      ? membershipFunctionsData.output[variableName]
      : membershipFunctionsData.inputs[variableName];

  if (!variableData) return;

  // Всі змінні мають діапазон 0-100
  const maxRange = 100;
  
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
      isHighlighted,
      maxRange
    );

    // Додати підпис терма
    drawTermLabel(ctx, termName, color, padding, graphWidth);
  });

  // Малювання поточного значення
  if (currentValue !== null) {
    drawCurrentValueMarker(ctx, currentValue, padding, graphWidth, graphHeight, maxRange);
  }

  // Додати підписи осей
  drawAxisLabels(ctx, width, height, padding, variableName);
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
  isHighlighted,
  maxRange = 100
) {
  if (!points || points.length === 0) return;

  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = isHighlighted ? 4 : 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  points.forEach((point, index) => {
    const x = padding + (point.x / maxRange) * graphWidth;
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
      const x = padding + (point.x / maxRange) * graphWidth;
      const y = padding + graphHeight - point.y * graphHeight;

      if (index === 0) {
        ctx.moveTo(x, padding + graphHeight);
        ctx.lineTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.lineTo(
      padding + (points[points.length - 1].x / maxRange) * graphWidth,
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
    Low: 0.25,
    VeryLow: 0.05,
    Medium: 0.5,
    High: 0.75,
    VeryHigh: 0.95,
  };

  const position = positions[termName] || 0.5;
  const x = padding + graphWidth * position;
  
  // Спеціальне відображення для довгих термів
  if (termName === "VeryLow") {
    ctx.fillText("Дуже", x, padding - 20);
    ctx.fillText("Низький", x, padding - 8);
  } else if (termName === "VeryHigh") {
    ctx.fillText("Дуже", x, padding - 20);
    ctx.fillText("Високий", x, padding - 8);
  } else {
    const y = padding - 10;
    ctx.fillText(translateTerm(termName), x, y);
  }
}

function drawCurrentValueMarker(ctx, value, padding, graphWidth, graphHeight, maxRange = 100) {
  const x = padding + (value / maxRange) * graphWidth;

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
  ctx.fillText(value.toFixed(1), x, padding + graphHeight + 40);
}

function drawAxisLabels(ctx, width, height, padding, variableName = null) {
  ctx.fillStyle = "#7f8c8d";
  ctx.font = "12px Arial";
  ctx.textAlign = "center";

  // Підписи для X-осі залежно від типу змінної
  const graphWidth = width - 2 * padding;
  
  // Завжди показуємо 0 та максимум
  ctx.fillText("0", padding, height - padding + 20);
  
  // Додаємо ключові точки для кожного типу змінної
  if (variableName === "errors") {
    // Ключові точки: 30, 50, 70, 90, 100
    ctx.fillText("30", padding + (30/100) * graphWidth, height - padding + 20);
    ctx.fillText("50", padding + (50/100) * graphWidth, height - padding + 20);
    ctx.fillText("70", padding + (70/100) * graphWidth, height - padding + 20);
    ctx.fillText("90", padding + (90/100) * graphWidth, height - padding + 20);
    ctx.fillText("100", width - padding, height - padding + 20);
  } else if (variableName === "connections") {
    // Ключові точки: 10, 30, 50, 70, 100
    ctx.fillText("10", padding + (10/100) * graphWidth, height - padding + 20);
    ctx.fillText("30", padding + (30/100) * graphWidth, height - padding + 20);
    ctx.fillText("50", padding + (50/100) * graphWidth, height - padding + 20);
    ctx.fillText("70", padding + (70/100) * graphWidth, height - padding + 20);
    ctx.fillText("100", width - padding, height - padding + 20);
  } else if (variableName === "bytes") {
    // Ключові точки: 20, 40, 60, 80, 100
    ctx.fillText("20", padding + (20/100) * graphWidth, height - padding + 20);
    ctx.fillText("40", padding + (40/100) * graphWidth, height - padding + 20);
    ctx.fillText("60", padding + (60/100) * graphWidth, height - padding + 20);
    ctx.fillText("80", padding + (80/100) * graphWidth, height - padding + 20);
    ctx.fillText("100", width - padding, height - padding + 20);
  } else if (variableName === "trustIndex") {
    // Ключові точки: 25, 50, 75, 100
    ctx.fillText("25", padding + (25/100) * graphWidth, height - padding + 20);
    ctx.fillText("50", padding + (50/100) * graphWidth, height - padding + 20);
    ctx.fillText("75", padding + (75/100) * graphWidth, height - padding + 20);
    ctx.fillText("100", width - padding, height - padding + 20);
  }

  // Підписи для Y-осі
  ctx.save();
  ctx.translate(15, height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Ступінь приналежності", 0, 0);
  ctx.restore();

  ctx.fillText("1.0", padding - 20, padding + 5);
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
      errors: parseFloat(errorsInput.value),
      connections: parseFloat(connectionsInput.value),
      bytes: parseFloat(bytesInput.value),
    },
    output: {
      trustIndex: currentCalculation.trustIndex,
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
    errorsInput: !!errorsInput,
    connectionsInput: !!connectionsInput,
    bytesInput: !!bytesInput,
    canvases: Object.keys(canvases).map((key) => ({
      [key]: !!canvases[key].canvas,
    })),
  });

  // Встановити початкові значення
  if (eValue && errorsInput) {
    eValue.textContent = errorsInput.value;
  }
  if (cValue && connectionsInput) {
    cValue.textContent = connectionsInput.value;
  }
  if (bValue && bytesInput) {
    bValue.textContent = bytesInput.value;
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
