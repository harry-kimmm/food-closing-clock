exports.handler = async (event) => {
    const qs = event.queryStringParameters || {};
    const lat = Number(qs.lat);
    const lon = Number(qs.lon);
    const radiusKm = Math.min(Math.max(Number(qs.radiusKm) || 1, 0.1), 3);

    console.log('closing request', { lat, lon, radiusKm });

    return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ok: true, items: [], meta: { lat, lon, radiusKm } }),
    };
};
