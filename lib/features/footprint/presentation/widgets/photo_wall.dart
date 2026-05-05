import 'package:flutter/material.dart';
import '../../../../core/theme/kaipa_tokens.dart';
import '../../../../core/widgets/kaipa_icons.dart';

class PhotoWall extends StatefulWidget {
  final List<String> photos;
  final KaipaColors colors;
  final VoidCallback? onAdd;
  final void Function(String url)? onDelete;
  final void Function(String url, int index)? onTap;

  const PhotoWall({
    super.key,
    required this.photos,
    required this.colors,
    this.onAdd,
    this.onDelete,
    this.onTap,
  });

  @override
  State<PhotoWall> createState() => _PhotoWallState();
}

class _PhotoWallState extends State<PhotoWall>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _fadeAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 500),
      vsync: this,
    );
    _fadeAnimation = CurvedAnimation(
      parent: _controller,
      curve: Curves.easeOut,
    );
    _controller.forward();
  }

  @override
  void didUpdateWidget(covariant PhotoWall oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.photos.length > oldWidget.photos.length) {
      _controller.forward(from: 0.6);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final screenWidth = MediaQuery.of(context).size.width;
    final spacing = 8.0;
    final tileSize = (screenWidth - 40 - spacing * 2) / 3;

    return FadeTransition(
      opacity: _fadeAnimation,
      child: Wrap(
        spacing: spacing,
        runSpacing: spacing,
        children: [
          for (var i = 0; i < widget.photos.length; i++)
            _PhotoTile(
              url: widget.photos[i],
              size: tileSize,
              colors: widget.colors,
              delayMs: i * 40,
              onTap: widget.onTap != null
                  ? () => widget.onTap!(widget.photos[i], i)
                  : null,
              onDelete: widget.onDelete != null
                  ? () => widget.onDelete!(widget.photos[i])
                  : null,
            ),
          if (widget.onAdd != null) _AddTile(size: tileSize, colors: widget.colors, onTap: widget.onAdd),
        ],
      ),
    );
  }
}

class _PhotoTile extends StatefulWidget {
  final String url;
  final double size;
  final KaipaColors colors;
  final int delayMs;
  final VoidCallback? onTap;
  final VoidCallback? onDelete;

  const _PhotoTile({
    required this.url,
    required this.size,
    required this.colors,
    required this.delayMs,
    this.onTap,
    this.onDelete,
  });

  @override
  State<_PhotoTile> createState() => _PhotoTileState();
}

class _PhotoTileState extends State<_PhotoTile>
    with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _opacity;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      duration: const Duration(milliseconds: 280),
      vsync: this,
    );
    _opacity = CurvedAnimation(parent: _ctrl, curve: Curves.easeOut);
    Future.delayed(Duration(milliseconds: widget.delayMs), () {
      if (mounted) _ctrl.forward();
    });
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _opacity,
      child: GestureDetector(
        onTap: widget.onTap,
        child: SizedBox(
          width: widget.size,
          height: widget.size,
          child: Stack(
            fit: StackFit.expand,
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Image.network(
                  widget.url,
                  fit: BoxFit.cover,
                  errorBuilder: (_, _, _) => Container(
                    color: widget.colors.surfaceHi,
                    child: Center(
                      child: KaipaIcon(
                        name: KaipaIcons.image,
                        size: 24,
                        color: widget.colors.inkDim,
                      ),
                    ),
                  ),
                ),
              ),
              if (widget.onDelete != null)
                Positioned(
                  top: 4,
                  right: 4,
                  child: GestureDetector(
                    onTap: widget.onDelete,
                    child: Container(
                      width: 28,
                      height: 28,
                      decoration: BoxDecoration(
                        color: Colors.black.withAlpha(120),
                        shape: BoxShape.circle,
                      ),
                      child: const Center(
                        child: Icon(Icons.close_rounded,
                            size: 14, color: Colors.white),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AddTile extends StatelessWidget {
  final double size;
  final KaipaColors colors;
  final VoidCallback? onTap;

  const _AddTile({required this.size, required this.colors, this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: colors.line,
            width: 1,
            strokeAlign: BorderSide.strokeAlignInside,
          ),
        ),
        child: Center(
          child: KaipaIcon(name: KaipaIcons.plus, size: 26, color: colors.inkDim),
        ),
      ),
    );
  }
}
