const MOCK = [
    { placeId: "titos", name: "Tito's Tacos", lat: 34.0229, lon: -118.4058, hoursSummary: "Open late Fri–Sat" },
    { placeId: "sunset", name: "Sunset Diner", lat: 34.0983, lon: -118.3267, hoursSummary: "24/7" },
    { placeId: "ramen", name: "Midnight Ramen", lat: 34.0639, lon: -118.3020, hoursSummary: "Open till 2am" },
    { placeId: "boba", name: "Night Owl Boba", lat: 34.0421, lon: -118.2680, hoursSummary: "Open till 1am" },
];

exports.handler = async (event) => {
    try {
        const qs = event.queryStringParameters || {};
        const bboxStr = qs.bbox || "";
        const [minLon, minLat, maxLon, maxLat] = bboxStr.split(",").map(Number);

        const items = (!Number.isFinite(minLon) || !Number.isFinite(minLat) ||
            !Number.isFinite(maxLon) || !Number.isFinite(maxLat))
            ? MOCK
            : MOCK.filter(p =>
                p.lon >= minLon && p.lon <= maxLon && p.lat >= minLat && p.lat <= maxLat
            );

        return {
            statusCode: 200,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ok: true, items }),
        };
    } catch (err) {
        console.error(err);
        return { statusCode: 500, body: JSON.stringify({ ok: false, error: "server_error" }) };
    }
};
