/* ---------- Sample data (replace with a real database/API) ---------- */
const AREAS = {
  "Central Market": [18.5204, 73.8567],
  "North Campus":   [18.5600, 73.8000],
  "East Colony":    [18.5300, 73.9200],
  "South Station":  [18.4600, 73.8600],
  "West Hills":     [18.5100, 73.7700]
};

const NGOS = [
  { name: "Annapurna Food Bank",  area: [18.5250, 73.8500], capacity: 300, urgency: 0.9, accepts: ["cooked", "packaged", "bakery"] },
  { name: "Seva Community Kitchen", area: [18.5500, 73.8300], capacity: 120, urgency: 0.7, accepts: ["cooked", "produce"] },
  { name: "Hope Shelter",         area: [18.4800, 73.8800], capacity: 80,  urgency: 0.95, accepts: ["cooked", "bakery", "packaged"] },
  { name: "Green Roots Trust",    area: [18.5700, 73.7900], capacity: 500, urgency: 0.5, accepts: ["produce", "packaged"] },
  { name: "Bright Future School Meals", area: [18.5350, 73.9000], capacity: 200, urgency: 0.6, accepts: ["cooked", "bakery", "produce"] },
  { name: "Riverside Relief",     area: [18.4500, 73.8500], capacity: 150, urgency: 0.8, accepts: ["cooked", "packaged"] }
];

const WEEKLY_SURPLUS = [310, 345, 330, 390, 420, 405, 460, 480]; // meals/week (sample)

/* ---------- Helpers ---------- */
const $ = (id) => document.getElementById(id);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

function haversine([lat1, lon1], [lat2, lon2]) {
  const R = 6371, rad = (d) => d * Math.PI / 180;
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/* ---------- Matching engine ---------- */
function matchDonation({ areaName, type, qty, hours, weights }) {
  const origin = AREAS[areaName];
  const total = weights.dist + weights.urg + weights.fit || 1;
  const w = { dist: weights.dist / total, urg: weights.urg / total, fit: weights.fit / total };
  const SPEED_KMH = 25, PREP_HOURS = 0.5;

  const ranked = [], excluded = [];
  for (const ngo of NGOS) {
    const km = haversine(origin, ngo.area);
    const eta = km / SPEED_KMH + PREP_HOURS;
    if (eta > hours) { excluded.push({ ngo, km, reason: "cannot be reached before the food spoils" }); continue; }

    const proximity = clamp(1 - km / 20);
    const urgency = ngo.urgency;
    const capFit = clamp(ngo.capacity / qty);
    const typeFit = ngo.accepts.includes(type) ? 1 : 0.2;
    const fit = 0.5 * capFit + 0.5 * typeFit;
    const score = w.dist * proximity + w.urg * urgency + w.fit * fit;
    ranked.push({ ngo, km, eta, proximity, urgency, fit, score });
  }
  ranked.sort((a, b) => b.score - a.score);
  return { ranked, excluded };
}

function bar(label, v) {
  const pct = Math.round(v * 100);
  return `<div class="bar"><span>${label}</span><div class="track"><div class="fill" style="width:${pct}%"></div></div><span>${pct}%</span></div>`;
}

function renderResults({ ranked, excluded }) {
  const el = $("results");
  if (!ranked.length) {
    el.innerHTML = `<p class="muted">No NGO can receive this food in time. Try a longer spoil time or a closer area.</p>`;
    return;
  }
  el.innerHTML = ranked.map((r, i) => `
    <article class="match ${i === 0 ? "top" : ""}">
      <header>
        <h4>${i + 1}. ${r.ngo.name} ${i === 0 ? '<span class="badge">Best match</span>' : ""}</h4>
        <span class="score">${(r.score * 100).toFixed(0)} / 100</span>
      </header>
      <p class="meta">${r.km.toFixed(1)} km away | pickup in about ${Math.ceil(r.eta * 60)} min | capacity ${r.ngo.capacity} meals</p>
      <div class="bars">${bar("Proximity", r.proximity)}${bar("Urgency", r.urgency)}${bar("Fit", r.fit)}</div>
    </article>`).join("") +
    excluded.map((x) => `<p class="excluded">Excluded: ${x.ngo.name} (${x.km.toFixed(1)} km) ${x.reason}.</p>`).join("");
}

/* ---------- Forecast (simple exponential smoothing) ---------- */
function smooth(series, alpha = 0.5) {
  let s = series[0];
  for (let i = 1; i < series.length; i++) s = alpha * series[i] + (1 - alpha) * s;
  return s;
}

function renderChart() {
  const data = WEEKLY_SURPLUS;
  const forecast = Math.round(smooth(data));
  const trend = (data[data.length - 1] - data[0]) / (data.length - 1);
  const next = Math.round(forecast + trend);
  const max = Math.max(...data, next) * 1.1;

  const cols = data.map((v, i) => ({ v, l: "W" + (i + 1), pred: false }));
  cols.push({ v: next, l: "Next", pred: true });

  $("chart").innerHTML = cols.map((c) =>
    `<div class="col ${c.pred ? "pred" : ""}"><span class="v">${c.v}</span><div class="b" style="height:${(c.v / max) * 100}%"></div></div>`).join("");
  $("chart").insertAdjacentHTML("afterend", `<div class="axis">${cols.map((c) => `<span>${c.l}</span>`).join("")}</div>`);
  $("forecast-text").textContent = `Forecast for next week: about ${next} surplus meals (smoothed level ${forecast} plus trend ${trend.toFixed(0)}).`;
}

/* ---------- KPI counters ---------- */
function animateCounters() {
  document.querySelectorAll("[data-count]").forEach((el) => {
    const target = +el.dataset.count, t0 = performance.now(), dur = 1200;
    const tick = (t) => {
      const p = clamp((t - t0) / dur);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString();
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/* ---------- Wire up ---------- */
document.addEventListener("DOMContentLoaded", () => {
  $("area").innerHTML = Object.keys(AREAS).map((a) => `<option>${a}</option>`).join("");

  [["w-dist", "w-dist-o"], ["w-urg", "w-urg-o"], ["w-fit", "w-fit-o"]].forEach(([i, o]) =>
    $(i).addEventListener("input", () => ($(o).textContent = $(i).value)));

  $("donation-form").addEventListener("submit", (e) => {
    e.preventDefault();
    renderResults(matchDonation({
      areaName: $("area").value,
      type: $("type").value,
      qty: +$("qty").value,
      hours: +$("hours").value,
      weights: { dist: +$("w-dist").value, urg: +$("w-urg").value, fit: +$("w-fit").value }
    }));
  });

  renderChart();
  animateCounters();
  $("donation-form").requestSubmit();
});