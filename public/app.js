const form = document.getElementById("search-form");
const cityInput = document.getElementById("city");
const suggestionsEl = document.getElementById("suggestions");
const coordsForm = document.getElementById("coords-form");
const latInput = document.getElementById("latitude");
const lonInput = document.getElementById("longitude");
const errorEl = document.getElementById("error");
const card = document.getElementById("card");

const tempEl = document.getElementById("temp");
const conditionEl = document.getElementById("condition");
const feelsEl = document.getElementById("feels");
const humidityEl = document.getElementById("humidity");
const windEl = document.getElementById("wind");
const precipEl = document.getElementById("precip");
const pressureEl = document.getElementById("pressure");
const localtimeEl = document.getElementById("localtime");
const coordsLabelEl = document.getElementById("coords-label");
const placeNameEl = document.getElementById("place-name");

let debounceTimer;

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.remove("hidden");
}

function clearError() {
  errorEl.textContent = "";
  errorEl.classList.add("hidden");
}

async function fetchWeather(lat, lon) {
  clearError();
  const r = await fetch(`/api/weather?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(data.error || "Could not load weather");
  }
  return data;
}

async function fetchPlaceLabel(lat, lon) {
  const r = await fetch(
    `/api/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`
  );
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return null;
  return data.label || null;
}

async function renderWeather(data, placeLabel) {
  if (placeLabel) {
    placeNameEl.textContent = placeLabel;
  } else {
    placeNameEl.textContent = "…";
    const label = await fetchPlaceLabel(data.latitude, data.longitude);
    placeNameEl.textContent = label || "Unknown place";
  }

  const c = data.current;
  tempEl.textContent =
    c.temperature_c != null ? Math.round(c.temperature_c * 10) / 10 : "—";
  conditionEl.textContent = c.weather_label || "—";
  const feels =
    c.apparent_temperature_c != null
      ? `${Math.round(c.apparent_temperature_c * 10) / 10}°C`
      : "—";
  feelsEl.textContent = `Feels like ${feels}`;
  humidityEl.textContent =
    c.relative_humidity_percent != null ? `${c.relative_humidity_percent}%` : "—";
  const wind =
    c.wind_speed_kmh != null && c.wind_direction_deg != null
      ? `${c.wind_speed_kmh} km/h · ${c.wind_direction_deg}°`
      : c.wind_speed_kmh != null
        ? `${c.wind_speed_kmh} km/h`
        : "—";
  windEl.textContent = wind;
  precipEl.textContent =
    c.precipitation_mm != null ? `${c.precipitation_mm} mm` : "—";
  pressureEl.textContent =
    c.pressure_hpa != null ? `${Math.round(c.pressure_hpa)} hPa` : "—";
  localtimeEl.textContent = c.time || "—";
  coordsLabelEl.textContent = `${data.latitude?.toFixed(2)}, ${data.longitude?.toFixed(2)}`;
  card.classList.remove("hidden");
}

async function loadSuggestions(q) {
  const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Search failed");
  return data.results || [];
}

cityInput.addEventListener("input", () => {
  clearError();
  const q = cityInput.value.trim();
  clearTimeout(debounceTimer);
  if (q.length < 2) {
    suggestionsEl.classList.add("hidden");
    suggestionsEl.innerHTML = "";
    return;
  }
  debounceTimer = setTimeout(async () => {
    try {
      const results = await loadSuggestions(q);
      suggestionsEl.innerHTML = "";
      if (results.length === 0) {
        suggestionsEl.classList.add("hidden");
        return;
      }
      results.forEach((place) => {
        const li = document.createElement("li");
        li.setAttribute("role", "option");
        li.textContent = place.label;
        li.addEventListener("click", async () => {
          suggestionsEl.classList.add("hidden");
          cityInput.value = place.label;
          latInput.value = String(place.latitude);
          lonInput.value = String(place.longitude);
          try {
            const data = await fetchWeather(place.latitude, place.longitude);
            await renderWeather(data, place.label);
          } catch (e) {
            showError(e.message);
          }
        });
        suggestionsEl.appendChild(li);
      });
      suggestionsEl.classList.remove("hidden");
    } catch (e) {
      showError(e.message);
    }
  }, 320);
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError();
  const q = cityInput.value.trim();
  if (q.length < 2) {
    showError("Type at least 2 characters to search.");
    return;
  }
  try {
    const results = await loadSuggestions(q);
    if (results.length === 0) {
      showError("No places found. Try another name.");
      return;
    }
    const first = results[0];
    latInput.value = String(first.latitude);
    lonInput.value = String(first.longitude);
    const data = await fetchWeather(first.latitude, first.longitude);
    await renderWeather(data, first.label);
    suggestionsEl.classList.add("hidden");
  } catch (err) {
    showError(err.message);
  }
});

coordsForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError();
  const lat = parseFloat(latInput.value);
  const lon = parseFloat(lonInput.value);
  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    showError("Enter valid numbers for latitude and longitude.");
    return;
  }
  try {
    const data = await fetchWeather(lat, lon);
    await renderWeather(data, null);
  } catch (err) {
    showError(err.message);
  }
});

document.addEventListener("click", (e) => {
  if (!suggestionsEl.contains(e.target) && e.target !== cityInput) {
    suggestionsEl.classList.add("hidden");
  }
});
