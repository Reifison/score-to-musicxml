import Foundation
import Network
import React

@objc(BundledScorePlayer)
final class BundledScorePlayer: NSObject {
  private let server = ScorePlayerLocalServer.shared

  @objc(getURL:rejecter:)
  func getURL(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    server.getURL(resolve: resolve, reject: reject)
  }

  @objc static func requiresMainQueueSetup() -> Bool { false }
}

private final class ScorePlayerLocalServer {
  static let shared = ScorePlayerLocalServer()

  private let queue = DispatchQueue(label: "com.scoretomusicxml.bundled-player")
  private let maxHeaderBytes = 8 * 1024
  private let maxFileBytes = 16 * 1024 * 1024
  private let maxConnections = 12
  private let chunkBytes = 64 * 1024
  private let csp = "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob:"

  private var listener: NWListener?
  private var port: UInt16?
  private var pending: [(RCTPromiseResolveBlock, RCTPromiseRejectBlock)] = []
  private var activeConnections = 0

  private init() {}

  func getURL(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    queue.async {
      guard self.bundleRoot() != nil else {
        reject("PLAYER_ASSETS_MISSING", "The bundled score player is unavailable.", nil)
        return
      }
      if let port = self.port {
        resolve("http://127.0.0.1:\(port)/mobile/player")
        return
      }
      self.pending.append((resolve, reject))
      if self.listener == nil { self.start() }
    }
  }

  private func bundleRoot() -> URL? {
    guard let root = Bundle.main.resourceURL?.appendingPathComponent("ScorePlayer", isDirectory: true),
      FileManager.default.fileExists(atPath: root.appendingPathComponent("player-release.html").path)
    else { return nil }
    return root
  }

  private func start() {
    let parameters = NWParameters.tcp
    parameters.requiredLocalEndpoint = .hostPort(host: NWEndpoint.Host("127.0.0.1"), port: .any)
    parameters.allowLocalEndpointReuse = false
    do {
      let next = try NWListener(using: parameters, on: .any)
      listener = next
      next.stateUpdateHandler = { [weak self, weak next] state in
        guard let self, let next, self.listener === next else { return }
        switch state {
        case .ready:
          guard let actualPort = next.port?.rawValue, actualPort != 0 else {
            self.failStart("The score player could not obtain a local port.")
            return
          }
          self.port = actualPort
          let url = "http://127.0.0.1:\(actualPort)/mobile/player"
          let waiting = self.pending
          self.pending.removeAll()
          waiting.forEach { $0.0(url) }
        case .failed:
          self.failStart("The local score player stopped unexpectedly.")
        case .waiting:
          // A URL from a listener that is no longer ready must not be reused.
          self.failStart("The local score player is temporarily unavailable.")
        case .cancelled:
          self.failStart("The local score player was cancelled.")
        default:
          break
        }
      }
      next.newConnectionHandler = { [weak self] connection in
        self?.accept(connection)
      }
      next.start(queue: queue)
      queue.asyncAfter(deadline: .now() + 8) { [weak self, weak next] in
        guard let self, let next, self.listener === next, self.port == nil else { return }
        self.failStart("The local score player did not become ready.")
      }
    } catch {
      failStart("The local score player could not start.")
    }
  }

  private func failStart(_ message: String) {
    let old = listener
    listener = nil
    port = nil
    old?.cancel()
    let waiting = pending
    pending.removeAll()
    waiting.forEach { $0.1("PLAYER_SERVER_UNAVAILABLE", message, nil) }
  }

  private func accept(_ connection: NWConnection) {
    guard port != nil, activeConnections < maxConnections else {
      connection.cancel()
      return
    }
    activeConnections += 1
    let context = ScorePlayerConnection(connection: connection) { [weak self] in
      guard let self else { return }
      self.activeConnections = max(0, self.activeConnections - 1)
    }
    connection.stateUpdateHandler = { state in
      switch state {
      case .failed, .cancelled: context.finish()
      default: break
      }
    }
    connection.start(queue: queue)
    queue.asyncAfter(deadline: .now() + 15) { context.finish() }
    readHeader(context, accumulated: Data())
  }

  private func readHeader(_ context: ScorePlayerConnection, accumulated: Data) {
    context.connection.receive(minimumIncompleteLength: 1, maximumLength: maxHeaderBytes) { [weak self] data, _, isComplete, error in
      guard let self, !context.finished else { return }
      if error != nil || isComplete { context.finish(); return }
      var header = accumulated
      if let data { header.append(data) }
      guard header.count <= self.maxHeaderBytes else {
        self.sendError(413, "Payload Too Large", context)
        return
      }
      guard let marker = header.range(of: Data("\r\n\r\n".utf8)) else {
        self.readHeader(context, accumulated: header)
        return
      }
      // The server accepts only a request header. Bytes after the first blank
      // line are ignored; no request body can be mapped to a bundled resource.
      let request = Data(header[..<marker.upperBound])
      self.handle(request, context)
    }
  }

  private func handle(_ request: Data, _ context: ScorePlayerConnection) {
    guard let text = String(data: request, encoding: .utf8) else {
      sendError(400, "Bad Request", context)
      return
    }
    let lines = text.components(separatedBy: "\r\n")
    guard let first = lines.first else { sendError(400, "Bad Request", context); return }
    let parts = first.split(separator: " ", omittingEmptySubsequences: false)
    guard parts.count == 3, parts[2] == "HTTP/1.1" else {
      sendError(400, "Bad Request", context)
      return
    }
    let method = String(parts[0])
    guard method == "GET" || method == "HEAD" else {
      sendError(405, "Method Not Allowed", context)
      return
    }
    guard let port, lines.filter({ $0.lowercased().hasPrefix("host:") }).count == 1,
      lines.contains(where: { $0.lowercased() == "host: 127.0.0.1:\(port)" }) else {
      sendError(403, "Forbidden", context)
      return
    }
    let path = String(parts[1])
    guard path.count <= 256, let resource = resourcePath(path), let root = bundleRoot() else {
      sendError(404, "Not Found", context)
      return
    }
    let file = root.appendingPathComponent(resource, isDirectory: false)
    let resolvedRoot = root.resolvingSymlinksInPath().path
    let resolvedFile = file.resolvingSymlinksInPath().path
    guard resolvedFile.hasPrefix(resolvedRoot + "/"),
      let attributes = try? FileManager.default.attributesOfItem(atPath: resolvedFile),
      attributes[.type] as? FileAttributeType == .typeRegular,
      let size = attributes[.size] as? NSNumber, size.intValue <= maxFileBytes,
      let body = try? Data(contentsOf: file, options: .mappedIfSafe) else {
      sendError(404, "Not Found", context)
      return
    }
    let mime = contentType(for: resource)
    let cache = resource == "player-release.html" ? "no-store" : "public, max-age=31536000, immutable"
    let headers = "HTTP/1.1 200 OK\r\nContent-Type: \(mime)\r\nContent-Length: \(body.count)\r\nCache-Control: \(cache)\r\nContent-Security-Policy: \(csp)\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n"
    send(Data(headers.utf8), context) { [weak self] in
      guard let self, !context.finished else { return }
      if method == "HEAD" { context.finish() }
      else { self.sendBody(body, offset: 0, context) }
    }
  }

  private func resourcePath(_ path: String) -> String? {
    if path == "/mobile/player" || path == "/mobile/player/" { return "player-release.html" }
    // Build output names are ASCII. Reject encoded separators, traversal,
    // queries, redirects, and arbitrary files even if they exist in the app.
    guard !path.contains("%"), !path.contains("?"), !path.contains("#"),
      !path.contains("\\"), !path.contains(".."), !path.contains("//") else { return nil }
    let asset = #"^/assets/[A-Za-z0-9_-]+\.(js|css|wasm)$"#
    let sample = #"^/audio/samples/(piano|guitar)/[a-z0-9-]+\.m4a$"#
    if path.range(of: asset, options: .regularExpression) != nil ||
      path.range(of: sample, options: .regularExpression) != nil {
      return String(path.dropFirst())
    }
    return nil
  }

  private func contentType(for path: String) -> String {
    if path.hasSuffix(".html") { return "text/html; charset=utf-8" }
    if path.hasSuffix(".js") { return "text/javascript; charset=utf-8" }
    if path.hasSuffix(".css") { return "text/css; charset=utf-8" }
    if path.hasSuffix(".wasm") { return "application/wasm" }
    return "audio/mp4"
  }

  private func sendError(_ code: Int, _ reason: String, _ context: ScorePlayerConnection) {
    let headers = "HTTP/1.1 \(code) \(reason)\r\nContent-Length: 0\r\nContent-Security-Policy: \(csp)\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n"
    send(Data(headers.utf8), context) { context.finish() }
  }

  private func sendBody(_ body: Data, offset: Int, _ context: ScorePlayerConnection) {
    guard !context.finished else { return }
    if offset >= body.count { context.finish(); return }
    let end = min(offset + chunkBytes, body.count)
    send(body.subdata(in: offset..<end), context) { [weak self] in
      self?.sendBody(body, offset: end, context)
    }
  }

  private func send(_ data: Data, _ context: ScorePlayerConnection, then completion: @escaping () -> Void) {
    context.connection.send(content: data, completion: .contentProcessed { error in
      if error != nil { context.finish() }
      else if !context.finished { completion() }
    })
  }
}

private final class ScorePlayerConnection {
  let connection: NWConnection
  private let onFinish: () -> Void
  private(set) var finished = false

  init(connection: NWConnection, onFinish: @escaping () -> Void) {
    self.connection = connection
    self.onFinish = onFinish
  }

  func finish() {
    guard !finished else { return }
    finished = true
    connection.cancel()
    onFinish()
  }
}
