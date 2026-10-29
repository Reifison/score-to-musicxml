import ExpoModulesCore
import UIKit

private struct ReservedRegionSnapshot: Equatable {
  let x: CGFloat
  let y: CGFloat
  let width: CGFloat
  let height: CGFloat
  let kind: String
  let active: Bool

  var payload: [String: Any] {
    [
      "x": Double(x),
      "y": Double(y),
      "width": Double(width),
      "height": Double(height),
      "kind": kind,
      "active": active,
    ]
  }
}

private struct AdaptiveLayoutSnapshot: Equatable {
  let width: CGFloat
  let height: CGFloat
  let insets: UIEdgeInsets
  let regions: [ReservedRegionSnapshot]
  let fontScale: CGFloat
  let contentSizeCategory: String
  var barFrames: [String: CGRect] = [:]

  var payload: [String: Any] {
    [
      "bounds": ["width": Double(width), "height": Double(height)],
      "safeAreaInsets": [
        "top": Double(insets.top),
        "right": Double(insets.right),
        "bottom": Double(insets.bottom),
        "left": Double(insets.left),
      ],
      "regions": regions.map(\.payload),
      "fontScale": Double(fontScale),
      "contentSizeCategory": contentSizeCategory,
      "barFrames": barFrames.mapValues { rect in
        ["x": Double(rect.minX), "y": Double(rect.minY), "width": Double(rect.width), "height": Double(rect.height)]
      },
    ]
  }

  static let empty = AdaptiveLayoutSnapshot(
    width: 0,
    height: 0,
    insets: .zero,
    regions: [],
    fontScale: 1,
    contentSizeCategory: UIContentSizeCategory.unspecified.rawValue
  )
}

#if DEBUG
private struct AdaptiveLayoutDebugMetrics: Equatable {
  let width: CGFloat
  let height: CGFloat
  let topInset: CGFloat
  let rightInset: CGFloat
  let bottomInset: CGFloat
  let leftInset: CGFloat
  let fontScale: CGFloat
  let contentSizeCategory: String
  let barFrames: [String: CGRect]
}
#endif

/// A transparent child view ties changes in the active React Native window to
/// UIKit layout and safe-area updates without participating in hit testing.
private final class AdaptiveLayoutProbe: UIView {
  var onLayoutChange: (() -> Void)?

  override func layoutSubviews() {
    super.layoutSubviews()
    onLayoutChange?()
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    onLayoutChange?()
  }

  override func safeAreaInsetsDidChange() {
    super.safeAreaInsetsDidChange()
    onLayoutChange?()
  }

  override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
    super.traitCollectionDidChange(previousTraitCollection)
    onLayoutChange?()
  }

  override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
    false
  }
}

/// CADisplayLink requires an NSObject target. Expo Modules' Module base class
/// is not an NSObject, so a retained delegate forwards ticks through a closure.
private final class AdaptiveLayoutDisplayLinkTarget: NSObject {
  private let onFrame: () -> Void

  init(onFrame: @escaping () -> Void) {
    self.onFrame = onFrame
  }

  @objc func sample(_ displayLink: CADisplayLink) {
    onFrame()
  }
}

public final class AdaptiveLayoutModule: Module {
  private var probe: AdaptiveLayoutProbe?
  private weak var observedRoot: UIView?
  private weak var observedWindow: UIWindow?
  private var notificationTokens: [NSObjectProtocol] = []
  private var displayLink: CADisplayLink?
  private var displayLinkTarget: AdaptiveLayoutDisplayLinkTarget?
  private var lastPublishedSnapshot: AdaptiveLayoutSnapshot?
  private var revision = 0
  private var hasListeners = false
#if DEBUG
  private var lastLoggedMetrics: AdaptiveLayoutDebugMetrics?
#endif

  public func definition() -> ModuleDefinition {
    Name("AdaptiveLayout")

    Events("snapshotChanged")

    AsyncFunction("getSnapshot") { () -> [String: Any] in
      let snapshot = self.makeSnapshot()
      self.logMetricsIfChanged(snapshot)
      var payload = snapshot.payload
      payload["revision"] = self.revision
      return payload
    }
    .runOnQueue(.main)

    OnStartObserving("snapshotChanged") {
      self.runOnMain { self.startObserving() }
    }

    OnStopObserving("snapshotChanged") {
      self.runOnMain { self.stopObserving() }
    }

    OnDestroy {
      self.runOnMain { self.stopObserving() }
    }
  }

  private func runOnMain(_ action: @escaping () -> Void) {
    if Thread.isMainThread {
      action()
    } else {
      DispatchQueue.main.async(execute: action)
    }
  }

  private func startObserving() {
    guard !hasListeners else { return }
    hasListeners = true

    let center = NotificationCenter.default
    let names: [Notification.Name] = [
      UIScene.didActivateNotification,
      UIScene.willDeactivateNotification,
      UIScene.didDisconnectNotification,
      UIApplication.didBecomeActiveNotification,
      UIApplication.willResignActiveNotification,
      UIApplication.didEnterBackgroundNotification,
      UIApplication.willEnterForegroundNotification,
      UIWindow.didBecomeKeyNotification,
      UIWindow.didResignKeyNotification,
      UIDevice.orientationDidChangeNotification,
      UIContentSizeCategory.didChangeNotification,
    ]
    notificationTokens = names.map { name in
      center.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
        self?.refresh()
      }
    }

    refresh()
  }

  private func stopObserving() {
    hasListeners = false
    for token in notificationTokens {
      NotificationCenter.default.removeObserver(token)
    }
    notificationTokens.removeAll()
    displayLink?.invalidate()
    displayLink = nil
    displayLinkTarget = nil
    probe?.removeFromSuperview()
    probe = nil
    observedRoot = nil
    observedWindow = nil
    lastPublishedSnapshot = nil
#if DEBUG
    lastLoggedMetrics = nil
#endif
  }

  private func currentWindow() -> UIWindow? {
    if let viewController = appContext?.utilities?.currentViewController(),
       let window = viewController.viewIfLoaded?.window,
       !window.isHidden {
      return window
    }

    let scenes = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .filter {
        $0.activationState == .foregroundActive || $0.activationState == .foregroundInactive
      }
      .sorted {
        if $0.activationState == $1.activationState { return false }
        return $0.activationState == .foregroundActive
      }

    for scene in scenes {
      if let keyWindow = scene.windows.first(where: { $0.isKeyWindow && !$0.isHidden }) {
        return keyWindow
      }
      if let visibleWindow = scene.windows.first(where: { !$0.isHidden && $0.alpha > 0 }) {
        return visibleWindow
      }
    }
    return nil
  }

  private func ensureProbe(on root: UIView?, in window: UIWindow?) {
    guard observedRoot !== root || observedWindow !== window else { return }
    probe?.removeFromSuperview()
    probe = nil
    observedRoot = root
    observedWindow = window

    guard let root, let window, root.window === window else { return }
    let newProbe = AdaptiveLayoutProbe(frame: root.bounds)
    newProbe.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    newProbe.isUserInteractionEnabled = false
    newProbe.accessibilityElementsHidden = true
    newProbe.onLayoutChange = { [weak self] in self?.refresh() }
    root.addSubview(newProbe)
    probe = newProbe
  }

  private func refresh() {
    guard hasListeners else { return }
    let window = currentWindow()
    let root = window?.rootViewController?.view
    ensureProbe(on: root, in: window)

    let snapshot = makeSnapshot(window: window, root: root)
    logMetricsIfChanged(snapshot)
    configureSampling(hasRegions: !snapshot.regions.isEmpty)
    guard snapshot != lastPublishedSnapshot else { return }

    lastPublishedSnapshot = snapshot
    revision &+= 1
    var payload = snapshot.payload
    payload["revision"] = revision
    sendEvent("snapshotChanged", payload)
  }

  private func configureSampling(hasRegions: Bool) {
    guard hasListeners, hasRegions else {
      displayLink?.invalidate()
      displayLink = nil
      displayLinkTarget = nil
      return
    }
    guard displayLink == nil else { return }
    let target = AdaptiveLayoutDisplayLinkTarget { [weak self] in self?.refresh() }
    let link = CADisplayLink(
      target: target,
      selector: #selector(AdaptiveLayoutDisplayLinkTarget.sample(_:))
    )
    link.preferredFramesPerSecond = 15
    link.add(to: .main, forMode: .common)
    displayLinkTarget = target
    displayLink = link
  }

  private func makeSnapshot(
    window: UIWindow? = nil,
    root: UIView? = nil
  ) -> AdaptiveLayoutSnapshot {
    let window = window ?? currentWindow()
    guard let window else { return .empty }
    let typography = typographyMetrics(for: window)
    let root = root ?? window.rootViewController?.view
    let bounds = window.bounds
    guard let root, root.window === window else {
      return AdaptiveLayoutSnapshot(
        width: bounds.width,
        height: bounds.height,
        insets: .zero,
        regions: [],
        fontScale: typography.fontScale,
        contentSizeCategory: typography.contentSizeCategory
      )
    }

    let safeFrame = root.convert(root.safeAreaLayoutGuide.layoutFrame, to: window)
    let safeInsets = UIEdgeInsets(
      top: max(0, safeFrame.minY - bounds.minY),
      left: max(0, safeFrame.minX - bounds.minX),
      bottom: max(0, bounds.maxY - safeFrame.maxY),
      right: max(0, bounds.maxX - safeFrame.maxX)
    )

    return AdaptiveLayoutSnapshot(
      width: bounds.width,
      height: bounds.height,
      insets: safeInsets,
      regions: reservedRegions(in: root, window: window),
      fontScale: typography.fontScale,
      contentSizeCategory: typography.contentSizeCategory,
      barFrames: barFrames(in: root, window: window, fontScale: typography.fontScale)
    )
  }

  /// UIKit's edge-bar region can use the space below a side status area that
  /// the rectangular safe-area guide excludes. Never infer that space from a
  /// device name or a fixed status-bar height.
  private func barFrames(in root: UIView, window: UIWindow, fontScale: CGFloat) -> [String: CGRect] {
    #if compiler(>=6.4)
    guard #available(iOS 27.1, *) else { return [:] }
    // Keep this extent in sync with readingLayout.ts's accessible rail width.
    let extent = ceil(80 + max(0, fontScale - 1) * 64)
    var frames: [String: CGRect] = [:]
    for (edge, name) in [(UIRectEdge.left, "left"), (UIRectEdge.right, "right")] {
      let insets = root.edgeInsets(for: .bar(onEdge: edge, extent: extent))
      let rect = root.convert(root.bounds.inset(by: insets), to: window).standardized
      if rect.width > 0, rect.height > 0 { frames[name] = rect }
    }
    return frames
    #else
    return [:]
    #endif
  }

  private func typographyMetrics(for window: UIWindow) -> (fontScale: CGFloat, contentSizeCategory: String) {
    let traits = window.traitCollection
    let category = traits.preferredContentSizeCategory.rawValue
    // Resolve a body-text scale against the active window's traits, not the
    // process-wide preferred category used by older React Native code paths.
    let baseBodySize: CGFloat = 17
    let scaledBodySize = UIFontMetrics(forTextStyle: .body).scaledValue(
      for: baseBodySize,
      compatibleWith: traits
    )
    let scale = scaledBodySize / baseBodySize
    return (
      fontScale: scale.isFinite && scale > 0 ? scale : 1,
      contentSizeCategory: category
    )
  }

  private func logMetricsIfChanged(_ snapshot: AdaptiveLayoutSnapshot) {
#if DEBUG
    let metrics = AdaptiveLayoutDebugMetrics(
      width: snapshot.width,
      height: snapshot.height,
      topInset: snapshot.insets.top,
      rightInset: snapshot.insets.right,
      bottomInset: snapshot.insets.bottom,
      leftInset: snapshot.insets.left,
      fontScale: snapshot.fontScale,
      contentSizeCategory: snapshot.contentSizeCategory,
      barFrames: snapshot.barFrames
    )
    guard metrics != lastLoggedMetrics else { return }
    lastLoggedMetrics = metrics
    print(
      "[AdaptiveLayout] bounds=\(metrics.width)x\(metrics.height) " +
        "insets=(top:\(metrics.topInset),right:\(metrics.rightInset),bottom:\(metrics.bottomInset),left:\(metrics.leftInset)) " +
        "fontScale=\(metrics.fontScale) contentSizeCategory=\(metrics.contentSizeCategory) bars=\(metrics.barFrames)"
    )
#endif
  }

  private func reservedRegions(in root: UIView, window: UIWindow) -> [ReservedRegionSnapshot] {
    #if compiler(>=6.4)
    guard #available(iOS 27.1, *) else { return [] }

    var regions: [ReservedRegionSnapshot] = []
    for (kind, name) in [
      (UIView.ReservedRegion.Kind.division, "division"),
      (UIView.ReservedRegion.Kind.occlusion, "occlusion"),
    ] {
      for region in root.reservedRegions(kind: kind, options: .includeInactive) {
        let rect = root.convert(region.frame, to: window).standardized
        guard rect.width > 0, rect.height > 0 else { continue }
        regions.append(
          ReservedRegionSnapshot(
            x: rect.minX,
            y: rect.minY,
            width: rect.width,
            height: rect.height,
            kind: name,
            active: region.isActive
          )
        )
      }
    }
    return regions.sorted {
      if $0.kind != $1.kind { return $0.kind < $1.kind }
      if $0.x != $1.x { return $0.x < $1.x }
      if $0.y != $1.y { return $0.y < $1.y }
      if $0.width != $1.width { return $0.width < $1.width }
      return $0.height < $1.height
    }
    #else
    // The reserved-region UIKit API is absent from older SDKs. Keep the module
    // buildable there and let the JS hook use its ordinary safe-area fallback.
    return []
    #endif
  }
}
