import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'app.dart';
import 'core/theme/theme_provider.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Supabase.initialize(
    url: const String.fromEnvironment(
      'SUPABASE_URL',
      defaultValue: 'https://tralvhjuebibvxcbicsa.supabase.co',
    ),
    anonKey: const String.fromEnvironment(
      'SUPABASE_ANON_KEY',
      defaultValue: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyYWx2aGp1ZWJpYnZ4Y2JpY3NhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0Njg4ODEsImV4cCI6MjA5MzA0NDg4MX0.mD7KAcTO0LoNoRQ5j5qdOVPvrJ6hvtVqb1J9FOxysNI',
    ),
    authOptions: const FlutterAuthClientOptions(
      detectSessionInUri: false,
    ),
  );

  final prefs = await SharedPreferences.getInstance();

  runApp(
    ProviderScope(
      overrides: [
        sharedPrefsProvider.overrideWithValue(prefs),
      ],
      child: const KaipaApp(),
    ),
  );
}




// test hot reload Mon May  4 12:19:48 PM UTC 2026
// test hot reload Mon May  4 12:21:20 PM UTC 2026
// test 12:22:07
// test 12:27:43
