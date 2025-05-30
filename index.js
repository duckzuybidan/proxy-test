const http = require("http");
const https = require("https");
const net = require("net");
const url = require("url");

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});

// Handle HTTP requests
const handleHttpRequest = (clientRequest, clientResponse) => {
  const clientIP = clientRequest.socket.remoteAddress || "unknown";

  // If this is a direct request to your proxy (like /__myip), handle it specially
  if (clientRequest.url === "/__myip") {
    console.log(`[CHECK IP] Request from ${clientIP}`);
    https
      .get("https://api.ipify.org", (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          clientResponse.writeHead(200, { "Content-Type": "text/plain" });
          clientResponse.end(`Outbound IP from this server: ${data}\n`);
        });
      })
      .on("error", (err) => {
        console.error("Error getting outbound IP:", err.message);
        clientResponse.writeHead(500);
        clientResponse.end("Failed to get outbound IP\n");
      });
    return;
  }

  // Now handle normal proxy requests
  // clientRequest.url for proxy requests should be a full URL
  const parsedUrl = url.parse(clientRequest.url);

  // If no hostname (means this is not a proper proxy request)
  if (!parsedUrl.hostname) {
    clientResponse.writeHead(400, { "Content-Type": "text/plain" });
    clientResponse.end("Bad Request: Missing hostname\n");
    return;
  }

  console.log(
    `[HTTP] From IP: ${clientIP} -> ${clientRequest.method} ${clientRequest.url}`
  );

  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || 80,
    path: parsedUrl.path,
    method: clientRequest.method,
    headers: clientRequest.headers,
  };

  const proxyRequest = http.request(options, (proxyResponse) => {
    clientResponse.writeHead(proxyResponse.statusCode, proxyResponse.headers);
    proxyResponse.pipe(clientResponse);
  });

  clientRequest.pipe(proxyRequest);

  proxyRequest.on("error", (err) => {
    console.error("HTTP Proxy error:", err.message);
    clientResponse.writeHead(500);
    clientResponse.end("Proxy error");
  });
};

// Handle HTTPS CONNECT method
const handleConnect = (req, clientSocket, head) => {
  const { port, hostname } = new URL(`http://${req.url}`);
  const clientIP = clientSocket.remoteAddress;

  console.log(`[HTTPS] From IP: ${clientIP} -> CONNECT ${req.url}`);

  const serverSocket = net.connect(port || 443, hostname, () => {
    clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    serverSocket.write(head);
    serverSocket.pipe(clientSocket);
    clientSocket.pipe(serverSocket);
  });

  serverSocket.on("error", (err) => {
    console.error("HTTPS Proxy error:", err.message);
    clientSocket.end();
  });
};

// Create the proxy server
const server = http.createServer(handleHttpRequest);
server.on("connect", handleConnect);

// Start the server
const PORT = process.env.PORT || 4998;
server.listen(PORT, () => {
  console.log(
    `******************* PROXY STARTED ON http://localhost:${PORT} *******************\n`
  );
});
