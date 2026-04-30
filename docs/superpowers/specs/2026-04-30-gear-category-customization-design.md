# 装备分类自定义与重命名功能设计

## 概述

允许用户自定义添加装备分类、修改内置分类名称、拖拽排序分类，以及删除自建分类。采用"用户级分类覆盖"方案，内置分类数据始终保留，用户修改通过覆盖记录实现。

## 需求摘要

- 用户可自定义添加新的装备分类
- 内置分类的名称可修改，支持一键恢复默认名称
- 自定义分类可删除，删除后其下装备自动移至"未分类"
- 分类图标支持预设 SVG 图标和 emoji 两种方式
- 分类支持拖拽排序
- 管理入口：主页"+"卡片快速添加 + 独立管理页面集中操作

---

## 1. 数据层

### 1.1 数据库变更

在现有 `gear_categories` 表上增加字段：

```sql
ALTER TABLE gear_categories ADD COLUMN is_builtin boolean NOT NULL DEFAULT false;
ALTER TABLE gear_categories ADD COLUMN user_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE gear_categories ADD COLUMN icon_type text NOT NULL DEFAULT 'svg'
  CHECK (icon_type IN ('svg', 'emoji'));
ALTER TABLE gear_categories ADD COLUMN builtin_ref uuid REFERENCES gear_categories(id);
ALTER TABLE gear_categories ADD COLUMN original_name text;

-- 每个用户对每个内置分类最多一条覆盖记录
ALTER TABLE gear_categories ADD CONSTRAINT uq_user_builtin_override UNIQUE (user_id, builtin_ref);
```

字段说明：

| 字段 | 用途 |
|------|------|
| `is_builtin` | 区分全局内置分类 (`true`) 和用户记录 (`false`) |
| `user_id` | 用户自建或覆盖记录的归属者，内置分类为 `null` |
| `icon_type` | 图标类型：`svg`（预设图标）或 `emoji` |
| `builtin_ref` | 指向被覆盖的内置分类 ID（仅重命名内置分类时使用） |
| `original_name` | 冗余存储内置分类原始名称，用于"恢复默认"展示 |

### 1.2 分类类型

| 类型 | is_builtin | user_id | builtin_ref | 说明 |
|------|-----------|---------|-------------|------|
| 内置分类 | `true` | `null` | `null` | 现有 10 条，所有用户共享 |
| 用户覆盖 | `false` | 用户 ID | 内置分类 ID | 用户重命名内置分类产生的覆盖记录 |
| 用户自建 | `false` | 用户 ID | `null` | 用户自定义添加的全新分类 |
| 未分类 | `true` | `null` | `null` | 特殊内置分类，sort_order=999，不可删除/重命名 |

### 1.3 现有内置分类标记

将现有 10 条种子数据标记为 `is_builtin = true`，并新增"未分类"分类：

```sql
UPDATE gear_categories SET is_builtin = true WHERE user_id IS NULL;

INSERT INTO gear_categories (id, name, icon, icon_type, sort_order, is_builtin)
VALUES ('b0000000-0000-0000-0000-000000000000', '未分类', 'inbox', 'svg', 999, true);
```

### 1.4 查询逻辑

用户完整分类列表 = 内置分类（排除已被该用户覆盖的）+ 该用户的覆盖记录 + 该用户的自建分类，按 `sort_order` 排序。

```sql
SELECT * FROM gear_categories
WHERE
  (is_builtin = true AND id NOT IN (
    SELECT builtin_ref FROM gear_categories
    WHERE user_id = :uid AND builtin_ref IS NOT NULL
  ))
  OR user_id = :uid
ORDER BY sort_order;
```

### 1.5 RLS 策略

- 内置分类（`is_builtin = true`）：所有用户可读，无人可改
- 用户分类（`user_id IS NOT NULL`）：仅本人可增删改查

```sql
-- 读取：内置分类所有人可读，用户分类仅本人可读
CREATE POLICY "gear_categories_select" ON gear_categories FOR SELECT USING (
  is_builtin = true OR user_id = auth.uid()
);

-- 插入：仅用户分类
CREATE POLICY "gear_categories_insert" ON gear_categories FOR INSERT WITH CHECK (
  is_builtin = false AND user_id = auth.uid()
);

-- 更新：仅用户分类
CREATE POLICY "gear_categories_update" ON gear_categories FOR UPDATE USING (
  is_builtin = false AND user_id = auth.uid()
);

-- 删除：仅用户自建分类（非覆盖记录需额外处理装备迁移）
CREATE POLICY "gear_categories_delete" ON gear_categories FOR DELETE USING (
  is_builtin = false AND user_id = auth.uid()
);
```

---

## 2. UI 交互

### 2.1 装备库主页变更

**"+"卡片：**
- 位于分类网格末尾，虚线边框 + 加号图标
- 点击弹出 BottomSheet 创建新分类

**管理入口：**
- 右上角编辑图标按钮，点击进入分类管理页面

### 2.2 创建分类 BottomSheet

包含以下内容：

- **分类名称输入框**：最多 10 个字符，实时校验去重
- **图标选择器**（两个 Tab）：
  - 预设图标 Tab：网格展示 20-30 个 SVG 图标，点选高亮
  - Emoji Tab：文本输入框，输入或粘贴一个 emoji，实时预览
- **确认按钮**：校验通过后创建分类

### 2.3 分类管理页面

**ReorderableListView 拖拽排序列表，每条分类包含：**

左侧：
- 拖拽手柄图标
- 分类图标（SVG 或 emoji）
- 分类名称

右侧操作区，按分类类型不同：

| 分类类型 | 可用操作 |
|---------|---------|
| 内置分类（未改名） | 重命名 |
| 内置分类（已改名） | 重命名 + 恢复默认 |
| 用户自建分类 | 重命名 + 删除 |
| 未分类（特殊） | 无操作，灰色显示，不参与拖拽，固定末尾 |

**重命名交互：**
- 点击后分类名称变为可编辑 TextField，inline 编辑
- 失焦或回车保存

**删除交互：**
- 弹出确认对话框："该分类下的 N 件装备将移至「未分类」"
- 确认后执行删除 + 装备 category_id 迁移

**恢复默认交互：**
- 点击后直接恢复名称为 `original_name`
- 删除覆盖记录，SnackBar 提示"已恢复为 XXX"

**拖拽排序：**
- 拖拽释放后批量更新 sort_order
- "未分类"固定末尾不参与拖拽

---

## 3. 状态管理与 Repository 层

### 3.1 GearRepository 新增方法

| 方法 | 说明 |
|------|------|
| `getUserCategories()` | 合并内置 + 用户覆盖 + 自建分类，按 sort_order 排序 |
| `createCategory(name, icon, iconType)` | 插入自建分类，sort_order = 当前最大值 + 1 |
| `renameBuiltinCategory(builtinId, newName)` | 创建覆盖记录（builtin_ref 指向原分类，original_name 存原名） |
| `renameCustomCategory(categoryId, newName)` | 直接更新记录名称 |
| `resetBuiltinCategory(overrideId)` | 删除覆盖记录，内置分类自动恢复 |
| `deleteCustomCategory(categoryId)` | 删除分类 + 将其下装备的 category_id 改为"未分类"ID |
| `reorderCategories(List<String> orderedIds)` | 批量更新 sort_order |

### 3.2 Riverpod Provider 变更

- `gearCategoriesProvider` → 改用 `getUserCategories()`，返回合并后的分类列表
- 新增 `categoryManagementProvider`（StateNotifier）→ 管理分类管理页面的增删改排序状态
- 操作完成后 invalidate `gearCategoriesProvider` 刷新主页网格

### 3.3 Model 变更

`GearCategoryModel` 增加字段：

```dart
final bool isBuiltin;
final String? userId;
final String iconType;  // 'svg' | 'emoji'
final String? builtinRef;
final String? originalName;

bool get isRenamed => originalName != null && originalName != name;
bool get isUncategorized => sortOrder == 999;
```

---

## 4. 边界情况

| 场景 | 处理方式 |
|------|---------|
| 分类名称重复 | 同一用户不允许同名分类，提交时校验并提示 |
| 名称长度 | 最多 10 个字符 |
| 自建分类上限 | 最多 20 个，达上限后"+"卡片置灰并提示 |
| "未分类"保护 | 固定末尾，不可删除/重命名/拖拽 |
| 离线/操作失败 | SnackBar 提示错误，不改变本地状态 |
| 覆盖记录一致性 | 每个内置分类每用户最多一条覆盖记录，通过 UNIQUE(user_id, builtin_ref) 约束 |
| 内置分类覆盖后装备归属 | 覆盖记录继承原内置分类的 ID 用于装备关联，或装备 category_id 指向覆盖记录 ID |

### 装备归属策略

当用户重命名内置分类时，创建覆盖记录并将该用户在该内置分类下的所有装备的 `category_id` 更新为覆盖记录的 ID。恢复默认时，将装备的 `category_id` 改回内置分类 ID，再删除覆盖记录。

---

## 5. 涉及文件

| 文件 | 变更类型 |
|------|---------|
| `supabase/migrations/` | 新增迁移文件：表结构变更 + RLS 策略 + 种子数据更新 |
| `gear/domain/gear_category_model.dart` | 增加新字段和计算属性 |
| `gear/data/gear_repository.dart` | 新增 7 个方法 + 修改查询逻辑 |
| `gear/presentation/gear_library_screen.dart` | 增加"+"卡片和管理入口按钮 |
| `gear/presentation/category_management_screen.dart` | 新建：分类管理页面 |
| `gear/presentation/widgets/create_category_sheet.dart` | 新建：创建分类 BottomSheet |
| `gear/presentation/widgets/icon_picker.dart` | 新建：图标选择器组件 |
| `core/router/app_router.dart` | 增加分类管理页面路由 |
