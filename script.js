const STORAGE_KEY = "somnitechMonitoringState";
const AUTH_KEY = "somnitechAuth";
const MAX_HISTORY_ENTRIES = 50;
const MONITOR_INTERVAL_MS = 3000;
const DEFAULT_THEME = "dark";
const DEFAULT_FILTER = "all";

let monitorTimer = null;
let appState = loadState();

function ensureAuthenticated() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) {
      window.location.href = "login.html";
      return null;
    }
    const auth = JSON.parse(raw);
    if (!auth || !auth.loggedIn) {
      window.location.href = "login.html";
      return null;
    }
    return auth;
  } catch (error) {
    window.location.href = "login.html";
    return null;
  }
}

const elements = {
  welcomeUser: document.getElementById("welcomeUser"),
  status: document.getElementById("monitorStatus"),
  startBtn: document.getElementById("startBtn"),
  stopBtn: document.getElementById("stopBtn"),
  clearHistoryBtn: document.getElementById("clearHistoryBtn"),
  heartRate: document.getElementById("heartRateValue"),
  hrv: document.getElementById("hrvValue"),
  spo2: document.getElementById("spo2Value"),
  temp: document.getElementById("tempValue"),
  sleepScore: document.getElementById("sleepScoreValue"),
  lastUpdated: document.getElementById("lastUpdatedValue"),
  historyTableBody: document.getElementById("historyTableBody"),
  avgHeartRate: document.getElementById("avgHeartRateValue"),
  avgSpo2: document.getElementById("avgSpo2Value"),
  avgTemp: document.getElementById("avgTempValue"),
  bestSleepScore: document.getElementById("bestSleepScoreValue"),
  themeToggleBtn: document.getElementById("themeToggleBtn"),
  timeFilterSelect: document.getElementById("timeFilterSelect"),
  exportCsvBtn: document.getElementById("exportCsvBtn"),
  combinedTrendChart: document.getElementById("combinedTrendChart"),
  heartMiniChart: document.getElementById("heartMiniChart"),
  spo2MiniChart: document.getElementById("spo2MiniChart"),
  sleepMiniChart: document.getElementById("sleepMiniChart"),
  healthStatus: document.getElementById("healthStatusValue"),
  inputHeartRate: document.getElementById("inputHeartRate"),
  inputHrv: document.getElementById("inputHrv"),
  inputSpo2: document.getElementById("inputSpo2"),
  inputTemp: document.getElementById("inputTemp"),
  inputHeartRateValue: document.getElementById("inputHeartRateValue"),
  inputHrvValue: document.getElementById("inputHrvValue"),
  inputSpo2Value: document.getElementById("inputSpo2Value"),
  inputTempValue: document.getElementById("inputTempValue"),
  addReadingBtn: document.getElementById("addReadingBtn"),
  generateRandomBtn: document.getElementById("generateRandomBtn"),
  caretakerEmailInput: document.getElementById("caretakerEmailInput"),
  doctorEmailInput: document.getElementById("doctorEmailInput"),
  sendCaretakerBtn: document.getElementById("sendCaretakerBtn"),
  sendDoctorBtn: document.getElementById("sendDoctorBtn"),
  downloadPdfBtn: document.getElementById("downloadPdfBtn"),
  reportStatusMessage: document.getElementById("reportStatusMessage")
};

function createDefaultState() {
  return {
    monitoring: false,
    latestData: null,
    history: [],
    ui: {
      theme: DEFAULT_THEME,
      filter: DEFAULT_FILTER
    }
  };
}

function normalizeState(rawState) {
  const base = createDefaultState();
  if (!rawState || typeof rawState !== "object") return base;

  const monitoring = Boolean(rawState.monitoring);
  const latestData = rawState.latestData && typeof rawState.latestData === "object"
    ? rawState.latestData
    : null;
  const history = Array.isArray(rawState.history) ? rawState.history : [];
  const ui = rawState.ui && typeof rawState.ui === "object" ? rawState.ui : {};
  const theme = ui.theme === "light" ? "light" : DEFAULT_THEME;
  const filter = ["all", "24h", "1h"].includes(ui.filter) ? ui.filter : DEFAULT_FILTER;

  return {
    monitoring,
    latestData,
    history: history.slice(0, MAX_HISTORY_ENTRIES),
    ui: {
      theme,
      filter
    }
  };
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return createDefaultState();
    const parsed = JSON.parse(saved);
    return normalizeState(parsed);
  } catch (error) {
    console.error("Failed to load state from localStorage:", error);
    return createDefaultState();
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  } catch (error) {
    console.error("Failed to save state to localStorage:", error);
  }
}

function randomNumber(min, max, decimals = 0) {
  const value = Math.random() * (max - min) + min;
  return Number(value.toFixed(decimals));
}

function buildDataPoint() {
  const heartRate = Math.round(randomNumber(60, 100));
  const hrv = Math.round(randomNumber(30, 90));
  const spo2 = Math.round(randomNumber(94, 100));
  const temp = randomNumber(36, 37.5, 1);

  // Sleep score is a weighted estimate from current vitals.
  const sleepScore = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        70 + (spo2 - 95) * 4 - Math.abs(heartRate - 72) * 0.8 + (hrv - 50) * 0.3 - Math.abs(temp - 36.7) * 10
      )
    )
  );

  return {
    heartRate,
    hrv,
    spo2,
    temp,
    sleepScore,
    time: new Date().toISOString()
  };
}

function formatTime(isoTime) {
  if (!isoTime) return "--";
  const date = new Date(isoTime);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString();
}

function updateCards(dataPoint) {
  if (!dataPoint) {
    elements.heartRate.textContent = "--";
    elements.hrv.textContent = "--";
    elements.spo2.textContent = "--";
    elements.temp.textContent = "--";
    elements.sleepScore.textContent = "--";
    elements.lastUpdated.textContent = "--";
    return;
  }

  elements.heartRate.textContent = dataPoint.heartRate;
  elements.hrv.textContent = dataPoint.hrv;
  elements.spo2.textContent = dataPoint.spo2;
  elements.temp.textContent = dataPoint.temp;
  elements.sleepScore.textContent = dataPoint.sleepScore;
  elements.lastUpdated.textContent = formatTime(dataPoint.time);
  const healthSafe = dataPoint.spo2 >= 95 && dataPoint.heartRate >= 58 && dataPoint.heartRate <= 102;
  elements.healthStatus.textContent = healthSafe ? "Safe" : "Watch";
  elements.healthStatus.style.color = healthSafe ? "#00f4a5" : "#ffb100";
}

function getFilteredHistory() {
  const now = Date.now();
  const filter = appState.ui.filter || DEFAULT_FILTER;
  if (filter === "all") return appState.history;

  const cutoffMs = filter === "1h" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  return appState.history.filter((entry) => {
    const time = new Date(entry.time).getTime();
    if (Number.isNaN(time)) return false;
    return now - time <= cutoffMs;
  });
}

function renderHistory() {
  const { historyTableBody } = elements;
  historyTableBody.innerHTML = "";
  const visibleHistory = getFilteredHistory();

  if (!visibleHistory.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.className = "empty-cell";
    cell.textContent = "No data for selected range.";
    row.appendChild(cell);
    historyTableBody.appendChild(row);
    return;
  }

  visibleHistory.forEach((entry) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${formatTime(entry.time)}</td>
      <td>${entry.heartRate}</td>
      <td>${entry.hrv}</td>
      <td>${entry.spo2}</td>
      <td>${entry.temp}</td>
      <td>${entry.sleepScore}</td>
    `;
    historyTableBody.appendChild(row);
  });
}

function updateSummary() {
  const visibleHistory = getFilteredHistory();
  if (!visibleHistory.length) {
    elements.avgHeartRate.textContent = "--";
    elements.avgSpo2.textContent = "--";
    elements.avgTemp.textContent = "--";
    elements.bestSleepScore.textContent = "--";
    return;
  }

  const totals = visibleHistory.reduce(
    (acc, entry) => {
      acc.hr += Number(entry.heartRate) || 0;
      acc.spo2 += Number(entry.spo2) || 0;
      acc.temp += Number(entry.temp) || 0;
      acc.bestSleep = Math.max(acc.bestSleep, Number(entry.sleepScore) || 0);
      return acc;
    },
    { hr: 0, spo2: 0, temp: 0, bestSleep: 0 }
  );

  const count = visibleHistory.length;
  elements.avgHeartRate.textContent = Math.round(totals.hr / count);
  elements.avgSpo2.textContent = (totals.spo2 / count).toFixed(1);
  elements.avgTemp.textContent = (totals.temp / count).toFixed(1);
  elements.bestSleepScore.textContent = totals.bestSleep;
}

function createChartPoints(values, chartArea) {
  const { left, right, top, bottom } = chartArea;
  const width = right - left;
  const height = bottom - top;
  const count = values.length;
  const stepX = count > 1 ? width / (count - 1) : 0;
  return values.map((value, index) => ({
    x: left + index * stepX,
    y: bottom - value * height
  }));
}

function drawSmoothLine(ctx, points) {
  if (!points.length) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const point = points[i];
    const midX = (prev.x + point.x) / 2;
    const midY = (prev.y + point.y) / 2;
    ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
  }

  ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
  ctx.stroke();
}

function drawLineChartSeries(ctx, seriesValues, color, chartArea, progress = 1) {
  if (!seriesValues.length) return;
  const points = createChartPoints(seriesValues, chartArea);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash([ctx.canvas.width * 1.5]);
  ctx.lineDashOffset = ctx.canvas.width * (1 - progress);
  drawSmoothLine(ctx, points);
  ctx.setLineDash([]);
}

function normalizeSeries(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return values.map(() => 0.5);
  return values.map((value) => (value - min) / (max - min));
}

function drawCombinedChart(canvas, dataPoints, progress = 1) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  const pad = 32;
  ctx.clearRect(0, 0, width, height);

  if (!dataPoints.length) {
    ctx.fillStyle = "#8a95b3";
    ctx.font = "14px Segoe UI";
    ctx.fillText("No data for this range", 14, height / 2);
    return;
  }

  const chartArea = {
    left: pad,
    right: width - pad,
    top: pad,
    bottom: height - pad
  };

  ctx.strokeStyle = "rgba(200, 210, 240, 0.18)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = chartArea.top + ((chartArea.bottom - chartArea.top) * i) / 4;
    ctx.beginPath();
    ctx.moveTo(chartArea.left, y);
    ctx.lineTo(chartArea.right, y);
    ctx.stroke();
  }

  const series = [
    {
      color: "#67f4e8",
      values: normalizeSeries(dataPoints.map((d) => Number(d.heartRate) || 0))
    },
    {
      color: "#ff008c",
      values: normalizeSeries(dataPoints.map((d) => Number(d.spo2) || 0))
    },
    {
      color: "#00e59b",
      values: normalizeSeries(dataPoints.map((d) => Number(d.hrv) || 0))
    },
    {
      color: "#ffb100",
      values: normalizeSeries(dataPoints.map((d) => Number(d.sleepScore) || 0))
    }
  ];

  series.forEach((item) => drawLineChartSeries(ctx, item.values, item.color, chartArea, progress));

  ctx.fillStyle = "#8a95b3";
  ctx.font = "11px Segoe UI";
  ctx.fillText("Normalized scale per metric", chartArea.left, height - 10);
}

function drawSimpleChart(canvas, dataPoints, key, color, progress = 1) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const width = canvas.width;
  const height = canvas.height;
  const pad = 18;
  ctx.clearRect(0, 0, width, height);

  if (!dataPoints.length) return;
  const values = dataPoints.map((entry) => Number(entry[key]) || 0);
  const normalized = normalizeSeries(values);
  const chartArea = { left: pad, right: width - pad, top: pad, bottom: height - pad };

  ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = chartArea.top + ((chartArea.bottom - chartArea.top) * i) / 4;
    ctx.beginPath();
    ctx.moveTo(chartArea.left, y);
    ctx.lineTo(chartArea.right, y);
    ctx.stroke();
  }

  const points = createChartPoints(normalized, chartArea);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.14;
  ctx.beginPath();
  ctx.moveTo(points[0].x, chartArea.bottom);
  points.forEach((point, index) => {
    if (index === 0) return;
    const prev = points[index - 1];
    const midX = (prev.x + point.x) / 2;
    const midY = (prev.y + point.y) / 2;
    ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
  });
  ctx.lineTo(points[points.length - 1].x, chartArea.bottom);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.lineWidth = 2;
  ctx.setLineDash([width * 1.25]);
  ctx.lineDashOffset = width * (1 - progress);
  drawSmoothLine(ctx, points);
  ctx.setLineDash([]);
}

function animateChart(canvas, drawCallback) {
  if (!canvas) return;
  if (canvas._animFrame) cancelAnimationFrame(canvas._animFrame);

  const startTime = { value: null };
  const duration = 420;

  function step(timestamp) {
    if (!startTime.value) startTime.value = timestamp;
    const elapsed = timestamp - startTime.value;
    const progress = Math.min(elapsed / duration, 1);
    drawCallback(progress);

    if (progress < 1) {
      canvas._animFrame = requestAnimationFrame(step);
    } else {
      canvas._animFrame = null;
    }
  }

  canvas._animFrame = requestAnimationFrame(step);
}

function renderCharts() {
  const visibleHistory = getFilteredHistory().slice().reverse();
  animateChart(elements.combinedTrendChart, (progress) => drawCombinedChart(elements.combinedTrendChart, visibleHistory, progress));
  const mini = visibleHistory.slice(-20);
  animateChart(elements.heartMiniChart, (progress) => drawSimpleChart(elements.heartMiniChart, mini, "heartRate", "#00d9ff", progress));
  animateChart(elements.spo2MiniChart, (progress) => drawSimpleChart(elements.spo2MiniChart, mini, "spo2", "#ff008c", progress));
  animateChart(elements.sleepMiniChart, (progress) => drawSimpleChart(elements.sleepMiniChart, mini, "sleepScore", "#ffb100", progress));
}

function applyTheme() {
  const light = appState.ui.theme === "light";
  document.body.classList.toggle("light-theme", light);
}

function toggleTheme() {
  appState.ui.theme = appState.ui.theme === "light" ? "dark" : "light";
  applyTheme();
  saveState();
}

function updateVisuals() {
  renderHistory();
  updateSummary();
  renderCharts();
}

function updateMonitoringUI() {
  if (appState.monitoring) {
    elements.status.textContent = "Monitoring Active 🟢";
    elements.status.classList.remove("stopped");
    elements.status.classList.add("active");
    elements.startBtn.disabled = true;
    elements.stopBtn.disabled = false;
  } else {
    elements.status.textContent = "Monitoring Stopped 🔴";
    elements.status.classList.remove("active");
    elements.status.classList.add("stopped");
    elements.startBtn.disabled = false;
    elements.stopBtn.disabled = true;
  }
}

function applyDataPoint(dataPoint) {
  appState.latestData = dataPoint;
  appState.history.unshift(dataPoint);
  appState.history = appState.history.slice(0, MAX_HISTORY_ENTRIES);
  updateCards(dataPoint);
  updateVisuals();
  saveState();
}

function generateAndStoreData() {
  if (!appState.monitoring) return;
  const dataPoint = buildDataPoint();
  applyDataPoint(dataPoint);
}

function startMonitoring() {
  if (monitorTimer) return; // Prevent duplicate intervals.
  appState.monitoring = true;
  updateMonitoringUI();
  saveState();

  generateAndStoreData();
  monitorTimer = setInterval(generateAndStoreData, MONITOR_INTERVAL_MS);
}

function stopMonitoring() {
  appState.monitoring = false;
  updateMonitoringUI();
  saveState();

  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
  }
}

function clearHistory() {
  appState.history = [];
  appState.latestData = null;
  updateCards(appState.latestData);
  updateVisuals();
  saveState();
}

function updateManualInputLabels() {
  elements.inputHeartRateValue.textContent = elements.inputHeartRate.value;
  elements.inputHrvValue.textContent = elements.inputHrv.value;
  elements.inputSpo2Value.textContent = elements.inputSpo2.value;
  elements.inputTempValue.textContent = Number(elements.inputTemp.value).toFixed(1);
}

function addManualReading() {
  const heartRate = Number(elements.inputHeartRate.value);
  const hrv = Number(elements.inputHrv.value);
  const spo2 = Number(elements.inputSpo2.value);
  const temp = Number(elements.inputTemp.value);
  const sleepScore = Math.round(
    Math.max(0, Math.min(100, 65 + (spo2 - 95) * 5 + (hrv - 50) * 0.35 - Math.abs(heartRate - 72) * 0.8))
  );

  applyDataPoint({
    heartRate,
    hrv,
    spo2,
    temp,
    sleepScore,
    time: new Date().toISOString()
  });
}

function generateRandomInputData() {
  elements.inputHeartRate.value = Math.round(randomNumber(60, 100));
  elements.inputHrv.value = Math.round(randomNumber(30, 90));
  elements.inputSpo2.value = Math.round(randomNumber(94, 100));
  elements.inputTemp.value = randomNumber(36, 37.5, 1);
  updateManualInputLabels();
  addManualReading();
}

function exportCsv() {
  if (!appState.history.length) return;
  const rows = [
    ["time", "heartRate", "hrv", "spo2", "temp", "sleepScore"],
    ...appState.history.map((entry) => [
      entry.time,
      entry.heartRate,
      entry.hrv,
      entry.spo2,
      entry.temp,
      entry.sleepScore
    ])
  ];
  const csv = rows.map((row) => row.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `somnitech-history-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function setReportStatus(message, type = "") {
  if (!elements.reportStatusMessage) return;
  elements.reportStatusMessage.textContent = message;
  elements.reportStatusMessage.classList.remove("success", "error");
  if (type) elements.reportStatusMessage.classList.add(type);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function buildReportSummary() {
  const latest = appState.latestData;
  const filtered = getFilteredHistory();
  const avgHeart = elements.avgHeartRate.textContent;
  const avgSpo2 = elements.avgSpo2.textContent;
  const avgTemp = elements.avgTemp.textContent;
  const bestSleep = elements.bestSleepScore.textContent;

  return {
    generatedAt: new Date().toLocaleString(),
    latest,
    count: filtered.length,
    avgHeart,
    avgSpo2,
    avgTemp,
    bestSleep
  };
}

function sendReport(targetLabel, email) {
  if (!email || !isValidEmail(email)) {
    setReportStatus(`Enter a valid ${targetLabel.toLowerCase()} email address.`, "error");
    return;
  }

  const report = buildReportSummary();
  const historyLogKey = "somnitechReportLog";
  try {
    const oldLog = JSON.parse(localStorage.getItem(historyLogKey) || "[]");
    oldLog.unshift({
      type: targetLabel,
      email,
      sentAt: new Date().toISOString(),
      report
    });
    localStorage.setItem(historyLogKey, JSON.stringify(oldLog.slice(0, 50)));
  } catch (error) {
    console.error("Could not persist report log:", error);
  }

  setReportStatus(`Report sent to ${targetLabel} (${email}) successfully.`, "success");
}

function openPrintableReport() {
  const report = buildReportSummary();
  const latest = report.latest || {};
  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) {
    setReportStatus("Popup blocked. Please allow popups to download PDF.", "error");
    return;
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>SomniTech Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 28px; color: #10223f; }
          h1 { margin: 0 0 8px; color: #0a73b8; }
          .meta { margin-bottom: 16px; color: #385274; }
          .grid { display: grid; grid-template-columns: repeat(2, minmax(220px,1fr)); gap: 10px; margin-bottom: 16px; }
          .card { border: 1px solid #cfd8e3; border-radius: 8px; padding: 10px; }
          .label { font-size: 12px; color: #5c6f87; margin-bottom: 4px; }
          .value { font-size: 18px; font-weight: 700; color: #0f2d52; }
          table { width: 100%; border-collapse: collapse; margin-top: 14px; }
          th, td { border: 1px solid #dde4ee; padding: 8px; text-align: left; font-size: 12px; }
          th { background: #f2f7ff; }
        </style>
      </head>
      <body>
        <h1>SomniTech Health Report</h1>
        <div class="meta">Generated: ${report.generatedAt}</div>
        <div class="grid">
          <div class="card"><div class="label">Latest Heart Rate</div><div class="value">${latest.heartRate ?? "--"} bpm</div></div>
          <div class="card"><div class="label">Latest SpO2</div><div class="value">${latest.spo2 ?? "--"}%</div></div>
          <div class="card"><div class="label">Latest Temperature</div><div class="value">${latest.temp ?? "--"} C</div></div>
          <div class="card"><div class="label">Latest Sleep Score</div><div class="value">${latest.sleepScore ?? "--"}/100</div></div>
          <div class="card"><div class="label">Average Heart Rate</div><div class="value">${report.avgHeart} bpm</div></div>
          <div class="card"><div class="label">Average SpO2</div><div class="value">${report.avgSpo2}%</div></div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Total Records in Current Filter</th>
              <th>Average Temp (C)</th>
              <th>Best Sleep Score</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${report.count}</td>
              <td>${report.avgTemp}</td>
              <td>${report.bestSleep}</td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
  setReportStatus("Printable report opened. Choose 'Save as PDF' in the print dialog.", "success");
}

function initialize() {
  const auth = ensureAuthenticated();
  if (!auth) return;

  appState = normalizeState(appState);
  applyTheme();
  elements.timeFilterSelect.value = appState.ui.filter;
  elements.welcomeUser.textContent = `Welcome, ${auth.username || "User"}`;
  updateCards(appState.latestData);
  updateVisuals();
  updateMonitoringUI();

  elements.startBtn.addEventListener("click", startMonitoring);
  elements.stopBtn.addEventListener("click", stopMonitoring);
  elements.clearHistoryBtn.addEventListener("click", clearHistory);
  elements.themeToggleBtn.addEventListener("click", toggleTheme);
  elements.timeFilterSelect.addEventListener("change", (event) => {
    appState.ui.filter = event.target.value;
    updateVisuals();
    saveState();
  });
  elements.exportCsvBtn.addEventListener("click", exportCsv);
  elements.addReadingBtn.addEventListener("click", addManualReading);
  elements.generateRandomBtn.addEventListener("click", generateRandomInputData);
  elements.sendCaretakerBtn.addEventListener("click", () => {
    sendReport("Caretaker", elements.caretakerEmailInput.value.trim());
  });
  elements.sendDoctorBtn.addEventListener("click", () => {
    sendReport("Doctor", elements.doctorEmailInput.value.trim());
  });
  elements.downloadPdfBtn.addEventListener("click", openPrintableReport);
  [elements.inputHeartRate, elements.inputHrv, elements.inputSpo2, elements.inputTemp].forEach((input) => {
    input.addEventListener("input", updateManualInputLabels);
  });
  updateManualInputLabels();

  // Auto-resume monitoring if it was active before reload.
  if (appState.monitoring) {
    startMonitoring();
  }
}

initialize();
