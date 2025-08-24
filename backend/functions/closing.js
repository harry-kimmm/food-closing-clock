/* eslint-disable */
// ---- AWS SDK v3 (Node.js 18 Lambda includes @aws-sdk/*) ----
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
    DynamoDBDocumentClient,
    BatchWriteCommand,
    QueryCommand,
    PutCommand,
} = require("@aws-sdk/lib-dynamodb");

const ddbDoc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const TABLE = process.env.TABLE_NAME;
const CACHE_TTL_SECONDS = parseInt(process.env.CACHE_TTL_SECONDS || "86400", 10); // 24h
const USER_AGENT = process.env.USER_AGENT || "LateNightFinder/1.0";
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

/* ========= Geohash (precision=6 ≈ ~1.2 km cells) ========= */
const GH_BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";
function geohashEncode(lat, lon, precision = 6) {
    let idx = 0, bit = 0, evenBit = true;
    let latMin = -90, latMax = 90, lonMin = -180, lonMax = 180;
    let hash = "";
    while (hash.length < precision) {
        if (evenBit) {
            const lonMid = (lonMin + lonMax) / 2;
            if (lon >= lonMid) { idx = (idx << 1) + 1; lonMin = lonMid; }
            else { idx = (idx << 1) + 0; lonMax = lonMid; }
        } else {
            const latMid = (latMin + latMax) / 2;
            if (lat >= latMid) { idx = (idx << 1) + 1; latMin = latMid; }
            else { idx = (idx << 1) + 0; latMax = latMid; }
        }
        evenBit = !evenBit;
        if (++bit === 5) { hash += GH_BASE32.charAt(idx); bit = 0; idx = 0; }
    }
    return hash;
}

/* ========= Haversine distance (km) ========= */
function distanceKm(aLat, aLon, bLat, bLon) {
    const R = 6371;
    const dLat = (bLat - aLat) * Math.PI / 180;
    const dLon = (bLon - aLon) * Math.PI / 180;
    const s1 = Math.sin(dLat / 2) ** 2;
    const s2 = Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s1 + s2));
}

/* ========= Local time helpers (single TZ for MVP) ========= */
const TZ = "America/Los_Angeles";
function nowLocal() {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: TZ, hour12: false,
        weekday: "short", hour: "2-digit", minute: "2-digit"
    }).formatToParts(now);
    const get = (t) => parts.find(p => p.type === t)?.value;
    const wd = get("weekday");
    const hh = parseInt(get("hour"), 10);
    const mm = parseInt(get("minute"), 10);
    const dayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
    return { dayIndex, minutes: hh * 60 + mm };
}

function fmt12h(minutes) {
    let h = Math.floor(minutes / 60) % 24, m = minutes % 60;
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = ((h + 11) % 12) + 1;
    return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

/* ========= Minimal opening_hours parser ========= */
const DAY_TO_IDX = { Su: 0, Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6 };
function parseOpeningHours(raw) {
    if (!raw || typeof raw !== "string") return [];
    raw = raw.trim();
    if (raw.toLowerCase() === "24/7") {
        return Array.from({ length: 7 }, (_, d) => ({ day: d, ranges: [{ start: 0, end: 1440 }] }));
    }
    const perDay = Array.from({ length: 7 }, () => ({ ranges: [] }));
    const rules = raw.split(";").map(s => s.trim()).filter(Boolean);
    for (const rule of rules) {
        const parts = rule.split(/\s+/);
        if (parts.length < 2) continue;
        const daysPart = parts[0];
        const timesJoined = parts.slice(1).join(" ");
        if (/(^|[\s,])off($|[\s,])/i.test(timesJoined)) continue;

        const days = [];
        for (const seg of daysPart.split(",")) {
            const m = seg.match(/^([A-Z][a-z])(?:-([A-Z][a-z]))?$/);
            if (!m) continue;
            const a = DAY_TO_IDX[m[1]];
            const b = m[2] ? DAY_TO_IDX[m[2]] : null;
            if (a == null) continue;
            if (b == null) days.push(a);
            else { let i = a; while (true) { days.push(i); if (i === b) break; i = (i + 1) % 7; } }
        }

        const timeRanges = timesJoined.split(",").map(t => t.trim()).map(t => {
            const m = t.match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
            if (!m) return null;
            const s = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
            const e = parseInt(m[3], 10) * 60 + parseInt(m[4], 10);
            return { start: s, end: e };
        }).filter(Boolean);

        for (const d of days) perDay[d].ranges.push(...timeRanges);
    }
    perDay.forEach(d => d.ranges.sort((a, b) => a.start - b.start));
    return perDay.map((d, i) => ({ day: i, ranges: d.ranges }));
}

function computeOpenNow(openingHours) {
    const { dayIndex: d, minutes: now } = nowLocal();
    const prev = (d + 6) % 7;
    const todayRanges = openingHours[d]?.ranges || [];
    const prevRanges = openingHours[prev]?.ranges || [];
    for (const r of todayRanges) {
        if (r.end > r.start && now >= r.start && now < r.end) {
            return { open: true, minutesToClose: r.end - now, closesAtLocal: fmt12h(r.end) };
        }
    }
    for (const r of prevRanges) {
        if (r.end <= r.start && now < r.end) {
            return { open: true, minutesToClose: r.end - now, closesAtLocal: fmt12h(r.end) };
        }
    }
    return { open: false };
}

/* ========= Dynamo helpers (v3) ========= */
async function batchPut(items) {
    if (!items.length) return;
    for (let i = 0; i < items.length; i += 25) {
        const chunk = items.slice(i, i + 25).map(Item => ({ PutRequest: { Item } }));
        await ddbDoc.send(new BatchWriteCommand({ RequestItems: { [TABLE]: chunk } }));
    }
}

async function queryAll(pk) {
    const out = [];
    let ExclusiveStartKey = undefined;
    do {
        const res = await ddbDoc.send(new QueryCommand({
            TableName: TABLE,
            KeyConditionExpression: "#pk = :pk",
            ExpressionAttributeNames: { "#pk": "pk" },
            ExpressionAttributeValues: { ":pk": pk },
            ExclusiveStartKey,
        }));
        out.push(...(res.Items || []));
        ExclusiveStartKey = res.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return out;
}

/* ========= Overpass (OSM) ========= */
async function fetchOverpass(lat, lon, radiusM) {
    const q = `
    [out:json][timeout:25];
    (
      node["amenity"~"restaurant|fast_food|cafe"](around:${Math.round(radiusM)},${lat},${lon});
      way["amenity"~"restaurant|fast_food|cafe"](around:${Math.round(radiusM)},${lat},${lon});
      relation["amenity"~"restaurant|fast_food|cafe"](around:${Math.round(radiusM)},${lat},${lon});
    );
    out center tags;
  `.trim();

    const res = await fetch(OVERPASS_URL, {
        method: "POST",
        headers: {
            "Content-Type": "text/plain",
            "Accept": "application/json",
            "User-Agent": USER_AGENT
        },
        body: q
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Overpass HTTP ${res.status}: ${text.slice(0, 180)}`);
    }
    const data = await res.json();
    return data?.elements || [];
}

/* ========= Handler ========= */
exports.handler = async (event) => {
    try {
        const qs = event.queryStringParameters || {};
        const lat = Number(qs.lat);
        const lon = Number(qs.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
            return json(400, { ok: false, error: "invalid_lat_lon" });
        }

        let radiusKm = Number(qs.radiusKm);
        if (!Number.isFinite(radiusKm)) radiusKm = 1;
        radiusKm = Math.min(Math.max(radiusKm, 0.3), 3);
        const limit = Math.min(Math.max(parseInt(qs.limit || "20", 10), 1), 50);

        console.info("closing request", { lat, lon, radiusKm });

        const cell = geohashEncode(lat, lon, 6);
        const pk = `cell#${cell}`;
        const nowMs = Date.now();
        const ttl = Math.floor(nowMs / 1000) + CACHE_TTL_SECONDS;

        // 1) read cache
        const existing = await queryAll(pk);
        const meta = existing.find(x => x.sk === "meta") || null;
        const cachedPlaces = existing.filter(x => (x.sk || "").startsWith("place#"));

        const stale = !meta || !meta.fetchedAt || (nowMs - meta.fetchedAt) > (CACHE_TTL_SECONDS * 1000);
        let fetchedCount = 0;

        // 2) fetch if stale
        if (stale) {
            const radiusM = Math.max(1000, Math.round(radiusKm * 1000));
            let elements = [];
            try {
                elements = await fetchOverpass(lat, lon, radiusM);
            } catch (e) {
                console.error("Overpass error:", e.message);
                if (!cachedPlaces.length) {
                    // serve empty if first-time area and Overpass is down
                    return json(200, { ok: true, items: [], meta: { cell, radiusKm, note: "overpass_unavailable" } });
                }
            }

            if (elements.length) {
                const toPut = [];
                for (const el of elements) {
                    const id = `${el.type}/${el.id}`;
                    const name = el.tags?.name || el.tags?.["name:en"] || null;
                    const plat = el.lat || el.center?.lat;
                    const plon = el.lon || el.center?.lon;
                    if (!Number.isFinite(plat) || !Number.isFinite(plon)) continue;

                    const category = el.tags?.amenity || null;
                    const opening_hours_raw = el.tags?.opening_hours;

                    toPut.push({
                        pk, sk: `place#${id}`,
                        osmId: id, name, lat: plat, lon: plon,
                        category, opening_hours_raw,
                        fetchedAt: nowMs, ttl
                    });
                }
                if (toPut.length) { fetchedCount = toPut.length; await batchPut(toPut); }
            }

            await ddbDoc.send(new PutCommand({
                TableName: TABLE, Item: { pk, sk: "meta", fetchedAt: nowMs, ttl }
            }));
        }

        // 3) final set
        const places = stale ? (await queryAll(pk)).filter(x => (x.sk || "").startsWith("place#")) : cachedPlaces;

        // 4) filter + open-now
        const out = [];
        for (const p of places) {
            const dist = distanceKm(lat, lon, p.lat, p.lon);
            if (dist > radiusKm) continue;

            let openInfo = { open: false };
            if (p.opening_hours_raw) {
                const perDay = parseOpeningHours(p.opening_hours_raw);
                openInfo = computeOpenNow(perDay);
            }
            if (!openInfo.open) continue;

            out.push({
                osmId: p.osmId,
                name: p.name || (p.category ? p.category : "Place"),
                lat: p.lat,
                lon: p.lon,
                distanceKm: Math.round(dist * 10) / 10,
                minutesToClose: Math.max(1, Math.round(openInfo.minutesToClose || 0)),
                closesAtLocal: openInfo.closesAtLocal || null
            });
        }

        out.sort((a, b) => a.minutesToClose - b.minutesToClose);
        const items = out.slice(0, limit);

        console.log("closing", {
            lat, lon, radiusKm,
            cell, cacheItems: places.length,
            fetchedCount, returned: items.length
        });

        return json(200, { ok: true, items, meta: { cell, radiusKm, count: items.length } });
    } catch (err) {
        console.error(err);
        return json(500, { ok: false, error: "server_error" });
    }
};

function json(code, obj) {
    return {
        statusCode: code,
        headers: {
            "content-type": "application/json",
            "access-control-allow-origin": "*"
        },
        body: JSON.stringify(obj)
    };
}
