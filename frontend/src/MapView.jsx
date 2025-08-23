import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, useMapEvents } from "react-leaflet";
import { useEffect } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

import marker2x from "leaflet/dist/images/marker-icon-2x.png";
import marker from "leaflet/dist/images/marker-icon.png";
import shadow from "leaflet/dist/images/marker-shadow.png";
L.Icon.Default.mergeOptions({ iconRetinaUrl: marker2x, iconUrl: marker, shadowUrl: shadow });

export default function MapView({ center, radiusKm, items, onMapClick }) {
    return (
        <MapContainer
            center={center}
            zoom={14}
            style={{ height: "100vh", width: "100%" }}
            scrollWheelZoom
            preferCanvas
        >
            <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            />

            <CenterController center={center} />
            <MapClick onMapClick={onMapClick} />

            <Circle center={center} radius={radiusKm * 1000} pathOptions={{ color: "#22d3ee", opacity: 0.6 }} />

            <Marker position={center}>
                <Popup>Search center<br />Radius: {radiusKm.toFixed(1)} km</Popup>
            </Marker>

            {items.map((p) => (
                <Marker key={p.osmId || p.placeId || `${p.lat},${p.lon}`} position={[p.lat, p.lon]}>
                    <Popup>
                        <strong>{p.name || "Unnamed place"}</strong><br />
                        {p.closesAtLocal ? `Closes at ${p.closesAtLocal}` : "Hours unknown"}<br />
                        {isFinite(p.distanceKm) ? `${p.distanceKm.toFixed(1)} km away` : ""}
                    </Popup>
                </Marker>
            ))}
        </MapContainer>
    );
}

function CenterController({ center }) {
    const map = useMap();
    useEffect(() => {
        map.setView(center, map.getZoom(), { animate: true });
    }, [center[0], center[1]]);
    return null;
}

function MapClick({ onMapClick }) {
    useMapEvents({
        click(e) {
            onMapClick?.(e.latlng);
        }
    });
    return null;
}
