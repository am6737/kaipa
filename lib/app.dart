import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/router/app_router.dart';
import 'core/theme/theme_provider.dart';
import 'core/theme/kaipa_theme.dart';

class KaipaApp extends ConsumerWidget {
  const KaipaApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = ref.watch(kaipaTokensProvider);
    final router = ref.watch(routerProvider);

    return MaterialApp.router(
      title: 'Kaipa',
      theme: KaipaTheme.build(tokens),
      routerConfig: router,
      debugShowCheckedModeBanner: false,
      locale: const Locale('zh', 'CN'),
    );
  }
}
