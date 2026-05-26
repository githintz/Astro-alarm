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
async function fetchForecast(lat, lon) {
    const vars = [
        'temperature_2m','relative_humidity_2m','apparent_temperature',
        'dew_point_2m','precipitation_probability','precipitation',
        'weather_code','cloud_cover','cloud_cover_low','cloud_cover_mid',
        'cloud_cover_high','wind_speed_10m','wind_direction_10m',
        'surface_pressure','visibility'
    ].join(',');

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&hourly=${vars}&daily=sunrise,sunset&timezone=auto&forecast_days=8&wind_speed_unit=kmh`;

    const r = await fetch(url);
    if (!r.ok) throw new Error(`Open-Meteo error ${r.status}`);
    return r.json();
}

async function geocode(query) {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=6&language=en&format=json`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('Geocoding failed');
    const d = await r.json();
    return d.results || [];
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

// ── Main render ──────────────────────────────────────────────
async function loadForecast(lat, lon, name) {
    const container = document.getElementById('forecast-container');
    const meta      = document.getElementById('forecast-meta');
    const loading   = document.getElementById('loading');
    const errEl     = document.getElementById('error-msg');

    container.innerHTML = '';
    meta.classList.add('hidden');
    errEl.classList.add('hidden');
    loading.classList.remove('hidden');

    try {
        const data = await fetchForecast(lat, lon);

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
    } catch (err) {
        errEl.textContent = `Error loading forecast: ${err.message}`;
        errEl.classList.remove('hidden');
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
