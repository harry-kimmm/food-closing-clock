import { useEffect, useMemo, useRef, useState } from "react";
import MapView from "./MapView";
import Scoreboard from "./Scoreboard";

const API = import.meta.env.VITE_API_URL;

export default function App() {
  const [center, setCenter] = useState({ lat: 34.0522, lon: -118.2437 });
  const [radiusKm, setRadiusKm] = useState(1);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [lastFetchMeta, setLastFetchMeta] = useState(null);

  const abortRef = useRef(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCenter({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      () => { },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  }, []);

  useEffect(() => {
    if (!API) { setErrMsg("Missing VITE_API_URL"); return; }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const run = async () => {
      setLoading(true);
      setErrMsg("");
      try {
        const qs = new URLSearchParams({
          lat: String(center.lat),
          lon: String(center.lon),
          radiusKm: String(radiusKm),
          limit: "20",
        }).toString();

        const res = await fetch(`${API}/closing?${qs}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setItems(Array.isArray(data.items) ? data.items : []);
        setLastFetchMeta(data.meta || null);
      } catch (e) {
        if (e.name !== "AbortError") setErrMsg(e.message || "Network error");
      } finally {
        setLoading(false);
      }
    };

    const t = setTimeout(run, 200);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [center.lat, center.lon, radiusKm]);

  const centerLL = useMemo(() => [center.lat, center.lon], [center]);

  return (
    <div className="app-shell">
      <MapView
        center={centerLL}
        radiusKm={radiusKm}
        items={items}
        onMapClick={(latlng) => setCenter({ lat: latlng.lat, lon: latlng.lng })}
      />
      <aside className="panel scoreboard">
        <div className="header">
          <div>
            <strong>Closing soon near you</strong>
            <span className="badge">beta</span>
          </div>
        </div>

        <div className="controls">
          <button
            className="btn"
            onClick={() => {
              if (!navigator.geolocation) return;
              navigator.geolocation.getCurrentPosition(
                (pos) => setCenter({ lat: pos.coords.latitude, lon: pos.coords.longitude })
              );
            }}
          >
            Use my location
          </button>

          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            Radius ({radiusKm.toFixed(1)} km)
            <input
              className="range"
              type="range"
              min="0.3"
              max="3"
              step="0.1"
              value={radiusKm}
              onChange={(e) => setRadiusKm(Number(e.target.value))}
            />
          </label>
        </div>

        {loading && <div className="empty">Loading…</div>}
        {errMsg && <div className="empty">Error: {errMsg}</div>}
        {!loading && !errMsg && items.length === 0 && (
          <div className="empty">
            No places yet. Click the map to set a center, or adjust the radius.
          </div>
        )}

        <ul className="score-list">
          {items.map((p) => (
            <li
              key={p.osmId || p.placeId || `${p.lat},${p.lon}`}
              className="score-item"
              onClick={() => {
                setCenter({ lat: p.lat, lon: p.lon });
              }}
              title="Pan map to this place"
            >
              <div>
                <div className="score-title">{p.name || "Unnamed place"}</div>
                <div className="score-meta">
                  {formatCloses(p)} • {formatDistance(p?.distanceKm)}
                </div>
              </div>
              <div className="score-meta">
                {isFinite(p?.minutesToClose) ? `${p.minutesToClose}m` : ""}
              </div>
            </li>
          ))}
        </ul>

        <div className="footer">
          Data cached from <a href="https://www.openstreetmap.org/" target="_blank">OpenStreetMap</a> — © OSM contributors
        </div>
      </aside>
    </div>
  );
}

function formatCloses(p) {
  if (p?.closesAtLocal) return `Closes at ${p.closesAtLocal}`;
  if (isFinite(p?.minutesToClose)) return `Closes in ${p.minutesToClose}m`;
  return "Hours unknown";
}

function formatDistance(km) {
  if (!isFinite(km)) return "";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}
