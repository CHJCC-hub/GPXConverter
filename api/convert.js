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

        let points = [];
        let lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l);

        // ===== 座標解析 =====
        function parseLatLon(str) {
            str = str.replace(/[()]/g, "");

            // 一般格式
            let basic = str.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
            if (basic) {
                return {
                    lat: parseFloat(basic[1]),
                    lon: parseFloat(basic[2])
                };
            }

            // 中文（含南西）
            let zh = str.match(/([北南])\s*(\d+(?:\.\d+)?)°?\s*([東西])\s*(\d+(?:\.\d+)?)°?/);
            if (zh) {
                let lat = parseFloat(zh[2]);
                let lon = parseFloat(zh[4]);

                if (zh[1] === "南") lat *= -1;
                if (zh[3] === "西") lon *= -1;

                return { lat, lon };
            }

            // 英文（含 S W）
            let en = str.match(/(\d+(?:\.\d+)?)°?\s*([NnSs])\s*,\s*(\d+(?:\.\d+)?)°?\s*([EeWw])/);
            if (en) {
                let lat = parseFloat(en[1]);
                let lon = parseFloat(en[3]);

                if (en[2].toUpperCase() === "S") lat *= -1;
                if (en[4].toUpperCase() === "W") lon *= -1;

                return { lat, lon };
            }

            return null;
        }

        // ===== GPX 解析 =====
        if (text.trim().startsWith("<")) {
            const matches = [...text.matchAll(/lat="([^"]+)" lon="([^"]+)"/g)];
            matches.forEach(m => {
                let lat = parseFloat(m[1]);
                let lon = parseFloat(m[2]);

                if (!isNaN(lat) && !isNaN(lon)) {
                    points.push({ lat, lon, name: "" });
                }
            });
        } else {
            for (let i = 0; i < lines.length; i++) {
                let current = lines[i];
                let next = lines[i + 1];

                let coord = parseLatLon(current);

                if (coord) {
                    let name = "";

                    // 同行名稱（更安全）
                    let parts = current.split(",");
                    if (parts.length > 2) {
                        name = parts.slice(2).join(",").trim();
                    }

                    // 下一行名稱
                    else if (next && !parseLatLon(next)) {
                        name = next;
                        i++;
                    }

                    if (!isNaN(coord.lat) && !isNaN(coord.lon)) {
                        points.push({
                            lat: coord.lat,
                            lon: coord.lon,
                            name
                        });
                    }

                } else if (next) {
                    // 名稱在前
                    let coordNext = parseLatLon(next);
                    if (coordNext && !isNaN(coordNext.lat) && !isNaN(coordNext.lon)) {
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

        // ===== 種花模式 =====
        function generateCircle(lat, lon, radius, pointnum) {
            let result = [];
            let angleStep = 360 / pointnum;

            for (let i = 0; i < pointnum; i++) {
                let angle = (i * angleStep) * Math.PI / 180;

                let dx = radius * Math.cos(angle);
                let dy = radius * Math.sin(angle);

                let newLat = lat + (dy / 111320);
                let newLon = lon + (dx / (111320 * Math.cos(lat * Math.PI / 180)));

                result.push({
                    lat: newLat.toFixed(8),
                    lon: newLon.toFixed(8)
                });
            }

            result.push(result[0]);
            return result;
        }

        if (circleMode && radius > 0 && pointnum >= 3) {
            let newPoints = [];

            points.forEach(p => {
                let circle = generateCircle(p.lat, p.lon, radius, pointnum);

                circle.forEach((pt, idx) => {
                    newPoints.push({
                        lat: pt.lat,
                        lon: pt.lon,
                        name: p.name ? `${p.name}_${idx + 1}` : ""
                    });
                });
            });

            points = newPoints;
        }

        // ===== 生成 GPX =====
        let gpx = `<?xml version="1.0" encoding="utf-8"?>
<gpx version="1.1" creator="By JCC" xmlns="http://www.topografix.com/GPX/1/1">
`;

        points.forEach(p => {
            gpx += `<wpt lat="${p.lat}" lon="${p.lon}">\n`;
            if (p.name) {
                gpx += `<name><![CDATA[${p.name}]]></name>\n`;
            }
            gpx += `</wpt>\n`;
        });

        gpx += `</gpx>`;

        // ===== 檔名處理 =====
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
