// 確認用の静的サーバ（node server.js → http://localhost:4192）
const http = require("http"), fs = require("fs"), path = require("path");
const T = { ".html": "text/html; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png", ".css": "text/css", ".js": "text/javascript" };
http.createServer((q, r) => {
  const f = path.join(__dirname, decodeURIComponent(q.url.split("?")[0]) === "/" ? "index.html" : decodeURIComponent(q.url.split("?")[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end("not found"); } r.writeHead(200, { "Content-Type": T[path.extname(f)] || "application/octet-stream" }); r.end(b); });
}).listen(process.env.PORT || 4192, () => console.log("http://localhost:" + (process.env.PORT || 4192)));
