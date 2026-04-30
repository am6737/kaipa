import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/supabase/supabase_provider.dart';
import '../domain/gear_category_model.dart';
import '../domain/gear_item_model.dart';

final gearRepositoryProvider = Provider<GearRepository>((ref) {
  return GearRepository(ref.watch(supabaseProvider));
});

class GearRepository {
  final SupabaseClient _client;

  GearRepository(this._client);

  /// Get all gear categories ordered by sort_order.
  Future<List<GearCategoryModel>> getCategories() async {
    final data = await _client
        .from('gear_categories')
        .select()
        .order('sort_order', ascending: true);

    return (data as List)
        .map((row) => GearCategoryModel.fromJson(row))
        .toList();
  }

  /// Get gear items for the current user in a specific category.
  Future<List<GearItemModel>> getItemsByCategory(String categoryId) async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) {
      throw Exception('Must be signed in to view gear');
    }

    final data = await _client
        .from('gear_items')
        .select()
        .eq('user_id', userId)
        .eq('category_id', categoryId)
        .order('created_at', ascending: false);

    return (data as List).map((row) => GearItemModel.fromJson(row)).toList();
  }

  /// Get all gear items for the current user.
  Future<List<GearItemModel>> getAllUserItems() async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) {
      throw Exception('Must be signed in to view gear');
    }

    final data = await _client
        .from('gear_items')
        .select()
        .eq('user_id', userId)
        .order('created_at', ascending: false);

    return (data as List).map((row) => GearItemModel.fromJson(row)).toList();
  }

  /// Create a new gear item for the current user.
  Future<GearItemModel> createItem({
    required String categoryId,
    required String name,
    String? brand,
    double? weightG,
    double? price,
    String? condition,
    String? photoUrl,
    String? notes,
    bool isFavorite = false,
    DateTime? purchasedAt,
  }) async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) {
      throw Exception('Must be signed in to create gear');
    }

    final itemData = {
      'user_id': userId,
      'category_id': categoryId,
      'name': name,
      'brand': brand,
      'weight_g': weightG,
      'price': price,
      'condition': condition,
      'photo_url': photoUrl,
      'notes': notes,
      'is_favorite': isFavorite,
      'purchased_at': purchasedAt?.toIso8601String(),
    };

    final inserted = await _client
        .from('gear_items')
        .insert(itemData)
        .select()
        .single();

    return GearItemModel.fromJson(inserted);
  }

  /// Get a single gear item by ID.
  Future<GearItemModel> getItemById(String itemId) async {
    final data = await _client
        .from('gear_items')
        .select()
        .eq('id', itemId)
        .single();

    return GearItemModel.fromJson(data);
  }

  /// Update a gear item's fields.
  Future<GearItemModel> updateItem(String itemId, Map<String, dynamic> updates) async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) {
      throw Exception('Must be signed in to update gear');
    }

    final updated = await _client
        .from('gear_items')
        .update(updates)
        .eq('id', itemId)
        .eq('user_id', userId)
        .select()
        .single();

    return GearItemModel.fromJson(updated);
  }

  /// Toggle favorite status on a gear item.
  Future<GearItemModel> toggleFavorite(String itemId, bool isFavorite) async {
    return updateItem(itemId, {'is_favorite': isFavorite});
  }

  /// Delete a gear item by ID (only if owned by the current user).
  Future<void> deleteItem(String itemId) async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) {
      throw Exception('Must be signed in to delete gear');
    }

    await _client
        .from('gear_items')
        .delete()
        .eq('id', itemId)
        .eq('user_id', userId);
  }
}

// ─── Riverpod providers ──────────────────────────────────────────────

final gearCategoriesProvider = FutureProvider<List<GearCategoryModel>>((ref) async {
  final repo = ref.watch(gearRepositoryProvider);
  return repo.getCategories();
});

final allGearItemsProvider = FutureProvider<List<GearItemModel>>((ref) async {
  final repo = ref.watch(gearRepositoryProvider);
  return repo.getAllUserItems();
});

final gearItemsByCategoryProvider =
    FutureProvider.family<List<GearItemModel>, String>((ref, categoryId) async {
  final repo = ref.watch(gearRepositoryProvider);
  return repo.getItemsByCategory(categoryId);
});

final gearItemByIdProvider =
    FutureProvider.family<GearItemModel, String>((ref, itemId) async {
  final repo = ref.watch(gearRepositoryProvider);
  return repo.getItemById(itemId);
});
