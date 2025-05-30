const http = require("http");
const net = require("net");
const url = require("url");

// Handle HTTP requests
const handleHttpRequest = (clientRequest, clientResponse) => {
  const parsedUrl = url.parse(clientRequest.url);
  const clientIP = clientRequest.socket.remoteAddress || "unknown";

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
server.listen(4998, () => {
  console.log(
    "******************* PROXY STARTED ON http://localhost:4998 *******************\n"
  );
});
