const http = require("node:http");
const connect = require("connect");
const { createProxyMiddleware } = require("http-proxy-middleware");

const apiProxyV1 = createProxyMiddleware({
  target: "http://localhost:3003",
});

const apiProxyV2 = createProxyMiddleware({
  target: "http://localhost:3004",
});

const app = connect();
app.use("/v2", apiProxyV2);
app.use("/", apiProxyV1);

http.createServer(app).listen(3002);
