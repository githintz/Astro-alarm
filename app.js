'use strict';

// ── Constants ────────────────────────────────────────────────
const DEFAULT_LOCATION = { name: 'Baden, Switzerland', lat: 47.4724, lon: 8.3074 };
const START_HOUR = 14;          // Grid starts at 14:00 local time each day
const FORECAST_DAYS = 7;
const LUNAR_CYCLE = 29.53058867; // days
const KNOWN_NEW_MOON = new Date('2000-01-06T18:14:00Z');
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

// ── State ────────────────────────────────────────────────────
let currentLat = DEFAULT_LOCATION.lat;
let currentLon = DEFAULT_LOCATION.lon;
let currentName = DEFAULT_LOCATION.name;
let savedLocations = [];
let searchTimeout = null;
let lastForecastData = null;   // most recent API payload, reused by the noon alert
const GOOD_NIGHT_THRESHOLD = 60;

// ── Moon Phase ───────────────────────────────────────────────
function moonAge(date) {
    const elapsed = (date - KNOWN_NEW_MOON) / 864e5;
    return ((elapsed % LUNAR_CYCLE) + LUNAR_CYCLE) % LUNAR_CYCLE;
}

function moonIllumination(age) {
    return Math.round((1 - Math.cos(2 * Math.PI * age / LUNAR_CYCLE)) / 2 * 100);
}

function moonEmoji(age) {
    const p = age / LUNAR_CYCLE;
    if (p < 0.0625) return '🌑';
    if (p < 0.1875) return '🌒';
    if (p < 0.3125) return '🌓';
    if (p < 0.4375) return '🌔';
    if (p < 0.5625) return '🌕';
    if (p < 0.6875) return '🌖';
    if (p < 0.8125) return '🌗';
    if (p < 0.9375) return '🌘';
    return '🌑';
}

function moonPhaseName(age) {
    const p = age / LUNAR_CYCLE;
    if (p < 0.0625) return 'New Moon';
    if (p < 0.1875) return 'Waxing Crescent';
    if (p < 0.3125) return 'First Quarter';
    if (p < 0.4375) return 'Waxing Gibbous';
    if (p < 0.5625) return 'Full Moon';
    if (p < 0.6875) return 'Waning Gibbous';
    if (p < 0.8125) return 'Last Quarter';
    if (p < 0.9375) return 'Waning Crescent';
    return 'New Moon';
}

// ── Colour Functions ─────────────────────────────────────────
function cloudCol(v) {
    if (v == null) return '#2a2a3a';
    if (v <= 6)  return '#0f5c2e';
    if (v <= 19) return '#1a8a4a';
    if (v <= 31) return '#68b84f';
    if (v <= 44) return '#a8c840';
    if (v <= 56) return '#e0cc30';
    if (v <= 69) return '#e89020';
    if (v <= 81) return '#d05018';
    return '#b02010';
}

function visCol(km) {
    if (km == null) return '#2a2a3a';
    if (km >= 20) return '#0f5c2e';
    if (km >= 15) return '#1a8a4a';
    if (km >= 10) return '#68b84f';
    if (km >= 5)  return '#e0cc30';
    if (km >= 2)  return '#e89020';
    if (km >= 1)  return '#d05018';
    return '#b02010';
}

function fogCol(v) {
    if (!v)       return '#0f5c2e';
    if (v <= 10)  return '#1a8a4a';
    if (v <= 30)  return '#e0cc30';
    if (v <= 60)  return '#e89020';
    return '#b02010';
}

function precipProbCol(v) {
    if (v == null) return '#2a2a3a';
    if (v <= 5)  return '#0f5c2e';
    if (v <= 15) return '#1a8a4a';
    if (v <= 30) return '#68b84f';
    if (v <= 50) return '#e0cc30';
    if (v <= 70) return '#e89020';
    return '#b02010';
}

function precipAmtCol(v) {
    if (v == null) return '#2a2a3a';
    if (v === 0)   return '#0f5c2e';
    if (v <= 0.3)  return '#68b84f';
    if (v <= 1)    return '#e0cc30';
    if (v <= 5)    return '#e89020';
    return '#b02010';
}

function windCol(kmh) {
    if (kmh == null) return '#2a2a3a';
    if (kmh <= 5)  return '#0f5c2e';
    if (kmh <= 15) return '#1a8a4a';
    if (kmh <= 25) return '#68b84f';
    if (kmh <= 40) return '#e0cc30';
    if (kmh <= 60) return '#e89020';
    return '#b02010';
}

function frostCol(v) {
    if (!v)        return '#0f5c2e';
    if (v <= 10)   return '#1a8a4a';
    if (v <= 30)   return '#4488dd';
    if (v <= 60)   return '#2255bb';
    return '#1133aa';
}

function tempCol(t) {
    if (t == null) return '#2a2a3a';
    const c = Math.max(-20, Math.min(40, t));
    const hue = 240 - ((c + 20) / 60) * 240;
    return `hsl(${hue.toFixed(0)},80%,35%)`;
}

function dewCol(dp) {
    if (dp == null) return '#2a2a3a';
    if (dp <= 0)  return '#0f5c2e';
    if (dp <= 5)  return '#1a8a4a';
    if (dp <= 10) return '#68b84f';
    if (dp <= 15) return '#e0cc30';
    if (dp <= 20) return '#e89020';
    return '#b02010';
}

function humidCol(v) {
    if (v == null) return '#2a2a3a';
    if (v <= 30) return '#0f5c2e';
    if (v <= 50) return '#1a8a4a';
    if (v <= 70) return '#e0cc30';
    if (v <= 85) return '#e89020';
    return '#b02010';
}

function pressureCol() { return '#1e4488'; }

function precipTypeCol(wc) {
    if (wc == null || wc <= 3) return '#0a1028';
    if (wc <= 48) return '#555566';
    if (wc <= 57) return '#2244aa';
    if (wc <= 67) return '#1155cc';
    if (wc <= 77) return '#6688ff';
    if (wc <= 82) return '#1166dd';
    if (wc <= 86) return '#4477ff';
    return '#bb2200';
}

function precipTypeLabel(wc) {
    if (wc == null || wc <= 3) return '';
    if (wc <= 48) return 'Fog';
    if (wc <= 57) return 'Drz';
    if (wc <= 67) return 'Rain';
    if (wc <= 77) return 'Snow';
    if (wc <= 82) return 'Shwr';
    if (wc <= 86) return 'Snow';
    return 'Thdr';
}

// Seeing (atmospheric turbulence approximation — lower wind + low humidity + no cloud = better)
function seeingScore(cloud, wind, humid, vis) {
    if (cloud == null) return null;
    let score = 100;
    score -= cloud * 0.6;
    if (wind != null) score -= Math.min(wind, 60) * 0.3;
    if (humid != null) score -= Math.max(0, humid - 40) * 0.3;
    if (vis != null) {
        const km = vis / 1000;
        if (km < 5) score -= 20;
        else if (km < 10) score -= 10;
    }
    return Math.max(0, Math.min(100, Math.round(score)));
}

function seeingCol(v) {
    if (v == null) return '#2a2a3a';
    if (v >= 85) return '#0f5c2e';
    if (v >= 70) return '#1a8a4a';
    if (v >= 55) return '#68b84f';
    if (v >= 40) return '#e0cc30';
    if (v >= 20) return '#e89020';
    return '#b02010';
}

// ── Helpers ──────────────────────────────────────────────────
function windDir(deg) {
    if (deg == null) return '';
    const dirs = ['N','NE','E','SE','S','SW','W','NW'];
    return dirs[Math.round(deg / 45) % 8];
}

function estimateFog(visM, humid) {
    if (visM < 200  && humid >= 95) return 100;
    if (visM < 500  && humid >= 93) return 90;
    if (visM < 1000 && humid >= 90) return 70;
    if (visM < 2000 && humid >= 88) return 40;
    if (visM < 5000 && humid >= 85) return 15;
    return 0;
}

function estimateFrost(temp) {
    if (temp == null) return null;
    if (temp > 4) return 0;
    if (temp <= 0) return 100;
    return Math.round((4 - temp) / 4 * 100);
}

function fmt(isoStr) {
    if (!isoStr) return '--:--';
    const p = isoStr.split('T');
    return p[1] ? p[1].substring(0, 5) : '--:--';
}

// ── API ──────────────────────────────────────────────────────
function buildForecastUrl(lat, lon) {
    const vars = [
        'temperature_2m','relative_humidity_2m','apparent_temperature',
        'dew_point_2m','precipitation_probability','precipitation',
        'weather_code','cloud_cover','cloud_cover_low','cloud_cover_mid',
        'cloud_cover_high','wind_speed_10m','wind_direction_10m',
        'surface_pressure','visibility'
    ].join(',');
    return `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&hourly=${vars}&daily=sunrise,sunset&timezone=auto&forecast_days=8&wind_speed_unit=kmh`;
}

async function fetchForecast(lat, lon) {
    const url = buildForecastUrl(lat, lon);
    let r;
    try {
        r = await fetch(url, { mode: 'cors' });
    } catch (err) {
        // Network-level failure (CORS blocked, no internet, sandbox, ad blocker)
        const apiUrl = url;
        throw Object.assign(new Error('network'), { apiUrl });
    }
    if (!r.ok) throw new Error(`Open-Meteo returned HTTP ${r.status}`);
    return r.json();
}

async function geocode(query) {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=6&language=en&format=json`;
    try {
        const r = await fetch(url, { mode: 'cors' });
        if (!r.ok) throw new Error('Geocoding failed');
        const d = await r.json();
        return d.results || [];
    } catch {
        return [];
    }
}

// ── Rendering ────────────────────────────────────────────────
function getHoursForDay(dateStr) {
    // Returns array of {hour, isoStr} starting at START_HOUR for 24 hours
    const out = [];
    const base = new Date(dateStr + 'T00:00:00');
    for (let offset = 0; offset < 24; offset++) {
        const h = (START_HOUR + offset) % 24;
        const dayAdd = (START_HOUR + offset) >= 24 ? 1 : 0;
        const d = new Date(base);
        d.setDate(d.getDate() + dayAdd);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const hh = String(h).padStart(2, '0');
        out.push({ hour: h, isoStr: `${yyyy}-${mm}-${dd}T${hh}:00` });
    }
    return out;
}

function hourType(hour, sunriseH, sunsetH) {
    // Returns 'night' | 'twilight' | 'civil' | 'day'
    const astStart = sunriseH - 1.5;
    const nautStart = sunriseH - 1.0;
    const civStart = sunriseH - 0.5;
    const civEnd   = sunsetH + 0.5;
    const nautEnd  = sunsetH + 1.0;
    const astEnd   = sunsetH + 1.5;
    if (hour >= civStart && hour <= civEnd) return 'day';
    if (hour >= nautStart && hour <= nautEnd) return 'civil';
    if (hour >= astStart && hour <= astEnd) return 'twilight';
    return 'night';
}

const HOUR_BG = {
    day:      '#1a3a7a',
    civil:    '#112255',
    twilight: '#0a1535',
    night:    '#040610',
};

function buildRow(label, cells, rowClass = '') {
    const cls = `grid-row${rowClass ? ' ' + rowClass : ''}`;
    return `<div class="${cls}"><div class="grid-label${rowClass === 'hour-row' ? ' lbl-hour' : ''}">${label}</div><div class="grid-cells">${cells}</div></div>`;
}

function cell(bg, text, sub, textDark) {
    const cls = textDark ? ' cell-dark' : '';
    if (sub) {
        return `<div class="grid-cell${cls}" style="background:${bg}"><span>${text}</span><span class="cell-sub">${sub}</span></div>`;
    }
    return `<div class="grid-cell${cls}" style="background:${bg}">${text ?? ''}</div>`;
}

function emptyCell() {
    return `<div class="grid-cell" style="background:#1a1a2a;color:#333">-</div>`;
}

function renderDay(dateStr, data, dayIndex) {
    const date = new Date(dateStr + 'T12:00:00');
    const dayName = DAYS[date.getDay()];
    const dayNum  = date.getDate();
    const month   = MONTHS[date.getMonth()];

    const age   = moonAge(date);
    const illum = moonIllumination(age);
    const emoji = moonEmoji(age);
    const phase = moonPhaseName(age);

    const sunriseStr = data.daily.sunrise[dayIndex] || '';
    const sunsetStr  = data.daily.sunset[dayIndex]  || '';

    // Parse sunrise/sunset to decimal hours
    function timeToH(s) {
        const t = s ? s.split('T')[1] : null;
        if (!t) return null;
        const [h, m] = t.split(':').map(Number);
        return h + m / 60;
    }
    const sunriseH = timeToH(sunriseStr) ?? 6;
    const sunsetH  = timeToH(sunsetStr)  ?? 20;

    // Build time→index map
    const timeMap = {};
    data.hourly.time.forEach((t, i) => { timeMap[t] = i; });

    const hours = getHoursForDay(dateStr);

    // Helper
    const h = data.hourly;
    const v = (arr, idx) => (idx != null && arr && arr[idx] != null) ? arr[idx] : null;

    // ── Hour header row ──
    let hourCells = '';
    hours.forEach(({ hour }) => {
        const type = hourType(hour, sunriseH, sunsetH);
        hourCells += `<div class="grid-cell" style="background:${HOUR_BG[type]};color:#99bbff;font-size:9px;font-weight:bold;height:22px;line-height:22px;">${String(hour).padStart(2,'0')}</div>`;
    });

    // ── Build each data row ──
    function makeRow(label, fn, rowClass) {
        let cells = '';
        hours.forEach(({ isoStr }) => {
            const idx = timeMap[isoStr] ?? null;
            if (idx == null) { cells += emptyCell(); return; }
            const r = fn(idx);
            if (!r) { cells += emptyCell(); return; }
            cells += cell(r.bg, r.text ?? '', r.sub ?? '', r.dark);
        });
        return buildRow(label, cells, rowClass || '');
    }

    const rows = [
        buildRow('Hour (local)', hourCells, 'hour-row'),

        makeRow('Total Clouds (%)', i => {
            const val = v(h.cloud_cover, i);
            return { bg: cloudCol(val), text: val != null ? Math.round(val) : '' };
        }),

        makeRow('Low Clouds (%)', i => {
            const val = v(h.cloud_cover_low, i);
            return { bg: cloudCol(val), text: val != null ? Math.round(val) : '' };
        }),

        makeRow('Medium Clouds (%)', i => {
            const val = v(h.cloud_cover_mid, i);
            return { bg: cloudCol(val), text: val != null ? Math.round(val) : '' };
        }),

        makeRow('High Clouds (%)', i => {
            const val = v(h.cloud_cover_high, i);
            return { bg: cloudCol(val), text: val != null ? Math.round(val) : '' };
        }),

        makeRow('Visibility (km)', i => {
            const val = v(h.visibility, i);
            const km = val != null ? val / 1000 : null;
            return { bg: visCol(km), text: km != null ? (km >= 10 ? Math.round(km) : km.toFixed(1)) : '' };
        }),

        makeRow('Fog (%)', i => {
            const vis  = v(h.visibility, i);
            const hum  = v(h.relative_humidity_2m, i);
            const fog  = (vis != null && hum != null) ? estimateFog(vis, hum) : null;
            return { bg: fogCol(fog), text: fog != null ? fog : '' };
        }),

        makeRow('Precip. Type', i => {
            const wc    = v(h.weather_code, i);
            const label = precipTypeLabel(wc);
            return { bg: precipTypeCol(wc), text: label, dark: false };
        }),

        makeRow('Precip. Prob. (%)', i => {
            const val = v(h.precipitation_probability, i);
            return { bg: precipProbCol(val), text: val != null ? Math.round(val) : '' };
        }),

        makeRow('Precip. (mm)', i => {
            const val = v(h.precipitation, i);
            return { bg: precipAmtCol(val), text: val != null ? (val === 0 ? 0 : val.toFixed(1)) : '' };
        }),

        makeRow('Wind (km/h)', i => {
            const spd = v(h.wind_speed_10m, i);
            const dir = v(h.wind_direction_10m, i);
            return { bg: windCol(spd), text: spd != null ? Math.round(spd) : '', sub: windDir(dir) };
        }, 'wind-row'),

        makeRow('Chance of Frost (%)', i => {
            const temp  = v(h.temperature_2m, i);
            const frost = estimateFrost(temp);
            return { bg: frostCol(frost), text: frost != null ? frost : '' };
        }),

        makeRow('Temperature (°C)', i => {
            const val = v(h.temperature_2m, i);
            return { bg: tempCol(val), text: val != null ? Math.round(val) : '' };
        }),

        makeRow('Feels Like (°C)', i => {
            const val = v(h.apparent_temperature, i);
            return { bg: tempCol(val), text: val != null ? Math.round(val) : '' };
        }),

        makeRow('Dew Point (°C)', i => {
            const val = v(h.dew_point_2m, i);
            return { bg: dewCol(val), text: val != null ? Math.round(val) : '' };
        }),

        makeRow('Humidity (%)', i => {
            const val = v(h.relative_humidity_2m, i);
            return { bg: humidCol(val), text: val != null ? Math.round(val) : '' };
        }),

        makeRow('Pressure (hPa)', i => {
            const val = v(h.surface_pressure, i);
            return { bg: pressureCol(), text: val != null ? Math.round(val) : '', dark: false };
        }),

        makeRow('Seeing Quality (%)', i => {
            const cloud = v(h.cloud_cover, i);
            const wind  = v(h.wind_speed_10m, i);
            const humid = v(h.relative_humidity_2m, i);
            const vis   = v(h.visibility, i);
            const sc    = seeingScore(cloud, wind, humid, vis);
            return { bg: seeingCol(sc), text: sc != null ? sc : '' };
        }),
    ];

    return `
<div class="day-block">
  <div class="day-block-inner">
    <div class="day-info">
      <div>
        <div class="day-name-label">${dayName}</div>
        <div class="day-number">${dayNum}</div>
        <div class="month-label">${month}</div>
      </div>
      <div class="moon-section">
        <div class="moon-emoji-big">${emoji}</div>
        <div class="moon-phase-name">${phase}</div>
        <div class="moon-illum">${illum}%</div>
        <div class="sun-times">🌅 ${fmt(sunriseStr)}<br>🌇 ${fmt(sunsetStr)}</div>
      </div>
    </div>
    <div class="day-grid">${rows.join('')}</div>
  </div>
</div>`;
}

// ── Night quality score ──────────────────────────────────────
// Evaluates the night that starts on day `dayIndex` (sunset → next sunrise).
// Returns null if not enough hourly data, otherwise a summary object.
function computeNightScore(data, dayIndex) {
    const sunsetStr  = data.daily.sunset[dayIndex];
    const sunriseStr = data.daily.sunrise[dayIndex + 1] || data.daily.sunrise[dayIndex];
    if (!sunsetStr || !sunriseStr) return null;

    const nightStart = new Date(sunsetStr);
    nightStart.setMinutes(nightStart.getMinutes() + 60);   // wait for darkness
    const nightEnd = new Date(sunriseStr);
    nightEnd.setMinutes(nightEnd.getMinutes() - 30);

    const h = data.hourly;
    const hours = [];
    for (let i = 0; i < h.time.length; i++) {
        const t = new Date(h.time[i]);
        if (t >= nightStart && t <= nightEnd) {
            hours.push({
                time: h.time[i],
                cloud: h.cloud_cover[i],
                precipProb: h.precipitation_probability ? h.precipitation_probability[i] : 0,
                wind: h.wind_speed_10m[i],
                humid: h.relative_humidity_2m[i],
            });
        }
    }
    if (hours.length < 3) return null;

    const avg = (arr, f) => arr.reduce((s, x) => s + (f(x) ?? 0), 0) / arr.length;
    const avgCloud  = avg(hours, x => x.cloud);
    const maxPrecip = Math.max(...hours.map(x => x.precipProb ?? 0));
    const avgWind   = avg(hours, x => x.wind);
    const avgHumid  = avg(hours, x => x.humid);

    const midnight = new Date(nightStart);
    midnight.setHours(23, 59, 0, 0);
    const illum = moonIllumination(moonAge(midnight));

    let score = 100;
    score -= avgCloud * 0.65;
    score -= maxPrecip * 0.2;
    score -= Math.max(0, avgWind - 15) * 0.6;
    score -= Math.max(0, avgHumid - 75) * 0.4;
    score -= illum * 0.15;
    score = Math.max(0, Math.min(100, Math.round(score)));

    // Longest clear stretch (cloud < 30%)
    let best = { len: 0, start: null, end: null };
    let run = { len: 0, start: null };
    for (const x of hours) {
        if (x.cloud != null && x.cloud < 30) {
            if (!run.len) run.start = x.time;
            run.len++;
            if (run.len > best.len) best = { len: run.len, start: run.start, end: x.time };
        } else {
            run = { len: 0, start: null };
        }
    }

    return {
        score, avgCloud: Math.round(avgCloud), maxPrecip: Math.round(maxPrecip),
        avgWind: Math.round(avgWind), avgHumid: Math.round(avgHumid), moonIllum: illum,
        bestWindow: best.len >= 2 ? { from: fmt(best.start), to: fmt(best.end), hours: best.len } : null,
        nightStart: fmt(sunsetStr), nightEnd: fmt(sunriseStr),
    };
}

function scoreVerdict(score) {
    if (score >= 80) return { label: 'Excellent night!', emoji: '🌌', cls: 'v-excellent' };
    if (score >= GOOD_NIGHT_THRESHOLD) return { label: 'Good night for imaging', emoji: '✨', cls: 'v-good' };
    if (score >= 40) return { label: 'Marginal — keep an eye on it', emoji: '🌤️', cls: 'v-marginal' };
    if (score >= 20) return { label: 'Poor conditions', emoji: '☁️', cls: 'v-poor' };
    return { label: 'Not tonight — clouds win', emoji: '🌧️', cls: 'v-bad' };
}

function gaugeColor(score) {
    if (score >= 80) return '#3ddc84';
    if (score >= 60) return '#a8d84a';
    if (score >= 40) return '#e8c830';
    if (score >= 20) return '#e88a20';
    return '#e04030';
}

// ── Tonight hero panel ───────────────────────────────────────
function renderHero(data, name) {
    const hero = document.getElementById('tonight-hero');
    const night = computeNightScore(data, 0);
    if (!night) { hero.classList.add('hidden'); return; }

    const verdict = scoreVerdict(night.score);
    const col = gaugeColor(night.score);
    const r = 52, circ = 2 * Math.PI * r;
    const dash = circ * night.score / 100;

    const windowHtml = night.bestWindow
        ? `<div class="hero-stat"><span class="hs-icon">🕐</span><span class="hs-val">${night.bestWindow.from}–${night.bestWindow.to}</span><span class="hs-lbl">best clear window (${night.bestWindow.hours}h)</span></div>`
        : `<div class="hero-stat"><span class="hs-icon">🕐</span><span class="hs-val">—</span><span class="hs-lbl">no clear window expected</span></div>`;

    hero.innerHTML = `
      <div class="hero-gauge">
        <svg viewBox="0 0 120 120" width="120" height="120">
          <circle cx="60" cy="60" r="${r}" fill="none" stroke="#1c2444" stroke-width="9"/>
          <circle class="gauge-arc" cx="60" cy="60" r="${r}" fill="none" stroke="${col}" stroke-width="9"
                  stroke-linecap="round" stroke-dasharray="${dash.toFixed(1)} ${circ.toFixed(1)}"
                  transform="rotate(-90 60 60)"/>
          <text x="60" y="58" text-anchor="middle" class="gauge-num" fill="${col}">${night.score}</text>
          <text x="60" y="76" text-anchor="middle" class="gauge-sub" fill="#7a90c8">/ 100</text>
        </svg>
      </div>
      <div class="hero-body">
        <div class="hero-title">Tonight at ${name.split(',')[0]} <span class="hero-verdict ${verdict.cls}">${verdict.emoji} ${verdict.label}</span></div>
        <div class="hero-stats">
          <div class="hero-stat"><span class="hs-icon">☁️</span><span class="hs-val">${night.avgCloud}%</span><span class="hs-lbl">avg cloud</span></div>
          <div class="hero-stat"><span class="hs-icon">🌙</span><span class="hs-val">${night.moonIllum}%</span><span class="hs-lbl">moon illum.</span></div>
          <div class="hero-stat"><span class="hs-icon">💨</span><span class="hs-val">${night.avgWind}</span><span class="hs-lbl">km/h wind</span></div>
          <div class="hero-stat"><span class="hs-icon">💧</span><span class="hs-val">${night.avgHumid}%</span><span class="hs-lbl">humidity</span></div>
          <div class="hero-stat"><span class="hs-icon">🌧️</span><span class="hs-val">${night.maxPrecip}%</span><span class="hs-lbl">max precip prob</span></div>
          ${windowHtml}
        </div>
        <div class="hero-night-range">🌇 Dark from ~${night.nightStart} until ${night.nightEnd} 🌅</div>
      </div>`;
    hero.classList.remove('hidden');
}

// ── Noon alert ───────────────────────────────────────────────
// Fires a browser notification around 12:00 local time when tonight's score
// is at or above GOOD_NIGHT_THRESHOLD. Only works while the tab is open —
// a static GitHub Pages site has no server to push from.
function alertEnabled() { return localStorage.getItem('astro_alert_on') === '1'; }

function updateAlertButton() {
    const btn = document.getElementById('btn-alert');
    if (alertEnabled()) {
        btn.textContent = '🔔 Noon alert: on';
        btn.classList.add('alert-on');
    } else {
        btn.textContent = '🔕 Noon alert: off';
        btn.classList.remove('alert-on');
    }
}

async function toggleAlert() {
    if (alertEnabled()) {
        localStorage.setItem('astro_alert_on', '0');
        updateAlertButton();
        return;
    }
    if (!('Notification' in window)) {
        alert('This browser does not support notifications.');
        return;
    }
    let perm = Notification.permission;
    if (perm === 'default') perm = await Notification.requestPermission();
    if (perm !== 'granted') {
        alert('Notifications are blocked for this site. Allow them in your browser settings to use the noon alert.');
        return;
    }
    localStorage.setItem('astro_alert_on', '1');
    updateAlertButton();
    new Notification('🔭 AstroForecast alert armed', {
        body: 'You\'ll get a notification at noon when tonight looks good for astrophotography. Keep this tab open.',
    });
    checkNoonAlert();   // catch up immediately if it's already past noon
}

function checkNoonAlert() {
    if (!alertEnabled() || !lastForecastData) return;
    if (Notification.permission !== 'granted') return;

    const now = new Date();
    if (now.getHours() < 12) return;                       // only from noon onward
    const today = now.toISOString().slice(0, 10);
    if (localStorage.getItem('astro_alert_last') === today) return;  // once per day

    const night = computeNightScore(lastForecastData, 0);
    localStorage.setItem('astro_alert_last', today);       // mark checked either way
    if (!night || night.score < GOOD_NIGHT_THRESHOLD) return;

    const v = scoreVerdict(night.score);
    const windowTxt = night.bestWindow
        ? ` Best window: ${night.bestWindow.from}–${night.bestWindow.to}.`
        : '';
    new Notification(`${v.emoji} Tonight looks great for astrophotography! (${night.score}/100)`, {
        body: `${currentName}: ${night.avgCloud}% avg cloud, moon ${night.moonIllum}%.${windowTxt}`,
        tag: 'astro-noon-alert',
    });
}

function startAlertTimer() {
    // Check every minute; refetch fresh data shortly before noon so the
    // alert decision isn't based on a stale morning forecast.
    setInterval(async () => {
        const now = new Date();
        if (alertEnabled() && now.getHours() === 11 && now.getMinutes() === 58) {
            try { lastForecastData = await fetchForecast(currentLat, currentLon); } catch {}
        }
        checkNoonAlert();
    }, 60 * 1000);
}

// ── Starfield ────────────────────────────────────────────────
function initStarfield() {
    const canvas = document.getElementById('starfield');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let stars = [];

    function resize() {
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
        const count = Math.floor(canvas.width * canvas.height / 2800);
        stars = Array.from({ length: count }, () => ({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            r: Math.random() * 1.3 + 0.3,
            phase: Math.random() * Math.PI * 2,
            speed: Math.random() * 1.5 + 0.4,
        }));
    }

    function draw(t) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (const s of stars) {
            const a = 0.25 + 0.75 * Math.abs(Math.sin(s.phase + t / 1000 * s.speed));
            ctx.globalAlpha = a;
            ctx.fillStyle = '#cfe2ff';
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener('resize', resize);
    requestAnimationFrame(draw);
}

// ── Connectivity diagnostic ───────────────────────────────────
async function runDiagnostic(lat, lon) {
    const box = document.getElementById('diag-box');
    box.innerHTML = 'Running diagnostics…';
    box.style.display = 'block';

    const results = [];

    // 1. tiny Open-Meteo request
    const testUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m&timezone=auto`;
    try {
        const t0 = Date.now();
        const r = await fetch(testUrl, { mode: 'cors' });
        const ms = Date.now() - t0;
        if (r.ok) {
            const d = await r.json();
            results.push(`✅ Open-Meteo reachable (${ms} ms). Current temp: ${d.current?.temperature_2m ?? '?'}°C`);
        } else {
            results.push(`⚠️ Open-Meteo responded with HTTP ${r.status}`);
        }
    } catch (e) {
        results.push(`❌ Open-Meteo fetch failed: ${e.name} – ${e.message}`);
        results.push(`&nbsp;&nbsp;&nbsp;→ <a href="${testUrl}" target="_blank" rel="noopener">Open this URL directly</a> — if it shows JSON, an extension is blocking cross-origin requests from this page.`);
    }

    // 2. geocoding API
    const geoUrl = 'https://geocoding-api.open-meteo.com/v1/search?name=Baden&count=1';
    try {
        const r = await fetch(geoUrl, { mode: 'cors' });
        results.push(r.ok ? `✅ Geocoding API reachable (HTTP ${r.status})` : `⚠️ Geocoding API HTTP ${r.status}`);
    } catch (e) {
        results.push(`❌ Geocoding API failed: ${e.name}`);
    }

    box.innerHTML = results.join('<br>') +
        `<br><br><button id="retry-btn" style="margin-top:4px">Retry forecast</button>`;
    document.getElementById('retry-btn').addEventListener('click', () => {
        box.style.display = 'none';
        loadForecast(currentLat, currentLon, currentName);
    });
}

// ── Main render ──────────────────────────────────────────────
async function loadForecast(lat, lon, name) {
    const container = document.getElementById('forecast-container');
    const meta      = document.getElementById('forecast-meta');
    const loading   = document.getElementById('loading');
    const errEl     = document.getElementById('error-msg');
    const diagBox   = document.getElementById('diag-box');

    container.innerHTML = '';
    meta.classList.add('hidden');
    errEl.classList.add('hidden');
    document.getElementById('tonight-hero').classList.add('hidden');
    if (diagBox) diagBox.style.display = 'none';
    loading.classList.remove('hidden');

    try {
        const data = await fetchForecast(lat, lon);
        lastForecastData = data;
        renderHero(data, name);

        const tz = data.timezone || '';
        const now = new Date();
        const generated = now.toLocaleString();

        meta.innerHTML = `<strong>${name}</strong> &nbsp;(${lat.toFixed(4)}, ${lon.toFixed(4)})<br>
            <span style="color:#666;font-size:11px">Timezone: ${tz} &nbsp;|&nbsp; Generated: ${generated} &nbsp;|&nbsp;
            Forecast: ${data.daily.time[0]} to ${data.daily.time[data.daily.time.length - 1]}</span>`;
        meta.classList.remove('hidden');

        let html = '';
        const days = Math.min(FORECAST_DAYS, data.daily.time.length);
        for (let i = 0; i < days; i++) {
            html += renderDay(data.daily.time[i], data, i);
        }
        container.innerHTML = html;
        checkNoonAlert();   // catch up if the page was opened after noon
    } catch (err) {
        const isNetwork = err.message === 'network';
        errEl.innerHTML = isNetwork
            ? `<strong>Network error — could not reach Open-Meteo.</strong>
               <button id="diag-btn" style="margin-left:10px">Run diagnostics</button>
               <br><small style="color:#666">Common causes: ad/privacy blocker, corporate firewall,
               opening as a local <code>file://</code>, or sandboxed browser preview.</small>`
            : `<strong>API error:</strong> ${err.message}
               <button id="diag-btn" style="margin-left:10px">Run diagnostics</button>`;
        errEl.classList.remove('hidden');
        document.getElementById('diag-btn').addEventListener('click', () => runDiagnostic(lat, lon));
    } finally {
        loading.classList.add('hidden');
    }
}

// ── Saved Locations ──────────────────────────────────────────
function loadSaved() {
    try {
        savedLocations = JSON.parse(localStorage.getItem('astro_locs') || '[]');
    } catch { savedLocations = []; }
}

function saveCurrent() {
    const name = prompt('Name for this location:', currentName);
    if (!name) return;
    const existing = savedLocations.findIndex(l => l.name === name);
    const entry = { name: name.trim(), lat: currentLat, lon: currentLon };
    if (existing >= 0) savedLocations[existing] = entry;
    else savedLocations.push(entry);
    localStorage.setItem('astro_locs', JSON.stringify(savedLocations));
    renderChips();
}

function deleteLocation(idx) {
    savedLocations.splice(idx, 1);
    localStorage.setItem('astro_locs', JSON.stringify(savedLocations));
    renderChips();
}

function renderChips() {
    const chipsEl = document.getElementById('location-chips');
    chipsEl.innerHTML = savedLocations.map((loc, i) => `
        <div class="chip${loc.lat === currentLat && loc.lon === currentLon ? ' active' : ''}" data-idx="${i}">
            <span class="chip-name">${loc.name}</span>
            <span class="chip-del" data-del="${i}" title="Remove">×</span>
        </div>`).join('');

    chipsEl.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', e => {
            if (e.target.dataset.del != null) return;
            const loc = savedLocations[+chip.dataset.idx];
            if (!loc) return;
            currentLat = loc.lat;
            currentLon = loc.lon;
            currentName = loc.name;
            document.getElementById('lat-input').value = loc.lat;
            document.getElementById('lon-input').value = loc.lon;
            renderChips();
            loadForecast(loc.lat, loc.lon, loc.name);
        });
    });

    chipsEl.querySelectorAll('.chip-del').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            deleteLocation(+btn.dataset.del);
        });
    });
}

// ── Search ───────────────────────────────────────────────────
function showDropdown(results) {
    const dd = document.getElementById('search-dropdown');
    if (!results.length) { dd.classList.add('hidden'); return; }
    dd.innerHTML = results.map(r => {
        const parts = [r.admin1, r.country].filter(Boolean).join(', ');
        return `<div class="sdrop-item" data-lat="${r.latitude}" data-lon="${r.longitude}" data-name="${r.name}${parts ? ', ' + parts : ''}">
            <div>${r.name}</div>
            <div class="sdrop-sub">${parts}</div>
        </div>`;
    }).join('');
    dd.classList.remove('hidden');

    dd.querySelectorAll('.sdrop-item').forEach(item => {
        item.addEventListener('click', () => {
            const lat = parseFloat(item.dataset.lat);
            const lon = parseFloat(item.dataset.lon);
            const name = item.dataset.name;
            selectLocation(lat, lon, name);
            dd.classList.add('hidden');
            document.getElementById('location-input').value = name;
        });
    });
}

function selectLocation(lat, lon, name) {
    currentLat = lat;
    currentLon = lon;
    currentName = name;
    document.getElementById('lat-input').value = lat.toFixed(4);
    document.getElementById('lon-input').value = lon.toFixed(4);
    renderChips();
    loadForecast(lat, lon, name);
}

// ── Event Wiring ─────────────────────────────────────────────
function init() {
    initStarfield();
    updateAlertButton();
    startAlertTimer();
    document.getElementById('btn-alert').addEventListener('click', toggleAlert);

    loadSaved();

    // Ensure default is always in saved list
    if (!savedLocations.some(l => l.name === DEFAULT_LOCATION.name)) {
        savedLocations.unshift({ ...DEFAULT_LOCATION });
        localStorage.setItem('astro_locs', JSON.stringify(savedLocations));
    }

    renderChips();

    // Pre-fill lat/lon with default
    document.getElementById('lat-input').value = DEFAULT_LOCATION.lat;
    document.getElementById('lon-input').value = DEFAULT_LOCATION.lon;

    // Load default on startup
    loadForecast(DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lon, DEFAULT_LOCATION.name);

    // Search input with debounce
    const locInput = document.getElementById('location-input');
    locInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        const q = locInput.value.trim();
        if (q.length < 2) {
            document.getElementById('search-dropdown').classList.add('hidden');
            return;
        }
        const dd = document.getElementById('search-dropdown');
        dd.innerHTML = '<div class="sdrop-item sdrop-loading">Searching…</div>';
        dd.classList.remove('hidden');
        searchTimeout = setTimeout(async () => {
            try {
                const results = await geocode(q);
                showDropdown(results);
            } catch {
                dd.classList.add('hidden');
            }
        }, 350);
    });

    locInput.addEventListener('keydown', e => {
        if (e.key === 'Escape') document.getElementById('search-dropdown').classList.add('hidden');
    });

    // Close dropdown on outside click
    document.addEventListener('click', e => {
        if (!e.target.closest('.search-wrapper')) {
            document.getElementById('search-dropdown').classList.add('hidden');
        }
    });

    // Get forecast button
    document.getElementById('btn-forecast').addEventListener('click', () => {
        const lat = parseFloat(document.getElementById('lat-input').value);
        const lon = parseFloat(document.getElementById('lon-input').value);
        if (isNaN(lat) || isNaN(lon)) { alert('Please enter valid coordinates.'); return; }
        const name = document.getElementById('location-input').value.trim() || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
        selectLocation(lat, lon, name);
    });

    // Enter key on coord inputs
    ['lat-input', 'lon-input'].forEach(id => {
        document.getElementById(id).addEventListener('keydown', e => {
            if (e.key === 'Enter') document.getElementById('btn-forecast').click();
        });
    });

    locInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            const dd = document.getElementById('search-dropdown');
            const first = dd.querySelector('.sdrop-item:not(.sdrop-loading)');
            if (first) first.click();
        }
    });

    // Save location button
    document.getElementById('btn-save').addEventListener('click', () => {
        saveCurrent();
    });
}

document.addEventListener('DOMContentLoaded', init);
