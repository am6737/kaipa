import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/supabase/supabase_provider.dart';
import '../domain/review_model.dart';

class ReviewRepository {
  final SupabaseClient _client;

  ReviewRepository(this._client);

  /// Get all reviews for a specific route, newest first.
  Future<List<ReviewModel>> getReviewsByRoute(String routeId) async {
    final data = await _client
        .from('reviews')
        .select()
        .eq('route_id', routeId)
        .order('created_at', ascending: false);

    return (data as List)
        .map((row) => ReviewModel.fromJson(row as Map<String, dynamic>))
        .toList();
  }

  /// Alias for backwards compatibility.
  Future<List<ReviewModel>> fetchReviews(String routeId) =>
      getReviewsByRoute(routeId);

  /// Create a new review for a route.
  ///
  /// Also updates the route's rating and review_count via a
  /// post-insert recalculation.
  Future<ReviewModel> createReview({
    required String routeId,
    required int rating,
    String? content,
    List<String> photos = const [],
  }) async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) {
      throw Exception('Must be signed in to create a review');
    }

    final reviewData = {
      'route_id': routeId,
      'user_id': userId,
      'rating': rating,
      'content': content,
      'photos': photos,
    };

    final inserted = await _client
        .from('reviews')
        .insert(reviewData)
        .select()
        .single();

    // Recalculate route aggregate rating
    final allReviews = await _client
        .from('reviews')
        .select('rating')
        .eq('route_id', routeId);

    final ratings =
        (allReviews as List).map((r) => (r['rating'] as num).toDouble()).toList();
    final avgRating = ratings.reduce((a, b) => a + b) / ratings.length;

    await _client.from('routes').update({
      'rating': double.parse(avgRating.toStringAsFixed(1)),
      'review_count': ratings.length,
    }).eq('id', routeId);

    return ReviewModel.fromJson(inserted);
  }
}

final reviewRepositoryProvider = Provider<ReviewRepository>((ref) {
  final client = ref.watch(supabaseProvider);
  return ReviewRepository(client);
});

final reviewsByRouteProvider =
    FutureProvider.family<List<ReviewModel>, String>((ref, routeId) async {
  final repo = ref.watch(reviewRepositoryProvider);
  return repo.fetchReviews(routeId);
});
