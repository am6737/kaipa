import 'package:flutter/material.dart';

/// All 81 icon path data from the Kaipa icon set.
class KaipaIcons {
  KaipaIcons._();

  // Nav / actions
  static const String search = 'search';
  static const String layers = 'layers';
  static const String plus = 'plus';
  static const String close = 'close';
  static const String back = 'back';
  static const String forward = 'forward';
  static const String ellipsis = 'ellipsis';
  static const String filter = 'filter';
  static const String share = 'share';
  static const String heart = 'heart';
  static const String heartFill = 'heartFill';
  static const String bookmark = 'bookmark';
  static const String check = 'check';
  static const String star = 'star';

  // Outdoor
  static const String mountain = 'mountain';
  static const String trail = 'trail';
  static const String compass = 'compass';
  static const String flag = 'flag';
  static const String pin = 'pin';
  static const String flame = 'flame';
  static const String drop = 'drop';
  static const String camera = 'camera';
  static const String binoc = 'binoc';
  static const String tree = 'tree';
  static const String weather = 'weather';
  static const String sun = 'sun';
  static const String moon = 'moon';
  static const String clock = 'clock';
  static const String ruler = 'ruler';
  static const String altitude = 'altitude';

  // Gear
  static const String backpack = 'backpack';
  static const String boot = 'boot';
  static const String jacket = 'jacket';
  static const String tent = 'tent';
  static const String bottle = 'bottle';
  static const String battery = 'battery';
  static const String light = 'light';
  static const String knife = 'knife';
  static const String socks = 'socks';
  static const String shield = 'shield';
  static const String down = 'down';
  static const String tee = 'tee';
  static const String fleece = 'fleece';

  // UI bits
  static const String layers2 = 'layers2';
  static const String toggle3d = 'toggle3d';
  static const String toggle2d = 'toggle2d';
  static const String user = 'user';
  static const String users = 'users';
  static const String chat = 'chat';
  static const String bell = 'bell';
  static const String play = 'play';
  static const String pause = 'pause';
  static const String stop = 'stop';
  static const String download = 'download';
  static const String upload = 'upload';
  static const String cloud = 'cloud';
  static const String sparkle = 'sparkle';
  static const String phone = 'phone';
  static const String arrowUp = 'arrowUp';
  static const String chevronLeft = 'chevronLeft';
  static const String chevronRight = 'chevronRight';
  static const String more = 'more';
  static const String image = 'image';
  static const String grid = 'grid';
  static const String list = 'list';
  static const String route = 'route';
  static const String lock = 'lock';
  static const String alert = 'alert';
  static const String globe = 'globe';
  static const String navigate = 'navigate';
  static const String hiker = 'hiker';
  static const String mic = 'mic';
  static const String inbox = 'inbox';
  static const String rope = 'rope';
  static const String gloves = 'gloves';
  static const String hat = 'hat';
  static const String glasses = 'glasses';
  static const String map = 'map';
  static const String firstAid = 'firstAid';
  static const String food = 'food';
  static const String sleeping = 'sleeping';
  static const String pants = 'pants';
  static const String watch = 'watch';
  static const String radio = 'radio';
  static const String fullscreen = 'fullscreen';

  /// All icon path data keyed by name.
  static const Map<String, String> pathData = {
    'search': 'M11 4a7 7 0 1 0 4.2 12.6l3.6 3.6 1.4-1.4-3.6-3.6A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z',
    'layers': 'M12 2 2 7l10 5 10-5-10-5Zm-7 9-3 1.5L12 18l10-5.5-3-1.5-7 4-7-4Z',
    'plus': 'M12 5v14M5 12h14',
    'close': 'M6 6l12 12M18 6 6 18',
    'back': 'M15 18l-6-6 6-6',
    'forward': 'M9 6l6 6-6 6',
    'ellipsis': 'M5 12h.01M12 12h.01M19 12h.01',
    'filter': 'M4 6h16M7 12h10M10 18h4',
    'share': 'M16 6l-4-4-4 4M12 2v13M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7',
    'heart': 'M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9Z',
    'heartFill': 'M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9Z',
    'bookmark': 'M6 4h12v17l-6-4-6 4V4Z',
    'check': 'M5 12l4.5 4.5L19 7',
    'star': 'M12 3l2.7 5.7 6.3.9-4.6 4.4 1.1 6.3L12 17.3 6.5 20.3l1.1-6.3L3 9.6l6.3-.9L12 3Z',
    'mountain': 'M2 20l5.5-9 4 6 3-4 7.5 7H2Z M16 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
    'trail': 'M4 20c2-3 1-5 4-5s3 2 5-1 0-6 3-7 4 1 4 1',
    'compass': 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0 0V2 M16 8l-2 6-6 2 2-6 6-2Z',
    'flag': 'M4 21V4M4 4h13l-2 4 2 4H4',
    'pin': 'M12 22s7-7.5 7-13a7 7 0 1 0-14 0c0 5.5 7 13 7 13Zm0-10a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z',
    'flame': 'M12 22a6 6 0 0 0 6-6c0-3-2-5-3-7-1-2 0-4-3-7 0 4-3 5-4 7s-2 4-2 7a6 6 0 0 0 6 6Z',
    'drop': 'M12 22a7 7 0 0 0 7-7c0-5-7-12-7-12S5 10 5 15a7 7 0 0 0 7 7Z',
    'camera': 'M3 7h4l2-3h6l2 3h4v12H3V7Z M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
    'binoc': 'M3 17a3 3 0 0 0 6 0v-7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v7Zm12 0a3 3 0 0 0 6 0v-7a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v7ZM9 8h6',
    'tree': 'M12 2c-3 4-5 5-5 8a5 5 0 0 0 4 4.9V22h2v-7.1A5 5 0 0 0 17 10c0-3-2-4-5-8Z',
    'weather': 'M7 17a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1A4.5 4.5 0 0 1 17 17H7Z',
    'sun': 'M12 5V2M12 22v-3M5 12H2M22 12h-3M6 6l-2-2M20 20l-2-2M6 18l-2 2M20 4l-2 2 M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z',
    'moon': 'M21 13A9 9 0 0 1 11 3a8 8 0 1 0 10 10Z',
    'clock': 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-15v5l3 2',
    'ruler': 'M3 17 17 3l4 4L7 21l-4-4Z M7 13l2 2M11 9l2 2M15 5l2 2',
    'altitude': 'M3 21h18M5 21V13l4-3 4 5 4-3 4 6v3',
    'backpack': 'M7 8V5a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v3M5 8h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Zm4 5h6',
    'boot': 'M4 14c0-3 1-7 1-9h5l1 4c2 0 3 1 4 3l5 2v6H4v-6Z',
    'jacket': 'M8 4h8l4 3-2 4-2-1v12H6V10L4 11l-2-4 4-3h2Zm4 0v6',
    'tent': 'M3 20 12 4l9 16H3Z M12 4v16',
    'bottle': 'M9 2h6v3l1 2v13a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V7l1-2V2Z',
    'battery': 'M3 8h15a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H3V8Zm-1 8V8M22 11v2',
    'light': 'M9 2h6l-1 6h2l-7 14 2-9H8l1-11Z',
    'knife': 'M3 17 17 3l4 4-2 2-12 12H3v-4Z',
    'socks': 'M9 2v9l-4 5a4 4 0 1 0 6 5l8-8V2H9Z',
    'shield': 'M12 2l8 4v6c0 5.5-3.8 9.7-8 11-4.2-1.3-8-5.5-8-11V6l8-4Z',
    'down': 'M8 4h8l4 3-2 4-2-1v12H6V10L4 11l-2-4 4-3h2Zm-1 5h10m-10 4h10',
    'tee': 'M8 4h8l4 4h-4v14H8V8H4l4-4Z',
    'fleece': 'M8 4h8l3 3-1 2-2-1v14H8V8L6 9 5 7l3-3Zm4 0v16',
    'layers2': 'M12 2 2 7l10 5 10-5-10-5Z',
    'toggle3d': 'M3 12 12 7l9 5-9 5-9-5Z M3 17 12 22l9-5',
    'toggle2d': 'M3 5h18v14H3z M3 12h18M12 5v14',
    'user': 'M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M4 21c1-4 4-6 8-6s7 2 8 6',
    'users': 'M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M2 21c1-4 3-6 7-6s6 2 7 6 M16 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M22 21c-.5-3-2-5-5-5',
    'chat': 'M21 12a8 8 0 0 1-12 7l-5 1 1-5a8 8 0 1 1 16-3Z',
    'bell': 'M6 16V11a6 6 0 1 1 12 0v5l2 3H4l2-3Zm4 3a2 2 0 0 0 4 0',
    'play': 'M8 5v14l11-7-11-7Z',
    'pause': 'M7 5h3v14H7zM14 5h3v14h-3z',
    'stop': 'M7 7h10v10H7z',
    'download': 'M12 4v12m0 0-4-4m4 4 4-4M4 19h16',
    'upload': 'M12 20V8m0 0-4 4m4-4 4 4M4 5h16',
    'cloud': 'M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1A4.5 4.5 0 0 1 17 18H7Z',
    'sparkle': 'M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4L12 3Z M19 14l1 2.4 2.4 1-2.4 1L19 21l-1-2.6-2.4-1 2.4-1L19 14Z',
    'phone': 'M5 3h4l2 5-3 2a11 11 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A18 18 0 0 1 3 5a2 2 0 0 1 2-2Z',
    'arrowUp': 'M12 19V5M5 12l7-7 7 7',
    'chevronLeft': 'M15 18l-6-6 6-6',
    'chevronRight': 'M9 6l6 6-6 6',
    'more': 'M5 12h.01M12 12h.01M19 12h.01',
    'image': 'M3 5h18v14H3z M3 16l5-5 4 4 3-3 6 6',
    'grid': 'M3 3h8v8H3z M13 3h8v8h-8z M3 13h8v8H3z M13 13h8v8h-8z',
    'list': 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
    'route': 'M6 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm12 12a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM6 8c0 6 12 4 12 8',
    'lock': 'M6 11V8a6 6 0 1 1 12 0v3M5 11h14v10H5z',
    'alert': 'M12 3 1 21h22L12 3Zm0 6v6m0 3v.01',
    'globe': 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM2 12h20M12 2a14 14 0 0 1 0 20M12 2a14 14 0 0 0 0 20',
    'navigate': 'M3 11 21 3l-8 18-2-8-8-2Z',
    'hiker': 'M14 4a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm-1 2-3 4 3 3v7h2v-6l-2-2 2-3 2 4h3v-2h-2l-2-4-3-1Zm-7 7-2 4 1 1 3-3 1 4 2-1-2-5h-3Zm12 2 2 5-2 1-1-4-2 2-1-1 2-3h2Z',
    'mic': 'M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm6-3a6 6 0 0 1-12 0M12 17v4M8 21h8',
    'inbox': 'M3 9l4-5h10l4 5v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Zm0 0h5l2 3h4l2-3h5',
    'rope': 'M6 4a2 2 0 0 1 4 0c0 2-4 3-4 6a2 2 0 0 0 4 0c0-2-4-3-4-6Zm8 8a2 2 0 0 1 4 0c0 2-4 3-4 6a2 2 0 0 0 4 0c0-2-4-3-4-6Z',
    'gloves': 'M6 10V4a2 2 0 0 1 4 0v4M10 8V3a2 2 0 0 1 4 0v5M14 8V4a2 2 0 0 1 4 0v6l-2 7a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-7Z',
    'hat': 'M4 16h16M6 16c0-4 2-8 6-10s6 6 6 10M8 16v3h8v-3',
    'glasses': 'M3 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0Zm12 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0ZM9 12h6M3 12H2m20 0h-1',
    'map': 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15',
    'firstAid': 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm6 4v6m-3-3h6',
    'food': 'M4 4v7a3 3 0 0 0 3 3h1v6M4 4h1m-1 3h4m0-3v7a3 3 0 0 1-3 3M20 4v16M17 4v6a3 3 0 0 0 3 3',
    'sleeping': 'M3 18h18M4 18V14a8 8 0 0 1 16 0v4M8 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
    'pants': 'M6 2h12v7l-2 13h-3l-1-10-1 10H8L6 9V2Z',
    'watch': 'M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM12 6V2h4M12 18v4h4M12 9v3l2 1',
    'radio': 'M5 6h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm7 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM9 4l3-2 3 2',
    'fullscreen': 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7',
  };

  /// Set of icon names that should be rendered filled rather than stroked.
  static const Set<String> filledIcons = {
    'heartFill', 'play', 'pause', 'stop', 'navigate', 'star',
  };
}

// ─── SVG path painter ────────────────────────────────────────────────
class _KaipaIconPainter extends CustomPainter {
  final String pathData;
  final Color color;
  final double strokeWidth;
  final bool filled;

  _KaipaIconPainter({
    required this.pathData,
    required this.color,
    required this.strokeWidth,
    required this.filled,
  });

  @override
  void paint(Canvas canvas, Size size) {
    // Parse multi-path data (paths separated by space-M or by explicit M after Z)
    final paths = _parsePaths(pathData);
    final scaleX = size.width / 24.0;
    final scaleY = size.height / 24.0;

    canvas.save();
    canvas.scale(scaleX, scaleY);

    for (final path in paths) {
      if (filled) {
        final fillPaint = Paint()
          ..color = color
          ..style = PaintingStyle.fill;
        canvas.drawPath(path, fillPaint);
      } else {
        final strokePaint = Paint()
          ..color = color
          ..style = PaintingStyle.stroke
          ..strokeWidth = strokeWidth / scaleX
          ..strokeCap = StrokeCap.round
          ..strokeJoin = StrokeJoin.round;
        canvas.drawPath(path, strokePaint);
      }
    }

    canvas.restore();
  }

  List<Path> _parsePaths(String d) {
    // Split into individual path strings at top-level M commands
    // but keep M as part of each segment.
    // Tokenize: split by spaces but be careful with multi-path strings.
    // The original SVG data uses space-separated sub-paths starting with M or Z.
    // We'll parse the whole thing as one path since Path supports multiple sub-paths.
    final path = _parseSvgPath(d);
    return [path];
  }

  Path _parseSvgPath(String d) {
    final path = Path();
    final tokens = _tokenize(d);
    int i = 0;
    double cx = 0, cy = 0; // current point
    double sx = 0, sy = 0; // sub-path start
    String lastCmd = '';

    while (i < tokens.length) {
      String cmd;
      if (_isCommand(tokens[i])) {
        cmd = tokens[i];
        i++;
      } else {
        // Implicit repeat of last command
        cmd = lastCmd;
        // After M, implicit repeats are L; after m, implicit repeats are l
        if (cmd == 'M') cmd = 'L';
        if (cmd == 'm') cmd = 'l';
      }

      switch (cmd) {
        case 'M':
          final x = _num(tokens, i++);
          final y = _num(tokens, i++);
          path.moveTo(x, y);
          cx = x;
          cy = y;
          sx = x;
          sy = y;
          break;
        case 'm':
          final x = _num(tokens, i++) + cx;
          final y = _num(tokens, i++) + cy;
          path.moveTo(x, y);
          cx = x;
          cy = y;
          sx = x;
          sy = y;
          break;
        case 'L':
          final x = _num(tokens, i++);
          final y = _num(tokens, i++);
          path.lineTo(x, y);
          cx = x;
          cy = y;
          break;
        case 'l':
          final x = _num(tokens, i++) + cx;
          final y = _num(tokens, i++) + cy;
          path.lineTo(x, y);
          cx = x;
          cy = y;
          break;
        case 'H':
          final x = _num(tokens, i++);
          path.lineTo(x, cy);
          cx = x;
          break;
        case 'h':
          final x = _num(tokens, i++) + cx;
          path.lineTo(x, cy);
          cx = x;
          break;
        case 'V':
          final y = _num(tokens, i++);
          path.lineTo(cx, y);
          cy = y;
          break;
        case 'v':
          final y = _num(tokens, i++) + cy;
          path.lineTo(cx, y);
          cy = y;
          break;
        case 'C':
          final x1 = _num(tokens, i++);
          final y1 = _num(tokens, i++);
          final x2 = _num(tokens, i++);
          final y2 = _num(tokens, i++);
          final x = _num(tokens, i++);
          final y = _num(tokens, i++);
          path.cubicTo(x1, y1, x2, y2, x, y);
          cx = x;
          cy = y;
          break;
        case 'c':
          final x1 = _num(tokens, i++) + cx;
          final y1 = _num(tokens, i++) + cy;
          final x2 = _num(tokens, i++) + cx;
          final y2 = _num(tokens, i++) + cy;
          final x = _num(tokens, i++) + cx;
          final y = _num(tokens, i++) + cy;
          path.cubicTo(x1, y1, x2, y2, x, y);
          cx = x;
          cy = y;
          break;
        case 'S':
          final x2 = _num(tokens, i++);
          final y2 = _num(tokens, i++);
          final x = _num(tokens, i++);
          final y = _num(tokens, i++);
          // Reflect previous control point
          path.cubicTo(cx, cy, x2, y2, x, y);
          cx = x;
          cy = y;
          break;
        case 's':
          final x2 = _num(tokens, i++) + cx;
          final y2 = _num(tokens, i++) + cy;
          final x = _num(tokens, i++) + cx;
          final y = _num(tokens, i++) + cy;
          path.cubicTo(cx, cy, x2, y2, x, y);
          cx = x;
          cy = y;
          break;
        case 'Q':
          final x1 = _num(tokens, i++);
          final y1 = _num(tokens, i++);
          final x = _num(tokens, i++);
          final y = _num(tokens, i++);
          path.quadraticBezierTo(x1, y1, x, y);
          cx = x;
          cy = y;
          break;
        case 'q':
          final x1 = _num(tokens, i++) + cx;
          final y1 = _num(tokens, i++) + cy;
          final x = _num(tokens, i++) + cx;
          final y = _num(tokens, i++) + cy;
          path.quadraticBezierTo(x1, y1, x, y);
          cx = x;
          cy = y;
          break;
        case 'T':
          final x = _num(tokens, i++);
          final y = _num(tokens, i++);
          path.quadraticBezierTo(cx, cy, x, y);
          cx = x;
          cy = y;
          break;
        case 't':
          final x = _num(tokens, i++) + cx;
          final y = _num(tokens, i++) + cy;
          path.quadraticBezierTo(cx, cy, x, y);
          cx = x;
          cy = y;
          break;
        case 'A':
          final rx = _num(tokens, i++);
          final ry = _num(tokens, i++);
          final rotation = _num(tokens, i++);
          final largeArc = _num(tokens, i++) != 0;
          final sweep = _num(tokens, i++) != 0;
          final x = _num(tokens, i++);
          final y = _num(tokens, i++);
          path.arcToPoint(
            Offset(x, y),
            radius: Radius.elliptical(rx, ry),
            rotation: rotation,
            largeArc: largeArc,
            clockwise: sweep,
          );
          cx = x;
          cy = y;
          break;
        case 'a':
          final rx = _num(tokens, i++);
          final ry = _num(tokens, i++);
          final rotation = _num(tokens, i++);
          final largeArc = _num(tokens, i++) != 0;
          final sweep = _num(tokens, i++) != 0;
          final x = _num(tokens, i++) + cx;
          final y = _num(tokens, i++) + cy;
          path.arcToPoint(
            Offset(x, y),
            radius: Radius.elliptical(rx, ry),
            rotation: rotation,
            largeArc: largeArc,
            clockwise: sweep,
          );
          cx = x;
          cy = y;
          break;
        case 'Z':
        case 'z':
          path.close();
          cx = sx;
          cy = sy;
          break;
        default:
          // Unknown command, skip
          break;
      }
      lastCmd = cmd;
    }
    return path;
  }

  List<String> _tokenize(String d) {
    final result = <String>[];
    final re = RegExp(r'([MmLlHhVvCcSsQqTtAaZz])|(-?\d*\.?\d+)');
    for (final match in re.allMatches(d)) {
      result.add(match.group(0)!);
    }
    return result;
  }

  bool _isCommand(String s) {
    return s.length == 1 && 'MmLlHhVvCcSsQqTtAaZz'.contains(s);
  }

  double _num(List<String> tokens, int index) {
    if (index >= tokens.length) return 0;
    return double.tryParse(tokens[index]) ?? 0;
  }

  @override
  bool shouldRepaint(_KaipaIconPainter oldDelegate) {
    return oldDelegate.pathData != pathData ||
        oldDelegate.color != color ||
        oldDelegate.strokeWidth != strokeWidth ||
        oldDelegate.filled != filled;
  }
}

// ─── KaipaIcon widget ────────────────────────────────────────────────
class KaipaIcon extends StatelessWidget {
  final String name;
  final double size;
  final Color? color;
  final double strokeWidth;

  const KaipaIcon({
    super.key,
    required this.name,
    this.size = 20,
    this.color,
    this.strokeWidth = 1.6,
  });

  @override
  Widget build(BuildContext context) {
    final pathData = KaipaIcons.pathData[name];
    if (pathData == null) {
      return SizedBox(width: size, height: size);
    }

    final effectiveColor = color ?? IconTheme.of(context).color ?? const Color(0xFF000000);
    final filled = KaipaIcons.filledIcons.contains(name);

    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(
        size: Size(size, size),
        painter: _KaipaIconPainter(
          pathData: pathData,
          color: effectiveColor,
          strokeWidth: strokeWidth,
          filled: filled,
        ),
      ),
    );
  }
}
