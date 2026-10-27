import ExpoModulesCore
import MapKit

public class MapScaleModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MapScale")

    View(MapScaleView.self) {
      Prop("colorScheme") { (view: MapScaleView, scheme: String?) in
        view.overrideUserInterfaceStyle = scheme == "dark" ? .dark : scheme == "light" ? .light : .unspecified
      }
    }
  }
}

/// Apple's own scale, the one Apple Maps draws: shown while the zoom changes,
/// faded out once the map settles. It is right-aligned in this view's bounds and
/// bound to the nearest MKMapView around it, since react-native-maps keeps its
/// map view to itself and only offers the scale in a fixed corner.
class MapScaleView: ExpoView {
  private var scaleView: MKScaleView?
  private weak var mapView: MKMapView?
  private var retries = 0

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    isUserInteractionEnabled = false
    clipsToBounds = false
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil {
      detach()
    } else {
      retries = 0
      attach()
    }
  }

  private func detach() {
    scaleView?.removeFromSuperview()
    scaleView = nil
    mapView = nil
  }

  private func attach() {
    guard window != nil else { return }
    if let mapView, scaleView?.mapView === mapView { return }
    guard let found = nearestMapView() else {
      // The map can mount a moment after its overlays.
      if retries < 20 {
        retries += 1
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self] in self?.attach() }
      }
      return
    }
    detach()
    let scale = MKScaleView(mapView: found)
    scale.scaleVisibility = .adaptive
    scale.legendAlignment = .trailing
    scale.translatesAutoresizingMaskIntoConstraints = false
    addSubview(scale)
    NSLayoutConstraint.activate([
      scale.topAnchor.constraint(equalTo: topAnchor),
      scale.trailingAnchor.constraint(equalTo: trailingAnchor),
    ])
    scaleView = scale
    mapView = found
  }

  /// The first map found walking out from this view: a screen's own map is
  /// closer than one on a screen underneath it.
  private func nearestMapView() -> MKMapView? {
    var ancestor = superview
    while let current = ancestor {
      if let map = firstMapView(in: current) { return map }
      ancestor = current.superview
    }
    return nil
  }

  private func firstMapView(in root: UIView) -> MKMapView? {
    var queue: [UIView] = [root]
    var index = 0
    while index < queue.count {
      let view = queue[index]
      index += 1
      if let map = view as? MKMapView, map.window != nil, !map.isHidden { return map }
      if view === self { continue }
      queue.append(contentsOf: view.subviews)
    }
    return nil
  }
}
