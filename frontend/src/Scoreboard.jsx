export default function Scoreboard({ items, onRowClick }) {
    if (!items?.length) return <div className="empty">No places yet.</div>;
    return (
        <ul className="score-list">
            {items.map((p) => (
                <li
                    key={p.osmId || p.placeId || `${p.lat},${p.lon}`}
                    className="score-item"
                    onClick={() => onRowClick?.(p)}
                >
                    <div>
                        <div className="score-title">{p.name || "Unnamed place"}</div>
                        <div className="score-meta">
                            {p.closesAtLocal ? `Closes at ${p.closesAtLocal}` : "Hours unknown"}
                            {isFinite(p.distanceKm) ? ` • ${formatDistance(p.distanceKm)}` : ""}
                        </div>
                    </div>
                    <div className="score-meta">
                        {isFinite(p?.minutesToClose) ? `${p.minutesToClose}m` : ""}
                    </div>
                </li>
            ))}
        </ul>
    );
}

function formatDistance(km) {
    if (!isFinite(km)) return "";
    if (km < 1) return `${Math.round(km * 1000)} m`;
    return `${km.toFixed(1)} km`;
}
