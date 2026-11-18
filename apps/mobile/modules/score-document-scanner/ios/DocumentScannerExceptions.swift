import ExpoModulesCore

internal final class DocumentScannerUnavailableException: Exception {
  override var code: String { "ERR_DOCUMENT_SCANNER_UNAVAILABLE" }
  override var reason: String { "The document scanner is unavailable on this device." }
}

internal final class DocumentScannerPermissionException: Exception {
  override var code: String { "ERR_DOCUMENT_SCANNER_PERMISSION_DENIED" }
  override var reason: String { "Camera access is not authorized." }
}

internal final class DocumentScannerInProgressException: Exception {
  override var code: String { "ERR_DOCUMENT_SCANNER_IN_PROGRESS" }
  override var reason: String { "A document scan is already in progress." }
}

internal final class DocumentScannerViewControllerException: Exception {
  override var code: String { "ERR_DOCUMENT_SCANNER_MISSING_VIEW_CONTROLLER" }
  override var reason: String { "The app has no active view controller to present the scanner." }
}

internal final class DocumentScannerResultException: Exception {
  override var code: String { "ERR_DOCUMENT_SCANNER_INVALID_RESULT" }
  override var reason: String { "The document scanner did not return a complete set of pages." }
}

internal final class DocumentScannerPageLimitException: Exception {
  override var code: String { "ERR_DOCUMENT_SCANNER_PAGE_LIMIT" }
  override var reason: String { "The scanned document exceeds the 20-page upload limit." }
}

internal final class DocumentScannerFileSizeException: Exception {
  override var code: String { "ERR_DOCUMENT_SCANNER_FILE_TOO_LARGE" }
  override var reason: String { "The scanned PDF exceeds the 10 MiB upload limit." }
}

internal final class DocumentScannerWriteException: Exception {
  override var code: String { "ERR_DOCUMENT_SCANNER_WRITE_FAILED" }
  override var reason: String { "The scanned PDF could not be saved to local storage." }
}

internal final class DocumentScannerReleaseException: Exception {
  override var code: String { "ERR_DOCUMENT_SCANNER_INVALID_SCAN_ID" }
  override var reason: String { "The scan identifier is invalid." }
}
