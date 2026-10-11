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
  var startFraction: Double = 0 {
    didSet { setNeedsLayout() }
  }
  var endFraction: Double = 0.6 {
    didSet { setNeedsLayout() }
  }
  var endAlpha: Double = 1 {
    didSet { updateMaskColors() }
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    maskLayer.startPoint = CGPoint(x: 0.5, y: 0)
    maskLayer.endPoint = CGPoint(x: 0.5, y: 1)
    effectView.effect = UIBlurEffect(style: .systemMaterialLight)
    effectView.layer.mask = maskLayer
    addSubview(effectView)
    updateMaskColors()
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    effectView.frame = bounds
    maskLayer.frame = bounds
    let s = CGFloat(min(max(startFraction, 0), 1))
    let e = CGFloat(min(max(endFraction, s), 1))
    maskLayer.locations = [NSNumber(value: s), NSNumber(value: e), NSNumber(value: 1)]
  }

  private func updateEffect() {
    effectView.effect = UIBlurEffect(style: blurTint == "dark" ? .systemMaterialDark : .systemMaterialLight)
  }

  private func updateMaskColors() {
    let a = CGFloat(min(max(endAlpha, 0), 1))
    let full = UIColor(white: 1, alpha: a).cgColor
    maskLayer.colors = [UIColor.clear.cgColor, full, full]
  }
}

public class GradientBlurModule: Module {
  public func definition() -> ModuleDefinition {
    Name("GradientBlur")

    View(GradientBlurView.self) {
      Prop("tint") { (view: GradientBlurView, value: String) in
        view.blurTint = value
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
