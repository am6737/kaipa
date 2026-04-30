import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/supabase/supabase_provider.dart';
import '../domain/notification_model.dart';

class NotificationRepository {
  final SupabaseClient _client;

  NotificationRepository(this._client);

  Future<List<NotificationModel>> fetchNotifications({String? type}) async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) throw Exception('Not authenticated');
    var query = _client
        .from('notifications')
        .select()
        .eq('user_id', userId);
    if (type != null && type.isNotEmpty) {
      query = query.eq('type', type);
    }
    final data = await query.order('created_at', ascending: false);
    return (data as List)
        .map((e) => NotificationModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> markAsRead(String notificationId) async {
    await _client
        .from('notifications')
        .update({'is_read': true})
        .eq('id', notificationId);
  }

  Future<void> markAllAsRead() async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) return;
    await _client
        .from('notifications')
        .update({'is_read': true})
        .eq('user_id', userId)
        .eq('is_read', false);
  }

  Future<int> fetchUnreadCount() async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) return 0;
    final data = await _client
        .from('notifications')
        .select('id')
        .eq('user_id', userId)
        .eq('is_read', false);
    return (data as List).length;
  }
}

final notificationRepositoryProvider =
    Provider<NotificationRepository>((ref) {
  final client = ref.watch(supabaseProvider);
  return NotificationRepository(client);
});

final notificationsProvider =
    FutureProvider.family<List<NotificationModel>, String?>((ref, type) async {
  final repo = ref.watch(notificationRepositoryProvider);
  return repo.fetchNotifications(type: type);
});

final unreadCountProvider = FutureProvider<int>((ref) async {
  final repo = ref.watch(notificationRepositoryProvider);
  return repo.fetchUnreadCount();
});
