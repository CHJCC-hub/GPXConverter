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

        if (isNaN(radius) || radius <= 0) radius = 30;
        if (isNaN(pointnum) || pointnum < 3) pointnum = 6;

        // ===== 種花函式（後端版）=====
        function generateCircle(lat, lon, radius, pointnum) {
            let result = [];
            let startAngle = -90;
            let angleStep = 360 / pointnum;

            for (let i = 0; i < pointnum; i++) {
                let angle = (startAngle + i * angleStep) * Math.PI / 180;

                let dx = radius * Math.cos(angle);
                let dy = radius * Math.sin(angle);

                let newLat = lat + (dy / 111320);
                let newLon = lon + (dx / (111320 * Math.cos(lat * Math.PI / 180)));

                result.push({
                    lat: newLat.toFixed(8),
                    lon: newLon.toFixed(8)
                });
            }

            // 關閉
            result.push(result[0]);

            return result;
        }

        // ===== 解析器 =====
        let points = [];
        let lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l);

        function parseLatLon(str) {
            str = str.replace(/[()]/g, "");

            // 1. 基本
            let basic = str.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
            if (basic) {
                return { lat: parseFloat(basic[1]), lon: parseFloat(basic[2]) };
            }

            // 2. 中文
            let zh = str.match(/([北南])\s*(\d+(?:\.\d+)?)°?\s*([東西])\s*(\d+(?:\.\d+)?)°?/);
            if (zh) {
                let lat = zh[1] === "南" ? -zh[2] : zh[2];
                let lon = zh[3] === "西" ? -zh[4] : zh[4];
                return { lat: parseFloat(lat), lon: parseFloat(lon) };
            }

            // 3. 英文
            let en = str.match(/(\d+(?:\.\d+)?)°?\s*([NS])\s*,\s*(\d+(?:\.\d+)?)°?\s*([EW])/i);
            if (en) {
                let lat = en[2].toUpperCase() === "S" ? -en[1] : en[1];
                let lon = en[4].toUpperCase() === "W" ? -en[3] : en[3];
                return { lat: parseFloat(lat), lon: parseFloat(lon) };
            }

            return null;
        }

        // ===== GPX =====
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

                    // 同行名稱
                    let extra = current.replace(/.*?,.*?/, "").trim();
                    if (extra && !parseLatLon(extra)) {
                        name = extra;
                    }

                    // 下一行名稱
                    else if (next && !parseLatLon(next)) {
                        name = next;
                        i++;
                    }

                    points.push({
                        lat: coord.lat,
                        lon: coord.lon,
                        name
                    });

                } else if (next) {
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

        if (points.length === 0) {
            return res.status(400).send("No valid points");
        }

        // ===== 種花模式（🔥重點修正）=====
        let finalPoints = [];

        if (circleMode) {
            points.forEach(p => {
                let circle = generateCircle(p.lat, p.lon, radius, pointnum);

                circle.forEach((pt, idx) => {
                    finalPoints.push({
                        lat: pt.lat,
                        lon: pt.lon,
                        name: p.name ? `${p.name}_${idx + 1}` : ""
                    });
                });
            });
        } else {
            finalPoints = points;
        }

        // ===== GPX輸出 =====
        let gpx = `<?xml version="1.0" encoding="utf-8"?>
<gpx version="1.1" creator="By JCC" xmlns="http://www.topografix.com/GPX/1/1">
`;

        finalPoints.forEach(p => {
            gpx += `<wpt lat="${p.lat}" lon="${p.lon}">\n`;

            if (p.name) {
                let safeName = p.name.replace(/]]>/g, "]]]]><![CDATA[>");
                gpx += `<name><![CDATA[${safeName}]]></name>\n`;
            }

            gpx += `</wpt>\n`;
        });

        gpx += `</gpx>`;

        // ===== 檔名（修正 emoji / 中文）=====
        let finalName = filename || "converted";
        const asciiName = finalName.replace(/[^\x20-\x7E]/g, "_");
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
