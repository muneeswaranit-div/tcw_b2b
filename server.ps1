# =============================================================================
# CYCLE WORLD (TCW B2B) - ALWAYS-ON LAN & LOCALHOST HTTP SERVER (0.0.0.0:8080)
# Runs independently in the background even when Antigravity is closed.
# Accessible via http://localhost:8080 AND http://<LAN-IP>:8080
# =============================================================================
param(
    [int]$Port = 8080
)

$ErrorActionPreference = "Continue"
$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path

$CSharpServerCode = @"
using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;

public class CycleWorldLanServer
{
    private readonly int _port;
    private readonly string _rootDir;
    private readonly string _dbFilePath;
    private readonly object _dbLock = new object();
    private TcpListener _listener;
    private volatile bool _running;

    private static readonly Dictionary<string, string> MimeTypes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        { ".html", "text/html; charset=utf-8" },
        { ".css",  "text/css; charset=utf-8" },
        { ".js",   "application/javascript; charset=utf-8" },
        { ".json", "application/json; charset=utf-8" },
        { ".svg",  "image/svg+xml" },
        { ".png",  "image/png" },
        { ".jpg",  "image/jpeg" },
        { ".jpeg", "image/jpeg" },
        { ".webp", "image/webp" },
        { ".ico",  "image/x-icon" },
        { ".csv",  "text/csv; charset=utf-8" },
        { ".pdf",  "application/pdf" },
        { ".apk",  "application/vnd.android.package-archive" }
    };

    public CycleWorldLanServer(int port, string rootDir)
    {
        _port = port;
        _rootDir = rootDir;
        _dbFilePath = Path.Combine(_rootDir, "database", "cycleworld_db.json");
    }

    public void StartBlocking()
    {
        _listener = new TcpListener(IPAddress.Any, _port);
        _listener.Server.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
        _listener.Start(128);
        _running = true;

        while (_running)
        {
            try
            {
                TcpClient client = _listener.AcceptTcpClient();
                ThreadPool.QueueUserWorkItem(HandleClient, client);
            }
            catch (SocketException)
            {
                if (!_running) break;
            }
            catch (Exception)
            {
            }
        }
    }

    private void HandleClient(object state)
    {
        using (TcpClient client = (TcpClient)state)
        {
            try
            {
                client.ReceiveTimeout = 30000;
                client.SendTimeout = 30000;
                using (NetworkStream stream = client.GetStream())
                {
                    // Read HTTP header up to \r\n\r\n
                    MemoryStream headerBuf = new MemoryStream();
                    int b;
                    int matchState = 0;
                    while ((b = stream.ReadByte()) != -1)
                    {
                        headerBuf.WriteByte((byte)b);
                        if (matchState == 0 && b == '\r') matchState = 1;
                        else if (matchState == 1 && b == '\n') matchState = 2;
                        else if (matchState == 2 && b == '\r') matchState = 3;
                        else if (matchState == 3 && b == '\n') { matchState = 4; break; }
                        else matchState = (b == '\r') ? 1 : 0;

                        if (headerBuf.Length > 65536) break;
                    }

                    if (headerBuf.Length == 0) return;

                    string headerText = Encoding.ASCII.GetString(headerBuf.ToArray());
                    string[] lines = headerText.Split(new string[] { "\r\n" }, StringSplitOptions.None);
                    if (lines.Length == 0) return;

                    string[] reqParts = lines[0].Split(' ');
                    if (reqParts.Length < 2) return;

                    string method = reqParts[0].ToUpperInvariant();
                    string rawTarget = reqParts[1];
                    string urlPath = rawTarget;
                    int qIdx = urlPath.IndexOf('?');
                    if (qIdx >= 0) urlPath = urlPath.Substring(0, qIdx);
                    urlPath = Uri.UnescapeDataString(urlPath);

                    int contentLength = 0;
                    for (int i = 1; i < lines.Length; i++)
                    {
                        string line = lines[i];
                        if (string.IsNullOrEmpty(line)) break;
                        int colon = line.IndexOf(':');
                        if (colon > 0)
                        {
                            string hName = line.Substring(0, colon).Trim();
                            string hVal = line.Substring(colon + 1).Trim();
                            if (hName.Equals("Content-Length", StringComparison.OrdinalIgnoreCase))
                            {
                                int.TryParse(hVal, out contentLength);
                            }
                        }
                    }

                    byte[] bodyBytes = new byte[0];
                    if (contentLength > 0 && contentLength <= 100 * 1024 * 1024)
                    {
                        bodyBytes = new byte[contentLength];
                        int totalRead = 0;
                        while (totalRead < contentLength)
                        {
                            int n = stream.Read(bodyBytes, totalRead, contentLength - totalRead);
                            if (n <= 0) break;
                            totalRead += n;
                        }
                    }

                    if (method == "OPTIONS")
                    {
                        WriteResponse(stream, 200, "OK", "text/plain", new byte[0], null);
                        return;
                    }

                    if (urlPath.Equals("/api/health", StringComparison.OrdinalIgnoreCase))
                    {
                        byte[] resp = Encoding.UTF8.GetBytes("{\"status\":\"ok\",\"service\":\"Cycle World B2B LAN Server\"}");
                        WriteResponse(stream, 200, "OK", "application/json; charset=utf-8", resp, null);
                        return;
                    }

                    if (urlPath.Equals("/api/sync-db", StringComparison.OrdinalIgnoreCase) && method == "POST")
                    {
                        if (bodyBytes.Length > 10)
                        {
                            lock (_dbLock)
                            {
                                string dir = Path.GetDirectoryName(_dbFilePath);
                                if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
                                File.WriteAllBytes(_dbFilePath, bodyBytes);
                            }
                        }
                        byte[] resp = Encoding.UTF8.GetBytes("{\"saved\":true}");
                        WriteResponse(stream, 200, "OK", "application/json; charset=utf-8", resp, null);
                        return;
                    }

                    string relPath = (urlPath == "/" || string.IsNullOrEmpty(urlPath))
                        ? "index.html"
                        : urlPath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);

                    string fullPath = Path.GetFullPath(Path.Combine(_rootDir, relPath));
                    if (!fullPath.StartsWith(_rootDir, StringComparison.OrdinalIgnoreCase))
                    {
                        byte[] forbidden = Encoding.UTF8.GetBytes("403 Forbidden");
                        WriteResponse(stream, 403, "Forbidden", "text/plain; charset=utf-8", forbidden, null);
                        return;
                    }

                    if (File.Exists(fullPath))
                    {
                        string ext = Path.GetExtension(fullPath);
                        string mime;
                        if (!MimeTypes.TryGetValue(ext, out mime))
                        {
                            mime = "application/octet-stream";
                        }

                        byte[] fileBytes;
                        if (fullPath.Equals(_dbFilePath, StringComparison.OrdinalIgnoreCase))
                        {
                            lock (_dbLock)
                            {
                                fileBytes = File.ReadAllBytes(fullPath);
                            }
                        }
                        else
                        {
                            fileBytes = File.ReadAllBytes(fullPath);
                        }

                        string extraHeaders = null;
                        if (ext.Equals(".apk", StringComparison.OrdinalIgnoreCase))
                        {
                            string fileName = Path.GetFileName(fullPath);
                            extraHeaders = "Content-Disposition: attachment; filename=\"" + fileName + "\"\r\n";
                        }

                        WriteResponse(stream, 200, "OK", mime, fileBytes, extraHeaders);
                    }
                    else
                    {
                        byte[] notFound = Encoding.UTF8.GetBytes("404 Not Found");
                        WriteResponse(stream, 404, "Not Found", "text/plain; charset=utf-8", notFound, null);
                    }
                }
            }
            catch (Exception)
            {
            }
        }
    }

    private void WriteResponse(NetworkStream stream, int statusCode, string statusText, string contentType, byte[] body, string extraHeaders)
    {
        StringBuilder sb = new StringBuilder();
        sb.AppendFormat("HTTP/1.1 {0} {1}\r\n", statusCode, statusText);
        sb.AppendFormat("Content-Type: {0}\r\n", contentType);
        sb.AppendFormat("Content-Length: {0}\r\n", body.Length);
        sb.Append("Cache-Control: no-store, no-cache, must-revalidate, max-age=0\r\n");
        sb.Append("Pragma: no-cache\r\n");
        sb.Append("Expires: 0\r\n");
        sb.Append("Access-Control-Allow-Origin: *\r\n");
        sb.Append("Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n");
        sb.Append("Access-Control-Allow-Headers: Content-Type\r\n");
        sb.Append("Connection: close\r\n");
        if (!string.IsNullOrEmpty(extraHeaders))
        {
            sb.Append(extraHeaders);
        }
        sb.Append("\r\n");

        byte[] headerBytes = Encoding.ASCII.GetBytes(sb.ToString());
        stream.Write(headerBytes, 0, headerBytes.Length);
        if (body.Length > 0)
        {
            stream.Write(body, 0, body.Length);
        }
        stream.Flush();
    }
}
"@

Add-Type -TypeDefinition $CSharpServerCode -Language CSharp

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " Cycle World B2B Wholesale Ordering System Live on LAN:" -ForegroundColor Green
Write-Host " Local PC : http://localhost:$Port/" -ForegroundColor Yellow
Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notmatch '^127\.|^169\.254\.' } | ForEach-Object {
    Write-Host " LAN Wi-Fi: http://$($_.IPAddress):$Port/" -ForegroundColor Yellow
}
Write-Host "============================================================" -ForegroundColor Cyan

while ($true) {
    try {
        $Server = New-Object CycleWorldLanServer($Port, $RootDir)
        $Server.StartBlocking()
    } catch {
        Start-Sleep -Seconds 2
    }
}
