import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const OPEN_METEO = "https://api.open-meteo.com/v1/forecast";
const GEOCODE = "https://geocoding-api.open-meteo.com/v1/search";
const NOMINATIM_REVERSE = "https://nominatim.openstreetmap.org/reverse";

function shortPlaceFromNominatim(data) {
  const a = data.address || {};
  const locality =
    a.city ||
    a.town ||
    a.village ||
    a.municipality ||
    a.city_district ||
    a.suburb ||
    a.hamlet;
  const region = a.state || a.region || a.county;
  const country = a.country;
  const parts = [locality, region, country].filter(Boolean);
  if (parts.length) return [...new Set(parts)].slice(0, 4).join(", ");
  if (data.display_name) {
    const bits = String(data.display_name).split(", ");
    return bits.slice(0, 4).join(", ");
  }
  return null;
}

/** WMO weather interpretation codes (day) */
const weatherCodes = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Freezing drizzle",
  57: "Freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Freezing rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Thunderstorm with hail",
};

app.use(express.static(join(__dirname, "public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

/**
 * GET /api/search?q=london
 * City / place search via Open-Meteo geocoding.
 */
app.get("/api/search", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) {
    return res.status(400).json({ error: "Missing query parameter q" });
  }
  try {
    const url = `${GEOCODE}?name=${encodeURIComponent(q)}&count=8&language=en&format=json`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Geocode HTTP ${r.status}`);
    const data = await r.json();
    const results = (data.results || []).map((place) => ({
      name: place.name,
      admin1: place.admin1,
      country: place.country,
      latitude: place.latitude,
      longitude: place.longitude,
      label: [place.name, place.admin1, place.country].filter(Boolean).join(", "),
    }));
    res.json({ results });
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: "Geocoding failed" });
  }
});

/**
 * GET /api/reverse?lat=..&lon=..
 * Place name from coordinates (OpenStreetMap Nominatim; identify via User-Agent).
 */
app.get("/api/reverse", async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return res.status(400).json({ error: "Invalid or missing lat/lon" });
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json({ error: "lat must be [-90,90], lon must be [-180,180]" });
  }
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    format: "json",
    addressdetails: "1",
    "accept-language": "en",
  });
  try {
    const url = `${NOMINATIM_REVERSE}?${params}`;
    const r = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "WeatherDashboard/1.0 (https://open-meteo.com-based local app)",
      },
    });
    if (!r.ok) throw new Error(`Nominatim HTTP ${r.status}`);
    const data = await r.json();
    const label = shortPlaceFromNominatim(data);
    if (!label) {
      return res.status(404).json({ error: "No place name for these coordinates" });
    }
    res.json({ label });
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: "Reverse geocoding failed" });
  }
});

/**
 * GET /api/weather?lat=..&lon=..
 * Current conditions from Open-Meteo.
 */
app.get("/api/weather", async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return res.status(400).json({ error: "Invalid or missing lat/lon" });
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json({ error: "lat must be [-90,90], lon must be [-180,180]" });
  }

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: [
      "temperature_2m",
      "relative_humidity_2m",
      "apparent_temperature",
      "weather_code",
      "wind_speed_10m",
      "wind_direction_10m",
      "precipitation",
      "surface_pressure",
    ].join(","),
    timezone: "auto",
  });

  try {
    const url = `${OPEN_METEO}?${params}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Forecast HTTP ${r.status}`);
    const data = await r.json();
    const cur = data.current;
    if (!cur) {
      return res.status(502).json({ error: "No current data from provider" });
    }
    const code = cur.weather_code;
    res.json({
      latitude: data.latitude,
      longitude: data.longitude,
      timezone: data.timezone,
      utc_offset_seconds: data.utc_offset_seconds,
      current: {
        time: cur.time,
        temperature_c: cur.temperature_2m,
        apparent_temperature_c: cur.apparent_temperature,
        relative_humidity_percent: cur.relative_humidity_2m,
        weather_code: code,
        weather_label: weatherCodes[code] ?? "Unknown",
        wind_speed_kmh: cur.wind_speed_10m,
        wind_direction_deg: cur.wind_direction_10m,
        precipitation_mm: cur.precipitation,
        pressure_hpa: cur.surface_pressure,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: "Weather fetch failed" });
  }
});

app.listen(PORT, () => {
  console.log(`Weather app http://localhost:${PORT}`);
});
