import ExpoModulesCore
import UIKit

/// Blur whose strength ramps in from the top edge down, the way the system bars fade their
/// backdrop toward the screen edge. A `mask` is the supported way to vary a UIVisualEffectView's
/// presence; alpha on the effect view or its ancestors is not.
/// Liquid Glass (`UIGlassEffect`) cannot be masked, so this deliberately stays on UIBlurEffect.
final class GradientBlurView: UIView {
  private let effectView = UIVisualEffectView()
  private let maskLayer = CAGradientLayer()

  var blurTint: String = "light" {
    didSet { updateEffect() }
  }
  var material: String = "regular" {
    didSet { updateEffect() }
  }
  var startFraction: Double = 0 {
    didSet { setNeedsLayout() }
  }
  var endFraction: Double = 0.6 {
    didSet { setNeedsLayout() }
  }
  var endAlpha: Double = 1 {
    didSet { setNeedsLayout() }
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    maskLayer.startPoint = CGPoint(x: 0.5, y: 0)
    maskLayer.endPoint = CGPoint(x: 0.5, y: 1)
    effectView.effect = UIBlurEffect(style: .systemMaterialLight)
    effectView.layer.mask = maskLayer
    addSubview(effectView)
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    effectView.frame = bounds
    maskLayer.frame = bounds
    updateMaskStops()
  }

  /// Smoothstep across the fade band: a linear alpha ramp reads as a hard on/off switch,
  /// while easing in and out of the plateau is what the system bars' falloff looks like.
  private func updateMaskStops() {
    let s = CGFloat(min(max(startFraction, 0), 1))
    let e = CGFloat(min(max(endFraction, s), 1))
    let steps = 10
    var locations: [NSNumber] = [NSNumber(value: 0.0)]
    var colors: [CGColor] = [UIColor.clear.cgColor]
    for i in 1...steps {
      let t = Double(i) / Double(steps)
      let eased = t * t * (3.0 - 2.0 * t)
      let x = Double(s) + (Double(e) - Double(s)) * t
      let alpha = min(max(endAlpha * eased, 0), 1)
      locations.append(NSNumber(value: x))
      colors.append(UIColor(white: 1, alpha: CGFloat(alpha)).cgColor)
    }
    locations.append(NSNumber(value: 1.0))
    colors.append(UIColor(white: 1, alpha: CGFloat(min(max(endAlpha, 0), 1))).cgColor)
    maskLayer.locations = locations
    maskLayer.colors = colors
  }

  private func updateEffect() {
    let dark = blurTint == "dark"
    let style: UIBlurEffect.Style
    switch material {
    case "ultra":
      style = dark ? .systemUltraThinMaterialDark : .systemUltraThinMaterialLight
    case "thin":
      style = dark ? .systemThinMaterialDark : .systemThinMaterialLight
    default:
      style = dark ? .systemMaterialDark : .systemMaterialLight
    }
    effectView.effect = UIBlurEffect(style: style)
  }
}

public class GradientBlurModule: Module {
  public func definition() -> ModuleDefinition {
    Name("GradientBlur")

    View(GradientBlurView.self) {
      Prop("tint") { (view: GradientBlurView, value: String) in
        view.blurTint = value
      }
      Prop("material") { (view: GradientBlurView, value: String) in
        view.material = value
      }
      Prop("startFraction") { (view: GradientBlurView, value: Double) in
        view.startFraction = value
      }
      Prop("endFraction") { (view: GradientBlurView, value: Double) in
        view.endFraction = value
      }
      Prop("endAlpha") { (view: GradientBlurView, value: Double) in
        view.endAlpha = value
      }
    }
  }
}
