import AVFoundation
import ExpoModulesCore
import UIKit
import VisionKit

public final class DocumentScannerModule: Module {
  private var activeDelegate: DocumentCameraScanDelegate?

  public func definition() -> ModuleDefinition {
    Name("DocumentScanner")

    AsyncFunction("isAvailableAsync") { () -> Bool in
      VNDocumentCameraViewController.isSupported
    }
    .runOnQueue(.main)

    AsyncFunction("scanAsync") { (promise: Promise) throws in
      guard self.activeDelegate == nil else {
        throw DocumentScannerInProgressException()
      }
      guard VNDocumentCameraViewController.isSupported else {
        throw DocumentScannerUnavailableException()
      }
      guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else {
        throw DocumentScannerPermissionException()
      }
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        throw DocumentScannerViewControllerException()
      }

      let scanner = VNDocumentCameraViewController()
      scanner.modalPresentationStyle = .fullScreen
      scanner.isModalInPresentation = true
      let delegate = DocumentCameraScanDelegate(promise: promise) { [weak self] finishedDelegate in
        guard self?.activeDelegate === finishedDelegate else { return }
        self?.activeDelegate = nil
      }
      scanner.delegate = delegate
      self.activeDelegate = delegate
      presenter.present(scanner, animated: true)
    }
    .runOnQueue(.main)

    AsyncFunction("releaseAsync") { (scanId: String) throws in
      guard let uuid = UUID(uuidString: scanId), uuid.uuidString.lowercased() == scanId.lowercased() else {
        throw DocumentScannerReleaseException()
      }
      let folder = Self.scanFolder(for: uuid)
      do {
        if FileManager.default.fileExists(atPath: folder.path) {
          try FileManager.default.removeItem(at: folder)
        }
      } catch {
        throw DocumentScannerWriteException()
      }
    }
    .runOnQueue(.main)
  }

  fileprivate static func scanFolder(for uuid: UUID) -> URL {
    FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("ScoreDocumentScanner", isDirectory: true)
      .appendingPathComponent(uuid.uuidString.lowercased(), isDirectory: true)
  }
}

private final class DocumentCameraScanDelegate: NSObject, VNDocumentCameraViewControllerDelegate {
  private static let maximumPageCount = 20
  private static let maximumPDFSizeBytes = 10 * 1024 * 1024

  private let promise: Promise
  private let onFinish: (DocumentCameraScanDelegate) -> Void
  private var didFinish = false

  init(promise: Promise, onFinish: @escaping (DocumentCameraScanDelegate) -> Void) {
    self.promise = promise
    self.onFinish = onFinish
  }

  func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
    guard beginFinishing() else { return }
    controller.dismiss(animated: true) { [self] in
      onFinish(self)
      promise.resolve(["cancelled": true])
    }
  }

  func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: Error) {
    guard beginFinishing() else { return }
    controller.dismiss(animated: true) { [self] in
      onFinish(self)
      let exception = DocumentScannerNativeFailureException(error: error)
      promise.reject(exception)
    }
  }

  func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
    guard beginFinishing() else { return }
    let pageCount = scan.pageCount
    controller.dismiss(animated: true) { [self] in
      DispatchQueue.global(qos: .userInitiated).async { [self] in
        do {
          let result = try Self.write(scan: scan, pageCount: pageCount)
          DispatchQueue.main.async { [self] in
            onFinish(self)
            promise.resolve(result)
          }
        } catch {
          DispatchQueue.main.async { [self] in
            onFinish(self)
            promise.reject((error as? Exception) ?? DocumentScannerNativeFailureException(error: error))
          }
        }
      }
    }
  }

  private func beginFinishing() -> Bool {
    guard !didFinish else { return false }
    didFinish = true
    return true
  }

  private static func write(scan: VNDocumentCameraScan, pageCount: Int) throws -> [String: Any] {
    guard pageCount > 0 else { throw DocumentScannerResultException() }
    guard pageCount <= maximumPageCount else { throw DocumentScannerPageLimitException() }

    let scanId = UUID()
    let scanFolder = DocumentScannerModule.scanFolder(for: scanId)
    let fileManager = FileManager.default
    do {
      try fileManager.createDirectory(at: scanFolder, withIntermediateDirectories: true)
    } catch {
      throw DocumentScannerWriteException()
    }

    let pdfURL = scanFolder.appendingPathComponent("partitura.pdf")
    var previews: [[String: Any]] = []
    var writeError: Error?
    let renderer = UIGraphicsPDFRenderer(bounds: CGRect(x: 0, y: 0, width: 595.28, height: 841.89))

    do {
      try renderer.writePDF(to: pdfURL) { context in
        for pageIndex in 0..<pageCount {
          let pageError = autoreleasepool { () -> Error? in
            let image = scan.imageOfPage(at: pageIndex)
            let imageSize = image.size
            guard image.cgImage != nil, imageSize.width > 0, imageSize.height > 0 else {
              return DocumentScannerResultException()
            }

            let isLandscape = imageSize.width > imageSize.height
            let pageBounds = isLandscape
              ? CGRect(x: 0, y: 0, width: 841.89, height: 595.28)
              : CGRect(x: 0, y: 0, width: 595.28, height: 841.89)
            let scale = min(pageBounds.width / imageSize.width, pageBounds.height / imageSize.height)
            let drawSize = CGSize(width: imageSize.width * scale, height: imageSize.height * scale)
            let drawRect = CGRect(
              x: (pageBounds.width - drawSize.width) / 2,
              y: (pageBounds.height - drawSize.height) / 2,
              width: drawSize.width,
              height: drawSize.height
            )

            context.beginPage(withBounds: pageBounds, pageInfo: [:])
            UIColor.white.setFill()
            context.cgContext.fill(pageBounds)
            image.draw(in: drawRect)

            do {
              let preview = try makePreview(for: image)
              let previewURL = scanFolder.appendingPathComponent("page-\(pageIndex + 1).jpg")
              try preview.data.write(to: previewURL, options: .atomic)
              previews.append([
                "uri": previewURL.absoluteString,
                "width": preview.width,
                "height": preview.height
              ])
              return nil
            } catch {
              return error
            }
          }
          if let pageError {
            writeError = pageError
            break
          }
        }
      }
    } catch {
      try? fileManager.removeItem(at: scanFolder)
      throw DocumentScannerWriteException()
    }

    if let writeError {
      try? fileManager.removeItem(at: scanFolder)
      if writeError is DocumentScannerResultException { throw writeError }
      throw DocumentScannerWriteException()
    }
    guard previews.count == pageCount, let attributes = try? fileManager.attributesOfItem(atPath: pdfURL.path),
          let fileSize = attributes[.size] as? NSNumber, fileSize.intValue > 0 else {
      try? fileManager.removeItem(at: scanFolder)
      throw DocumentScannerResultException()
    }
    guard fileSize.intValue <= maximumPDFSizeBytes else {
      try? fileManager.removeItem(at: scanFolder)
      throw DocumentScannerFileSizeException()
    }

    return [
      "uri": pdfURL.absoluteString,
      "name": "partitura-\(scanId.uuidString.lowercased()).pdf",
      "mimeType": "application/pdf",
      "pageCount": pageCount,
      "size": fileSize.intValue,
      "scanId": scanId.uuidString.lowercased(),
      "pages": previews
    ]
  }

  private static func makePreview(for image: UIImage) throws -> (data: Data, width: Int, height: Int) {
    let sourceSize = image.size
    let longestSide = max(sourceSize.width, sourceSize.height)
    guard longestSide > 0 else { throw DocumentScannerResultException() }
    let scale = min(1, 1600 / longestSide)
    let size = CGSize(
      width: max(1, (sourceSize.width * scale).rounded(.down)),
      height: max(1, (sourceSize.height * scale).rounded(.down))
    )
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = true
    let renderer = UIGraphicsImageRenderer(size: size, format: format)
    let preview = renderer.image { context in
      UIColor.white.setFill()
      context.fill(CGRect(origin: .zero, size: size))
      image.draw(in: CGRect(origin: .zero, size: size))
    }
    guard let data = preview.jpegData(compressionQuality: 0.9) else {
      throw DocumentScannerWriteException()
    }
    return (data, Int(size.width), Int(size.height))
  }
}

private final class DocumentScannerNativeFailureException: Exception {
  init(error: Error) {
    super.init()
    cause = error
  }

  override var code: String { "ERR_DOCUMENT_SCANNER_FAILED" }
  override var reason: String { "The document scanner could not finish the scan." }
}
