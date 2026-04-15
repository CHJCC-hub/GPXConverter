export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).send("Method Not Allowed");
    }

    try {
        let { text, filename, circleMode, radius, pointnum } = req.body;

        if (!text) {
            return res.status(400).send("No input text");
        }

        // ===== 型別修正 =====
        circleMode = (circleMode === true || circleMode === "true");
        radius = Number(radius);
        pointnum = Number(pointnum);


// ===== 超強解析器（支援多格式）=====
let points = [];
let lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l);

function parseLatLon(str) {
    // 移除括號
    str = str.replace(/[()]/g, "");

    // ===== 格式1：一般 24.123,121.456 =====
    let basic = str.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    if (basic) {
        return {
            lat: parseFloat(basic[1]),
            lon: parseFloat(basic[2])
        };
    }

    // ===== 格式2：中文 北xx 東xx =====
    let zh = str.match(/北\s*(\d+(?:\.\d+)?)°?\s*東\s*(\d+(?:\.\d+)?)°?/);
    if (zh) {
        return {
            lat: parseFloat(zh[1]),
            lon: parseFloat(zh[2])
        };
    }

    // ===== 格式3：英文 xx° N, xx° E =====
    let en = str.match(/(\d+(?:\.\d+)?)°?\s*[Nn]\s*,\s*(\d+(?:\.\d+)?)°?\s*[Ee]/);
    if (en) {
        return {
            lat: parseFloat(en[1]),
            lon: parseFloat(en[2])
        };
    }

    return null;
}

// ===== GPX 解析 =====
if (text.trim().startsWith("<")) {
    const matches = [...text.matchAll(/lat="([^"]+)" lon="([^"]+)"/g)];
    matches.forEach(m => {
        points.push({
            lat: parseFloat(m[1]),
            lon: parseFloat(m[2]),
            name: ""
        });
    });
} else {

    for (let i = 0; i < lines.length; i++) {
        let current = lines[i];
        let next = lines[i + 1];

        let coord = parseLatLon(current);

        if (coord) {
            let name = "";

            // 情境1：同一行有名稱
            let extra = current.replace(/.*?,.*?/, "").trim();
            if (extra && !parseLatLon(extra)) {
                name = extra;
            }

            // 情境2：下一行是名稱
            else if (next && !parseLatLon(next)) {
                name = next;
                i++; // 跳過下一行
            }

            points.push({
                lat: coord.lat,
                lon: coord.lon,
                name
            });

        } else if (next) {
            // 情境3：名稱在前
            let coordNext = parseLatLon(next);
            if (coordNext) {
                points.push({
                    lat: coordNext.lat,
                    lon: coordNext.lon,
                    name: current
                });
                i++;
            }
        }
    }
}

        // ===== 生成 GPX =====
        let gpx = `<?xml version="1.0" encoding="utf-8"?>
<gpx version="1.1" creator="JCC" xmlns="http://www.topografix.com/GPX/1/1">
`;

        points.forEach(p => {
            gpx += `<wpt lat="${p.lat}" lon="${p.lon}">\n`;
            if (p.name) {
                gpx += `<name><![CDATA[${p.name}]]></name>\n`;
            }
            gpx += `</wpt>\n`;
        });

        gpx += `</gpx>`;

        // ===== 檔名處理（支援中文 + emoji）=====
        let finalName = filename || "converted";

        // fallback（給舊系統）
        const asciiName = finalName.replace(/[^\x20-\x7E]/g, "_");

        // UTF-8 encode（重點）
        const encodedName = encodeURIComponent(finalName);

        res.setHeader("Content-Type", "application/xml");

        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${asciiName}.gpx"; filename*=UTF-8''${encodedName}.gpx`
        );

        res.status(200).send(gpx);

    } catch (err) {
        res.status(500).send("Server Error: " + err.message);
    }
}
