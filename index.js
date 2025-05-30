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
  const parsedUrl = url.parse(clientRequest.url);
  const clientIP = clientRequest.socket.remoteAddress || "unknown";

  // Validate hostname
  if (!parsedUrl.hostname) {
    clientResponse.writeHead(400);
    clientResponse.end("Bad Request: Missing hostname\n");
    return;
  }

  // Special route to check outbound IP from this proxy
  if (parsedUrl.pathname === "/__myip") {
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

  // Regular proxy logging
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

  proxyRequest.setTimeout(30000, () => {
    proxyRequest.abort();
    clientResponse.writeHead(504);
    clientResponse.end("Gateway Timeout\n");
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
