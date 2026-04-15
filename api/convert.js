export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).send("Method Not Allowed");
    }

    try {
        let { text, filename, circleMode, radius, pointnum } = req.body;

        if (!text) {
            return res.status(400).send("No input text");
        }

        // ✅ 修正1：轉型（超重要）
        circleMode = (circleMode === true || circleMode === "true");
        radius = Number(radius);
        pointnum = Number(pointnum);

        let points = [];

        // ===== 解析 =====
        if (text.trim().startsWith("<")) {
            const matches = [...text.matchAll(/lat="([^"]+)" lon="([^"]+)"/g)];
            matches.forEach(m => {
                points.push({ lat: m[1], lon: m[2], name: "" });
            });
        } else {
            let lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l);

            for (let line of lines) {
                let match = line.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)(?:\s+(.*))?/);
                if (match) {
                    points.push({
                        lat: match[1],
                        lon: match[2],
                        name: match[3] || ""
                    });
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

        // ✅ 修正2：確保真的只有 true 才執行
        if (circleMode === true && radius > 0 && pointnum >= 3) {
            let newPoints = [];

            points.forEach(p => {
                let lat = parseFloat(p.lat);
                let lon = parseFloat(p.lon);

                let circle = generateCircle(lat, lon, radius, pointnum);

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
<gpx version="1.1" creator="API" xmlns="http://www.topografix.com/GPX/1/1">
`;

        points.forEach(p => {
            gpx += `<wpt lat="${p.lat}" lon="${p.lon}">\n`;
            if (p.name) {
                gpx += `<name><![CDATA[${p.name}]]></name>\n`;
            }
            gpx += `</wpt>\n`;
        });

        gpx += `</gpx>`;

        // ✅ 修正3：避免 iPhone header 爆炸（重點）
        const safeFilename = (filename || "converted")
            .replace(/[^\w\-]/g, "_");

        res.setHeader("Content-Type", "application/xml");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${safeFilename}.gpx"`
        );

        res.status(200).send(gpx);

    } catch (err) {
        res.status(500).send("Server Error: " + err.message);
    }
}
