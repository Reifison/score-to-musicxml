// Expo SDK 54 compatibility with the scene lifecycle required by the iOS 27 SDK.
// Included in AppDelegate.swift by withIOSSceneLifecycle; keep this source canonical.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  private var appDelegate: AppDelegate? {
    UIApplication.shared.delegate as? AppDelegate
  }

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
      let appDelegate,
      let factory = appDelegate.reactNativeFactory else { return }

    let window = UIWindow(windowScene: windowScene)
    self.window = window

    // A discarded scene can reconnect while the React Native runtime is still alive.
    // Reattach its controller instead of starting the runtime a second time.
    let existingController = appDelegate.window?.rootViewController
    appDelegate.window?.rootViewController = nil
    appDelegate.window = window
    if let existingController {
      window.rootViewController = existingController
      window.makeKeyAndVisible()
      self.scene(scene, openURLContexts: connectionOptions.urlContexts)
      for activity in connectionOptions.userActivities {
        self.scene(scene, continue: activity)
      }
      return
    }

    // React Native's getInitialURL reads launch options, not scene connection options.
    var launchOptions = appDelegate.appLaunchOptions ?? [:]
    if let context = connectionOptions.urlContexts.first {
      launchOptions[.url] = context.url
      if let sourceApplication = context.options.sourceApplication {
        launchOptions[.sourceApplication] = sourceApplication
      }
      if let annotation = context.options.annotation {
        launchOptions[.annotation] = annotation
      }
    }
    if let activity = connectionOptions.userActivities.first {
      launchOptions[.userActivityDictionary] = [
        "UIApplicationLaunchOptionsUserActivityKey": activity,
        "UIApplicationLaunchOptionsUserActivityTypeKey": activity.activityType
      ]
    }
    // Expo Router also reads ExpoLinking's registry for cold launches. Populate
    // it through Expo's subscribers before JS starts observing linking events.
    self.scene(scene, openURLContexts: connectionOptions.urlContexts)
    for activity in connectionOptions.userActivities {
      self.scene(scene, continue: activity)
    }
    factory.startReactNative(withModuleName: "main", in: window, launchOptions: launchOptions)
    appDelegate.appLaunchOptions = nil
  }

  func sceneDidBecomeActive(_ scene: UIScene) {
    appDelegate?.applicationDidBecomeActive(UIApplication.shared)
  }

  func sceneWillResignActive(_ scene: UIScene) {
    appDelegate?.applicationWillResignActive(UIApplication.shared)
  }

  func sceneWillEnterForeground(_ scene: UIScene) {
    appDelegate?.applicationWillEnterForeground(UIApplication.shared)
  }

  func sceneDidEnterBackground(_ scene: UIScene) {
    appDelegate?.applicationDidEnterBackground(UIApplication.shared)
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for context in URLContexts {
      var options: [UIApplication.OpenURLOptionsKey: Any] = [
        .openInPlace: context.options.openInPlace
      ]
      if let sourceApplication = context.options.sourceApplication {
        options[.sourceApplication] = sourceApplication
      }
      if let annotation = context.options.annotation {
        options[.annotation] = annotation
      }
      _ = appDelegate?.application(UIApplication.shared, open: context.url, options: options)
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    _ = appDelegate?.application(
      UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }
}
