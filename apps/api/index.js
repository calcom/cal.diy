const http = require("node:http");
const connect = require("connect");
const { createProxyMiddleware } = require("http-proxy-middleware");

const API_V1_PORT = process.env.API_V1_PORT || 3000;
const API_V2_PORT = process.env.API_V2_PORT || 5555;
const PROXY_PORT = process.env.API_PROXY_PORT || 3002;

const apiProxyV1 = createProxyMiddleware({
  target: `http://localhost:${API_V1_PORT}`,
});

const apiProxyV2 = createProxyMiddleware({
  target: `http://localhost:${API_V2_PORT}`,
});

const app = connect();
app.use("/v2", apiProxyV2);
app.use("/", apiProxyV1);

http.createServer(app).listen(PROXY_PORT);
