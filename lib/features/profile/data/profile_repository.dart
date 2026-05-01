import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/supabase/supabase_provider.dart';
import '../domain/profile_model.dart';

class ProfileRepository {
  final SupabaseClient _client;

  ProfileRepository(this._client);

  Future<ProfileModel> fetchCurrentProfile() async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) throw Exception('Not authenticated');
    final data = await _client
        .from('profiles')
        .select()
        .eq('id', userId)
        .single();
    return ProfileModel.fromJson(data);
  }

  Future<ProfileModel> fetchProfileById(String id) async {
    final data = await _client
        .from('profiles')
        .select()
        .eq('id', id)
        .single();
    return ProfileModel.fromJson(data);
  }

  Future<void> updateProfile(String userId, Map<String, dynamic> updates) async {
    await _client.from('profiles').update(updates).eq('id', userId);
  }

  Future<void> updateDifficultyPreference(String userId, String difficulty) async {
    await _client
        .from('profiles')
        .update({'difficulty_preference': difficulty})
        .eq('id', userId);
  }

  Future<Map<String, dynamic>?> getEmergencyContact() async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) throw Exception('Not authenticated');
    final data = await _client
        .from('profiles')
        .select('emergency_contact')
        .eq('id', userId)
        .single();
    return data['emergency_contact'] as Map<String, dynamic>?;
  }

  Future<void> updateEmergencyContact(Map<String, dynamic> contact) async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) throw Exception('Not authenticated');
    await _client
        .from('profiles')
        .update({'emergency_contact': contact})
        .eq('id', userId);
  }
}

final profileRepositoryProvider = Provider<ProfileRepository>((ref) {
  final client = ref.watch(supabaseProvider);
  return ProfileRepository(client);
});

final currentProfileProvider = FutureProvider<ProfileModel>((ref) async {
  final repo = ref.watch(profileRepositoryProvider);
  return repo.fetchCurrentProfile();
});

final emergencyContactProvider = FutureProvider<Map<String, dynamic>?>((ref) async {
  final repo = ref.watch(profileRepositoryProvider);
  return repo.getEmergencyContact();
});
