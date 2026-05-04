import 'package:flutter/material.dart';
import '../../../../core/theme/kaipa_tokens.dart';

class PhotoWall extends StatelessWidget {
  final List<String> photos;
  final KaipaColors colors;
  final VoidCallback? onAdd;

  const PhotoWall({super.key, required this.photos, required this.colors, this.onAdd});

  @override
  Widget build(BuildContext context) {
    final size = (MediaQuery.of(context).size.width - 52) / 3;
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [
        ...photos.map((url) => _photoTile(url, size)),
        if (onAdd != null) _addTile(size),
      ],
    );
  }

  Widget _photoTile(String url, double size) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(10),
      child: SizedBox(
        width: size,
        height: size,
        child: Image.network(url, fit: BoxFit.cover,
          errorBuilder: (_, _, _) => Container(color: colors.surfaceHi)),
      ),
    );
  }

  Widget _addTile(double size) {
    return GestureDetector(
      onTap: onAdd,
      child: Container(
        width: size, height: size,
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: colors.line, width: 0.5),
        ),
        child: Center(child: Icon(Icons.add_rounded, size: 28, color: colors.inkDim)),
      ),
    );
  }
}
