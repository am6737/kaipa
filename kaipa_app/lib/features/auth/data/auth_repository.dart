import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/supabase/supabase_provider.dart';
import '../domain/user_model.dart';

class AuthRepository {
  final SupabaseClient _client;

  AuthRepository(this._client);

  /// Sign up a new user with email and password, creating a profile row.
  Future<UserModel> signUp({
    required String email,
    required String password,
    required String username,
    required String displayName,
  }) async {
    final response = await _client.auth.signUp(
      email: email,
      password: password,
    );

    final user = response.user;
    if (user == null) {
      throw Exception('Sign-up failed: no user returned');
    }

    final now = DateTime.now().toIso8601String();
    final profileData = {
      'id': user.id,
      'username': username,
      'display_name': displayName,
      'joined_at': now,
      'updated_at': now,
    };

    await _client.from('profiles').insert(profileData);

    final profile =
        await _client.from('profiles').select().eq('id', user.id).single();

    return UserModel.fromJson(profile);
  }

  /// Sign in with email and password.
  Future<UserModel> signIn({
    required String email,
    required String password,
  }) async {
    final response = await _client.auth.signInWithPassword(
      email: email,
      password: password,
    );

    final user = response.user;
    if (user == null) {
      throw Exception('Sign-in failed: no user returned');
    }

    final profile =
        await _client.from('profiles').select().eq('id', user.id).single();

    return UserModel.fromJson(profile);
  }

  /// Sign out the current user.
  Future<void> signOut() async {
    await _client.auth.signOut();
  }

  /// Get the currently authenticated user's profile, or null if not signed in.
  Future<UserModel?> getCurrentUser() async {
    final session = _client.auth.currentSession;
    if (session == null) return null;

    final userId = session.user.id;
    final profile =
        await _client.from('profiles').select().eq('id', userId).maybeSingle();

    if (profile == null) return null;
    return UserModel.fromJson(profile);
  }

  /// The raw Supabase [User] if currently authenticated.
  User? get currentUser => _client.auth.currentUser;

  /// Stream of auth state changes (sign in, sign out, token refresh).
  Stream<AuthState> onAuthStateChange() {
    return _client.auth.onAuthStateChange;
  }

  /// Alias for backwards compatibility.
  Stream<AuthState> get authStateChanges => _client.auth.onAuthStateChange;
}

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  final client = ref.watch(supabaseProvider);
  return AuthRepository(client);
});
