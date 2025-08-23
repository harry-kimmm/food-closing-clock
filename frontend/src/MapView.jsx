import { useEffect } from "react";
import { useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import marker2x from "leaflet/dist/images/marker-icon-2x.png";
import marker from "leaflet/dist/images/marker-icon.png";
import shadow from "leaflet/dist/images/marker-shadow.png";

const API = import.meta.env.VITE_API_URL;

L.Icon.Default.mergeOptions({
    iconRetinaUrl: marker2x,
    iconUrl: marker,
    shadowUrl: shadow,
});

function FetchOnMove({ onBounds }) {
    useMapEvents({
        moveend: (e) => {
            const m = e.target;
            const b = m.getBounds();
            const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].join(",");
            onBounds?.(bbox);
        },
        click: (e) => {
            console.log("map click:", e.latlng);
        },
    });
    return null;
}

export default function MapView() {
    const [places, setPlaces] = useState([]);

    const onBounds = async (bbox) => {
        try {
            const res = await fetch(`${API}/places?bbox=${bbox}`);
            const data = await res.json();
            setPlaces(data.items || []);
        } catch (e) {
            console.error(e);
        }
    };


    return (
        <MapContainer center={[34.0522, -118.2437]} zoom={13} style={{ height: "100vh", width: "100vw" }}>
            <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors'
            />
            <FetchOnMove onBounds={onBounds} />
            {places.map(p => (
                <Marker key={p.placeId} position={[p.lat, p.lon]}>
                    <Popup><strong>{p.name}</strong><br />{p.hoursSummary}</Popup>
                </Marker>
            ))}
        </MapContainer>
    );
}
