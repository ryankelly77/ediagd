import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = EDIAGDViewController()
        window?.makeKeyAndVisible()

        /*
         * THE LAUNCH MARK, BEFORE THE WEBVIEW HAS ANYTHING.
         *
         * Presented on the window rather than inside the view controller, so it
         * sits above the whole hierarchy including the Capacitor splash view.
         * This runs when a scene CONNECTS, which is a cold start — a resume
         * from the background never reaches here, so there is no overlay on
         * resume and nothing to suppress.
         *
         * It dismisses on a signal from the web app, or at its own cap if that
         * signal never comes. See LaunchOverlay.
         */
        if let window {
            LaunchOverlay.shared.present(in: window)
        }

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
