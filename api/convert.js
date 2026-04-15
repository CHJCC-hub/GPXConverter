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

            let lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l);

            for (let i = 0; i < lines.length; i++) {
                let line = lines[i];

                let lat = null, lon = null, name = "";

                // ===== 格式1：24.123,121.456 名稱 =====
                let match = line.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)(?:\s+(.*))?/);
                if (match) {
                    lat = parseFloat(match[1]);
                    lon = parseFloat(match[2]);
                    name = match[3] ? match[3].trim() : "";
                }

                // ===== 格式2：(24.123,121.456) =====
                if (lat === null) {
                    let match2 = line.match(/^\(?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)?(?:\s+(.*))?/);
                    if (match2) {
                        lat = parseFloat(match2[1]);
                        lon = parseFloat(match2[2]);
                        name = match2[3] ? match2[3].trim() : "";
                    }
                }

                // ===== 格式3：北24 東121 =====
                if (lat === null) {
                    let match3 = line.match(/([北南])\s*(\d+(?:\.\d+)?)°?\s*([東西])\s*(\d+(?:\.\d+)?)°?(?:\s+(.*))?/);
                    if (match3) {
                        let latVal = parseFloat(match3[2]);
                        let lonVal = parseFloat(match3[4]);

                        lat = (match3[1] === "南") ? -latVal : latVal;
                        lon = (match3[3] === "西") ? -lonVal : lonVal;

                        name = match3[5] ? match3[5].trim() : "";
                    }
                }

                // ===== 格式4：24° N, 121° E =====
                if (lat === null) {
                    let match4 = line.match(/(\d+(?:\.\d+)?)°?\s*([NS])\s*,\s*(\d+(?:\.\d+)?)°?\s*([EW])(?:\s+(.*))?/i);
                    if (match4) {
                        let latVal = parseFloat(match4[1]);
                        let lonVal = parseFloat(match4[3]);

                        lat = (match4[2].toUpperCase() === "S") ? -latVal : latVal;
                        lon = (match4[4].toUpperCase() === "W") ? -lonVal : lonVal;

                        name = match4[5] ? match4[5].trim() : "";
                    }
                }

                // ===== 名稱在前一行 =====
                if (lat !== null && lon !== null) {

                    if (!name && i > 0 && !lines[i - 1].match(/^\(?\s*-?\d/)) {
                        name = lines[i - 1];
                    }

                    // ===== 名稱在下一行 =====
                    if (!name && i + 1 < lines.length && !lines[i + 1].match(/^\(?\s*-?\d/)) {
                        name = lines[i + 1];
                        i++;
                    }

                    points.push({
                        lat,
                        lon,
                        name
                    });
                }
            }
        }

        // ===== 防呆 =====
        if (points.length === 0) {
            return res.status(400).send("No valid coordinates");
        }

        // ===== 種花模式 =====
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
                    lat: Number(newLat.toFixed(8)),
                    lon: Number(newLon.toFixed(8))
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
                let safeName = p.name.replace(/]]>/g, "]]]]><![CDATA[>");
                gpx += `<name><![CDATA[${safeName}]]></name>\n`;
            }

            gpx += `</wpt>\n`;
        });

        gpx += `</gpx>`;

        // ===== 檔名處理（完全修正）=====
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
