import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/supabase/supabase_provider.dart';
import '../domain/feed_item_model.dart';

final feedRepositoryProvider = Provider<FeedRepository>((ref) {
  return FeedRepository(ref.watch(supabaseProvider));
});

final feedProvider = FutureProvider<List<FeedItemModel>>((ref) async {
  final repo = ref.watch(feedRepositoryProvider);
  return repo.getFeed();
});

class FeedRepository {
  final SupabaseClient _client;

  FeedRepository(this._client);

  /// Get a paginated feed of items, newest first.
  ///
  /// Returns public feed items from all users.
  Future<List<FeedItemModel>> getFeed({
    int limit = 20,
    int offset = 0,
  }) async {
    final data = await _client
        .from('feed_items')
        .select()
        .order('created_at', ascending: false)
        .range(offset, offset + limit - 1);

    return (data as List).map((row) => FeedItemModel.fromJson(row)).toList();
  }
}
