# 我的主页改版与关注体系

日期：2026-10-27。状态：第 1 批（数据库）已上线；第 2、3、4 批（自己的主页、别人的主页与关注、可见范围与公开装备清单）已写完，类型检查通过，还没在真机上看过；第 5 批待实施。视觉稿见 `docs/previews/me-social-profile.html`。

## 0. 结论

「我」页按 AllTrails / Komoot 的个人主页思路改版：顶部是头像、昵称、粉丝和关注数，下面三个标签「概览 / 时间线 / 照片」。同时引入单向关注。

和视觉稿的取舍：

- 左上角保留现有的扫一扫；右上角是消息中心、分享、设置。
- 不做「次出行 / 总里程 / 累计爬升」统计卡。
- 不做私信、点赞、评论，也不在首页做关注动态流。
- 合集、登顶记录放到第二版。

## 1. 核心概念：一次出行

时间线和照片都以「一次出行」为单位，不再分别列旅程、轨迹、照片。一次出行是下面三种之一：

| 类型 | 条件 | 标题 |
| --- | --- | --- |
| 旅程 + 轨迹 | 旅程未删除，挂了 `track_id` | 完成了一段旅程 |
| 只有旅程 | 旅程未删除，`status = 'completed'`，没挂轨迹 | 记录了一段旅程 |
| 只有轨迹 | 录制的轨迹（`file_format is null`），没有挂到任何未删除旅程上 | 你完成了一次徒步 |

导入的轨迹文件（GPX/KML/KMZ）只有挂到旅程上才算出行，单独存在时只出现在「我的轨迹」里。

排序时间取 `coalesce(轨迹 started_at, 旅程 created_at)`。不用 `updated_at`，否则改一下旅程，它就跳到时间线最上面。

照片标签就是「有照片的出行」的索引。点组标题会跳到时间线里对应的那一条，所以两个标签不会冲突。

## 2. 可见范围

每次出行只设一次可见范围，存放位置：

- 有旅程的，存在 `journeys.visibility`；
- 只有轨迹的，存在 `tracks.visibility`。

可选值为 `private`（仅自己）、`followers`（粉丝可见）、`public`（公开），**默认 `private`**。上线后，所有老数据都只有自己可见。

现有的 `journeys.track_public`（发布到发现页）第一版保持独立，不和主页可见范围合并。

别人能否看到，只在 `can_view_profile_content(owner, visibility)` 一处判断：

- 本人看到全部。
- 任一方拉黑了对方，就什么都看不到。
- `public`：账号不是私密的，所有登录用户都能看；账号是私密的，只有已通过的粉丝能看。
- `followers`：只有已通过的粉丝能看。
- `private`：只有本人能看。

## 3. 关注、私密账号、拉黑

- **单向关注**，不需要对方同意。
- **私密账号**（`profiles.is_private`）：别人发起关注时先是 `pending`，本人通过后才算粉丝。关掉私密时，所有待处理的请求一并通过。
- **拉黑**（`user_blocks`）：立刻解除双方的关注和请求。
  - 被拉黑的人调用 `profile_summary` 只会拿到 `null`，像这个人不存在一样，看不出自己被拉黑了。
  - 拉黑后双方搜索不到对方，也不能再关注。
- **通知**：复用 `notify_helpful`，同一人 24 小时内只提醒一次，推送由已有触发器自动入队。通知 kind：
  - `follow`：关注了你
  - `follow_request`：请求关注你
  - `follow_accepted`：通过了你的关注请求

  三者的 `target_id` 都是对方的用户 id。客户端点开后跳到对方主页（第 3 批）。

## 4. 隐私：轨迹与照片

- **轨迹**：别人看到的轨迹，服务端先裁掉起点和终点各 200 m，再抽稀到最多 160 个点（`outing_preview_coords`）。完整坐标不会给别人。
  - 本人看自己的不裁剪。
  - 轨迹总长不超过 400 m 时，别人拿到空数组，只显示统计数字。
  - 返回的 `endsHidden` 标记用来显示「起终点附近 200 m 已隐藏」。
- **照片**：第一版只取旅程里的瞬间（`inspo_media`），而且只取上传者本人的。
  - 同行者上传的照片显示在同行者自己的主页上，不显示在你的主页上。
  - 别人只能看到审核通过（`approved`）的照片。本人能看到自己全部照片，并能看到审核状态。
- **位置元数据（第 5 批）**：2026-10-27 查了存储里全部 80 张瞬间照片和 12 个视频。
  - 普通照片和普通视频是干净的：选图时 `quality: 0.8` 会重新编码，EXIF 里的 GPS 跟着丢了。
  - 漏的是实况照片（Live Photo）：静态图按原始 HEIC 上传，带 GPS（5 个）；配对的 `.mov` 带 QuickTime 位置（5 个）。有些对象扩展名是 `.bin`，实际也是 HEIC / MOV。
  - 手机端没法去掉视频里的位置，老版本和网页访客上传也管不到，所以放在服务端做：`media-scrubber` 后台服务每分钟扫一遍新的存储对象，用 exiftool 只删位置标签（保留方向、拍摄时间和实况配对标识，不重新编码），按原路径覆盖上传，网址不变。查过的对象记在 `media_location_scrub` 表里。
  - 范围：`kaipa`（跳过 `tracks/`、`assistant/`）、`kaipa-gear`、`shared-moments`。
  - 文件：`infra/supabase/media-scrubber.{mjs,Dockerfile,compose.yml}`、`deploy-media-scrubber.sh`（`--dry-run` 只记日志）、迁移 `20261027160000_media_location_scrub.sql`（已应用）、测试 `supabase/tests/media-location-scrub.sql`。
  - 存储的计费触发器 `account_storage_object` 要求每次写入都有上传凭证，服务端就地覆盖拿不到。迁移 `20261027170000_storage_service_rewrite.sql`（以 supabase_admin 应用，测试 `supabase/tests/storage-service-rewrite.sql`）只放行 service role 对已有对象的原路径更新：跳过凭证，只按大小差计费，保留原来的 `ticket_id`（孤儿文件清理靠它判断时间）。客户端写入照旧要凭证。
  - 2026-10-27 已处理存量：271 个对象检查完，194 个干净、57 个不是图片视频、10 个实况文件已去掉位置。重新下载公开地址验证过：没有位置标签，方向和实况配对标识都在，磁盘上旧版本已由存储删除。
  - 2026-10-27 后台常驻服务已部署（容器 `kaipa-media-scrubber`，每 60 秒检查新上传）。重新部署用 `infra/supabase/deploy-media-scrubber.sh`。上传后到被清理之间最多约一分钟文件是带位置的；以后可以改成上传前在手机上处理，再撤掉这个服务。

## 5. 数据库（第 1 批，已上线）

迁移文件 `supabase/migrations/20261027120000_social_follows.sql`，测试 `supabase/tests/social-follows.sql`。

表和字段：

- `profiles.is_private`
- `journeys.visibility`、`tracks.visibility`
- `follows (follower_id, followee_id, status, created_at, accepted_at)`：RLS 只允许读和自己有关的行，写入只能通过 RPC。
- `user_blocks (blocker_id, blocked_id, created_at)`：RLS 只允许读自己拉黑的人。

写操作 RPC：

- `follow_user(target)`：返回 `accepted` 或 `pending`。已经关注过的，返回现有状态。
- `unfollow_user(target)`：也用于撤回还没通过的请求。
- `respond_follow_request(follower, accept)`
- `remove_follower(follower)`
- `block_user(target)`、`unblock_user(target)`
- `set_account_private(bool)`

读操作 RPC：

- `profile_summary(user)`：返回资料、粉丝数和关注数、`relation`（self / following / followedBy / blocked）、`canView`、可见出行数。本人还会拿到 `pendingRequests`。
- `profile_outings(user, before, limit)`：时间线，按 `occurredAt` 倒序，用 `before` 翻页，每页最多 50 条。每条出行包含：
  - 标识和类型：`id`（`j:<journeyId>` 或 `t:<trackId>`）、`kind`（both / journey / track）、`journeyId`、`trackId`、`visibility`；
  - 名称和地点：`title`、`routeId`、`routeName`、`region`、`dateLabel`；
  - 统计：`occurredAt`、`totalDays`、`distM`、`ascM`、`durationMs`；
  - 轨迹：`coords`、`endsHidden`；
  - 照片和同行：`companions`、`photoCount`、`photos`（前 6 张）。
- `profile_outing_photos(user, journeyId)`：一次出行的全部照片。
- `profile_follow_list(user, 'followers' | 'following', offset, limit)`
- `follow_requests()`
- `search_profiles(query, limit)`：匹配昵称、显示名和用户名前缀。
- `suggested_profiles(limit)`：可能认识的人，即一起走过同一段旅程、还没关注的人。

## 6. 分批实施

**第 1 批：数据库**（已上线）。见第 5 节。

**第 2 批：自己的主页**（已实现，待真机验收）

- 新增 `src/hooks/useSocial.ts`，负责读写 profile_summary 和 profile_outings。自己的数据通过 `useOfflineState` 缓存，离线时也能打开。
- 改造 `MeScreen` 主体：
  - 头部区：头像、昵称、简介、粉丝和关注数，以及「找人」按钮。
  - 三个标签：
    - 概览：四宫格，装备，年度统计；
    - 时间线：出行卡片，地图缩略图和照片；
    - 照片：按出行分组，点组标题跳回时间线。
  - 顶栏保留扫一扫、消息中心、设置。
  - 不做统计卡，内容之间不用分割线。
- 原「我」页的二级页（轨迹、足迹、收藏、设置等）全部保留，入口挪到概览四宫格和设置抽屉里。

**第 3 批：别人的主页与关注**（已实现，待真机验收）

- 补充迁移 `20261027130000_social_relation_requests.sql`：relation 加 `requestedMe`，profile_summary 加 `hiddenOutings`。
- 页面在 `src/components/social/`，由 `NavContext.socialStack` 管理：主页和粉丝列表可以互相点进去，返回一次弹一页。
- `FollowButton`：关注 / 申请关注（私密账号）/ 回关 / 已申请 / 已关注 / 互相关注。点下去先改本地状态，失败改回；取消关注、撤回请求要在动作面板里确认。
- `UserProfilePage`：
  - 头部和「我」页共用 `ProfileHero`，下面是整行关注按钮；对方向我发了请求时，多一块「接受 / 拒绝」。
  - 更多菜单：移除粉丝（对方关注了我时）、拉黑；已拉黑时是取消拉黑。
  - 私密账号未关注时，只显示头部和提示；能看时有「时间线 / 照片」两个标签，还有只给粉丝看的出行时在底部提示。
  - 别人的出行只有我也在同行名单里时才打得开，否则卡片没有「查看」入口。
- `PeoplePage`：粉丝 / 关注，自己的再加「找人」（搜索，未输入时显示可能认识的人）。自己的粉丝页顶上列出关注请求，可以直接接受或拒绝。
- 入口：「我」页头部的粉丝数、关注数和找人按钮；评论作者的头像和昵称；攻略作者行。同行管理页里有账号、不是自己的同行者，点头像进对方主页（点整行仍是编辑称呼）。
- 消息中心和推送点开 `follow` / `follow_request` / `follow_accepted` 时打开对方主页。

**第 4 批：可见范围和装备清单**（迁移 `20261027140000_social_visibility_gear.sql` 已应用，测试 `supabase/tests/social-gear.sql`）

- 出行可见范围：自己时间线上每张出行卡的可见范围标签可以点，弹出「谁可以看到」三选一，调用 `set_outing_visibility(journey_id, track_id, visibility)`（只有本人能改）。改可见范围不算旅程的一个版本：`record_journey_version` 比较字段时跳过 `visibility`。旅程设置里的入口在第 5 批加上了，轨迹详情的还没加。
- 设置抽屉里加「私密账号」开关，走 `set_account_private`。关掉时待处理的关注请求会全部自动通过。
- 装备清单可见范围：`gear_sets.visibility`，默认 `private`。自己的清单详情里有「谁可以看到」一行，直接更新这一列。
- 别人主页上 `gearSets > 0` 时多一个「装备」标签，列出 `profile_gear_sets` 返回的清单卡片（件数、不含备选的总重）。点开是清单预览页（`nav.openGearSetPreview`，渲染在 `socialStack` 里），数据来自 `profile_gear_set`，不带价格、备注、照片。
- 「存为我的清单」调用 `copy_gear_set`：同名装备（忽略大小写和首尾空格）复用自己已有的；没有的新建为待购（`owned = false`，价格 0），分类按名字对上自己的，没有就按原颜色新建；每件在清单里的数量和状态照搬。自己的清单和看不到的清单不能复制。

**第 5 批：周边**（已实现，未提交；轨迹详情入口待补）

- 去掉照片和视频里的位置元数据（见第 4 节）。已完成，后台服务已部署。
- 旅程设置和轨迹详情里的可见范围入口。旅程设置里只有本人能改，改了立即生效，不进保存草稿。轨迹详情：挂在旅程上的轨迹跟随旅程，只显示一行说明；录制的、没挂旅程的轨迹可以改；导入的、没挂旅程的轨迹不算出行，不显示。前端通过 `data.setJourneyVisibility` / `data.setTrackVisibility` 调 `set_outing_visibility`，并同步本地缓存。旅程设置入口已加；轨迹详情入口还没加，因为 `TrackDetailPage.tsx` 正在另一处重写，等它合入后再补。
- 「我的贡献」页：攻略（`route_guides`）、评论（自己的顶层 `route_comments`，`useMyRouteComments`，离线缓存）、路线请求（`route_requests`）。和视觉稿不同：没有「路况」这一类，因为路况已经并进路线评论（`20261016120000_route_comments.sql`）；评论没有星级。审核中的攻略和路线请求本来就只有自己能读到。只做自己的，别人主页上不显示贡献。
- 时间线里的「写评论」提示（视觉稿里叫「写点评」）：只对挂了路线、自己还没在这条路线下发过顶层评论的出行显示，点了打开这条路线的评论框。
- 「离线下载」这批不做：路线库本来整体缓存在手机里，离线就能打开；别人的轨迹只给裁掉起终点的预览，不能给完整坐标。见第 7 节。

## 7. 待定

- 用户名为空的账号：搜索时只能匹配昵称，分享主页链接也没法用用户名，需要引导用户补填用户名。
- 发现页的 `track_public` 和主页可见范围，第二版考虑合并。
- 别人出行卡上的「离线下载」：第 5 批没做，要做得先想清楚下载的是什么（路线库已离线可用，别人的完整轨迹不对外）。
