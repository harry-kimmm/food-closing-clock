import { useEffect, useMemo, useRef, useState } from "react";
import MapView from "./MapView";

import {
  AppBar, Toolbar, Typography, Box, Stack, Button, Slider,
  List, ListItemButton, ListItemText, Divider, Alert, Link
} from "@mui/material";
import MyLocationIcon from "@mui/icons-material/MyLocation";

const API = import.meta.env.VITE_API_URL;

export default function App() {
  const [center, setCenter] = useState({ lat: 34.0522, lon: -118.2437 });
  const [radiusMi, setRadiusMi] = useState(1);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  const abortRef = useRef(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCenter({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => { }
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
        const radiusKm = (radiusMi * 1.60934).toFixed(3);
        const qs = new URLSearchParams({
          lat: String(center.lat),
          lon: String(center.lon),
          radiusKm,
          limit: "20",
        }).toString();

        const res = await fetch(`${API}/closing?${qs}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setItems(Array.isArray(data.items) ? data.items : []);
      } catch (e) {
        if (e.name !== "AbortError") setErrMsg(e.message || "Network error");
      } finally {
        setLoading(false);
      }
    };

    const t = setTimeout(run, 200);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [center.lat, center.lon, radiusMi]);

  const centerLL = useMemo(() => [center.lat, center.lon], [center]);

  return (
    <Box sx={{ height: "100vh", display: "grid", gridTemplateRows: "auto 1fr" }}>
      <AppBar position="static" color="transparent" elevation={0} sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Toolbar sx={{ gap: 2 }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Food Finder
          </Typography>

          <Button startIcon={<MyLocationIcon />} onClick={() => {
            if (!navigator.geolocation) return;
            navigator.geolocation.getCurrentPosition(
              (pos) => setCenter({ lat: pos.coords.latitude, lon: pos.coords.longitude })
            );
          }}>
            Use my location
          </Button>

          <Stack direction="row" spacing={2} alignItems="center" sx={{ width: 260 }}>
            <Typography variant="body2" color="text.secondary">
              Radius {radiusMi.toFixed(1)} mi
            </Typography>
            <Slider
              size="small"
              min={0.25}
              max={3}
              step={0.25}
              value={radiusMi}
              onChange={(_, v) => setRadiusMi(v)}
            />
          </Stack>
        </Toolbar>
      </AppBar>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 400px" }, height: "100%" }}>
        <Box sx={{ position: "relative", height: "100%" }}>
          <MapView
            center={centerLL}
            radiusMi={radiusMi}
            items={items}
            onMapClick={(latlng) => setCenter({ lat: latlng.lat, lon: latlng.lng })}
          />
        </Box>

        <Box sx={{ borderLeft: { md: 1 }, borderColor: "divider", display: "flex", flexDirection: "column" }}>
          <Box sx={{ p: 1.5, borderBottom: 1, borderColor: "divider" }}>
            <Typography variant="subtitle1">Closing soon</Typography>
          </Box>

          {loading && <Box sx={{ p: 2 }}><Alert severity="info">Loading…</Alert></Box>}
          {errMsg && <Box sx={{ p: 2 }}><Alert severity="error">{errMsg}</Alert></Box>}
          {!loading && !errMsg && items.length === 0 && (
            <Box sx={{ p: 2, color: "text.secondary" }}>
              No places yet. Click the map to set a center, or adjust the radius.
            </Box>
          )}

          <List dense sx={{ flex: 1, overflow: "auto" }}>
            {items.map((p, i) => (
              <ListItemButton
                key={p.osmId || p.placeId || `${p.lat},${p.lon}-${i}`}
                onClick={() => setCenter({ lat: p.lat, lon: p.lon })}
              >
                <ListItemText
                  primary={<Typography fontWeight={600}>{p.name || "Unnamed place"}</Typography>}
                  secondary={
                    <span>
                      {formatCloses(p)} • {formatDistanceMi(p?.distanceKm)}
                    </span>
                  }
                />
                {isFinite(p?.minutesToClose) && (
                  <Typography variant="body2" color="text.secondary">
                    {p.minutesToClose}m
                  </Typography>
                )}
              </ListItemButton>
            ))}
          </List>

          <Divider />
          <Box sx={{ p: 1.2 }}>
            <Typography variant="caption" color="text.secondary">
              Data cached from <Link href="https://www.openstreetmap.org/" target="_blank" rel="noreferrer">OpenStreetMap</Link> — © OSM contributors
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

function formatCloses(p) {
  if (p?.closesAtLocal) return `Closes at ${p.closesAtLocal}`;
  if (isFinite(p?.minutesToClose)) return `Closes in ${p.minutesToClose}m`;
  return "Hours unknown";
}

function formatDistanceMi(km) {
  if (!isFinite(km)) return "";
  const mi = km * 0.621371;
  if (mi < 1) return `${Math.round(mi * 5280)} ft`;
  return `${mi.toFixed(1)} mi`;
}
