# 现场离线行程分享 · 技术设计

> 场景:无网络的山里,我建好了行程,遇到小伙伴 —— 我把行程「现场公开」出来,
> 大家不分机型连进来,浏览 / 上传 / 下载照片,并能把这次行程**存为自己的**。
> 像「开热点 + 隔空投送」一样,但**跨平台、无互联网**。

本文档重点是 **传输层**(两段式架构 + v1/v1.5/v2 取舍与工作量)。其余章节给出落地所需的上下文。

---

## 1. 角色

| 角色 | 说明 | UI |
|---|---|---|
| **Host(主人)** | 建了行程、开启现场分享的人 | 原生,**新增大头在这** |
| **访客·浏览器** | 任意机型、没装 app,连热点用浏览器加入 | 复用现有 Web `GuestApp` |
| **访客·App** | 也装了 Kaipa,能在 app 内加入并「存为自己的行程」 | 原生,有新 UI |

---

## 2. 总体流程(生命周期)

```
HOST(原生)                          访客(浏览器 / App)
────────────────────────────────────────────────────────────
① 行程页点「现场分享」
② [新] HostShareSheet 主控页
   · 引导开个人热点(iOS 不能程序开)
   · 启动本地服务器(serve GuestApp + 照片 + API)
   · BLE 广播 + 显示 Wi-Fi 二维码
        ├──────────────► ③ 发现并加入
        │                   浏览器:扫 Wi-Fi 二维码 → GuestCover→Wall
        │                   App   :BLE 自动发现 → 点 → 半自动加入
        │                ④ [复用] 浏览(GuestWall / Lightbox)
        │◄────────────── ⑤ [复用] 上传(GuestUploadSheet)
   [新] 主控页实时看到涌入
        │                ⑥ 存为自己的:
        │                   浏览器:[复用] 下载到相册
        │                   App   :[新] 导入为自己的行程(v2)
⑦ 点「结束分享」→ 停服务
        └──────────────► [小改] GuestWall 显示「分享已结束」
```

---

## 3. 传输层(本文档重点)

### 3.1 核心原则:发现 ≠ 传输

AirDrop 与安卓快传(Quick Share)内部都是**两段式**,且实现一致:

- **第一段·发现/握手** —— 低带宽:**蓝牙 BLE**(互相看见 + 交换连接信息)
- **第二段·传文件** —— 高带宽:**Wi-Fi**(AirDrop 用 AWDL,快传用 Wi-Fi Direct)

> 结论:蓝牙/NFC 物理上扛不动照片(BLE 实测 ~10–25 KB/s,一张图要几分钟;NFC 机对机 P2P 在
> Android 14 已移除、iOS 从不支持)。**照片只能走 Wi-Fi。** 蓝牙/NFC 只配做「发现 + 握手」。

我们照搬这个分层。

### 3.2 两段式架构

```
【第一段·发现+握手 — BLE】(react-native-ble-plx,iOS↔安卓通用)
  Host:开热点 + 启动本地服务器后,BLE 广播 Kaipa 服务UUID
        GATT 暴露:行程名、host名、握手 characteristic
  访客App:BLE 扫描 → 「附近的行程」自动出现:🏔 老张·漓江精华段
          点一下 → 读取握手包 { ssid, password, host_ip, port, token }
                                  ▼
【第二段·加入+传输 — Wi-Fi】
  访客App:NEHotspotConfiguration(iOS)/ WifiNetworkSpecifier(安卓)
          → 系统弹一次「加入老张的热点?」→ 点「加入」
          → 同一局域网 → HTTP 打到 host 本地服务器
                       → 现成 GuestApp:浏览 / 上传 / 下载 / 保存
```

App 访客的最终体验:**打开 app → 附近行程自动出现 → 点它 → 确认加入 → 进去。**
无二维码、无输 IP、无手翻 Wi-Fi。

### 3.3 一条必须知道的边界

第三方 app **不能使用 AWDL**(苹果私有);只有 **iOS 26 的 Wi-Fi Aware** 才首次开放该能力。

后果:**iOS 26 之前做不到「BLE 一碰、两机自动组网」的全自动。** 「Wi-Fi 传输」这一段必须骑在一个
**手动开启的热点**上。BLE 能省掉的是扫码 / 输 IP / 手选网络;**省不掉 host 手动开热点这一下**
(iOS 不允许程序化开启个人热点)。这是本方案在 v2 之前的真实天花板。

### 3.4 分层取舍:v1 / v1.5 / v2

| 阶段 | 发现 | 加入 | 传输 | host 手动开热点? | 关键依赖 | 适用 |
|---|---|---|---|:---:|---|---|
| **v1** | Wi-Fi 二维码 | 扫码近乎一键 | Wi-Fi HTTP | 是 | 本地服务器 | 通杀所有机型/系统,含无 app 路人 |
| **v1.5** ⭐ | **BLE 自动发现** | **NEHotspotConfig 半自动** | Wi-Fi HTTP | 是 | + ble-plx + 热点配置权限 | app 访客,接近隔空投送 |
| **v2** | Wi-Fi Aware | 自动直连 | Wi-Fi Aware | **否** | iOS26+ / 自研原生模块 | 两端 iOS26+/新安卓且同 app |

取舍要点:
- **v1 是地基,必做**:唯一「通杀」方案 —— 任意机型、任意系统版本、连没装 app 的路人都能用。
- **v1.5 是体验跃迁**:用今天就有的 API(BLE + NEHotspotConfiguration,iOS 11 起)复刻 AirDrop 体验的 ~90%,**不依赖 iOS 26**。只对 app 访客生效;浏览器访客仍走 v1 的二维码。
- **v2 是终极形态**:连「开热点」都省掉,但需 iOS 26 覆盖到位 + 自研原生模块,**暂不排期**,作为路线图保留。

### 3.5 本地服务器:静态 vs 动态(选型 + 风险)

本地服务器有两类职责,选型不同:

| 职责 | 内容 | 方案 |
|---|---|---|
| **静态** | serve 内嵌的 GuestApp SPA + host 已有照片(只读 `/media/*`) | `@dr.pogodin/react-native-static-server`(内置 lighttpd)直接胜任 |
| **动态** | 访客上传照片(`POST /api/upload`)、拉实时墙(`GET /api/moments`) | lighttpd **做不到**(只发静态文件),需要可在 JS 里处理请求的服务 |

**动态部分**是 v1 的主要技术风险。两条路:
- **A(推荐先验证)**:整个服务器基于 `react-native-tcp-socket` 自建一个极简 HTTP 路由,
  同时 serve SPA + `/media/*` + `/api/*`。一个端口、一套代码,控制力最强。
- **B**:`static-server` 发 SPA/只读媒体 + `tcp-socket` 单独接管上传/列表 API(两个端口)。

→ **先做 spike 验证 A 是否够稳**(详见 §7)。

### 3.6 握手包协议(BLE GATT)

访客点击后,从 host 的 GATT characteristic 读到一个小 JSON:

```jsonc
{
  "ssid": "Laozhang-Hotspot",   // host 热点名
  "password": "xxxxxxxx",        // host 热点密码
  "host_ip": "172.20.10.1",      // host 在热点网段的地址
  "port": 8080,
  "token": "<一次性加入令牌>",    // 进 HTTP 层校验,防陌生人乱连
  "journey": "漓江精华段＋老寨山" // 仅展示用
}
```

### 3.7 浏览器访客兜底(Wi-Fi 二维码)

没装 app 的路人走不了 BLE。HostShareSheet 展示一个**标准 Wi-Fi 格式**二维码:

```
WIFI:S:<ssid>;T:WPA;P:<password>;;
```

iOS 相机与安卓相机扫到会**原生提示「加入此网络」**;加完跳浏览器开 `http://host_ip:port/j/...`。
所以路人也接近「扫一下就进」。

---

## 4. 数据层改造(让访客 UI 不动)

现有 `GuestApp` 组件全靠 hook 拿数据,只要把数据源抽象成可切换 provider,视图层几乎不改:

```
useGuestData / guestStorage
        │
   ┌────┴────┐
 cloud      localHost            ← 新增
 (Supabase) (http://host_ip:port/api/*)
```

- `cloud` provider = 现有 Supabase 逻辑(线上分享继续用)。
- `localHost` provider = 同样的接口形状,改打 host 本地 API。
- **改 `useGuestData.ts` + `guestStorage.ts`,不改 `GuestWall/Lightbox/UploadSheet/Cover/...`。**

---

## 5. UI 改动清单

**🆕 Host 原生(主要工作量)**
1. 行程页「现场分享」入口(与现有「分享」并列的离线模式)
2. **HostShareSheet 主控页**:热点引导、Wi-Fi 二维码、BLE 广播状态、已加入人数、`允许上传/下载`开关、`结束分享` —— 核心新件
3. (可选)实时涌入照片的 live feed

**🆕 App 访客原生**
4. 「附近的行程」BLE 发现列表 + 加入预览(v1.5)
5. 「存为自己的行程」导入流程(v2)

**♻️ Web 访客(基本不动)**
6. `GuestCover / IdentitySheet / GuestWall / GuestLightbox / GuestUploadSheet / GuestSaveSheet` —— 组件不改,仅切数据源
7. 分享结束 / host 离开的「离线」提示态(小改)

---

## 6. 工作量估算

> 口径:1 名熟练 RN 工程师,含调试与踩坑;单位为「人天」,区间为不确定度。

**一次性基建(各版本共用)**
- 迁移 EAS 自定义构建 + config plugin 接原生模块:**2–3**
- 数据层 provider 抽象(`useGuestData`/`guestStorage`,cloud ⇄ localHost):**1–2**

**v1 — 热点 + 本地服务器 + 二维码**
- 本地 HTTP 服务器(tcp-socket + 极简路由:SPA + `/media` + `/api`)⚠️核心风险:**4–6**
- GuestApp 打成可内嵌静态包并由 host 加载:**1–2**
- host 落地访客上传(照片入本机文件 + moment 记录):**2–3**
- HostShareSheet UI(引导 / 二维码 / 状态 / 人数 / 结束):**3–4**
- localHost provider 接通 + 离线态 + 联调容错:**3–4**
- **小计 ≈ 16–24 人天(约 3–5 周,含基建)**

**v1.5 — BLE 发现 + 半自动加入(叠加在 v1 上)**
- ble-plx 接入 + host BLE 广播(GATT + 握手 characteristic):**3–4**
- 访客 BLE 扫描 + 「附近行程」列表 UI:**2–3**
- 握手包协议 + NEHotspotConfiguration(iOS)/ WifiNetworkSpecifier(安卓)+ 权限/entitlement:**4–6**
- 前后台可靠性 + 跨平台联调:**2–3**
- **小计 ≈ 11–16 人天(约 2–3 周)**

**v2 — Wi-Fi Aware**
- 自研 iOS Wi-Fi Aware 原生模块(无现成 RN 库)+ 安卓 NAN 对接:高度不确定,**评估区间 10–20+ 人天**
- 受限 iOS 26+ 设备覆盖,**暂不排期**,等生态/覆盖成熟。

---

## 7. 建议的落地顺序

1. **Spike(2–3 天)**:EAS dev build 上验证「`tcp-socket` 极简 HTTP 服务器 serve 现有 GuestApp 静态包 + 一个 `/api/upload`」,两台手机互访跑通。**坐实 §3.5 的方案 A。**
2. **v1**:按 §6 完成热点 + 本地服务器 + 二维码全链路。
3. **v1.5**:加 BLE 发现层,app 访客体验跃迁。
4. **v2**:观望 iOS 26 覆盖,再决定是否自研 Wi-Fi Aware。

---

## 8. 依赖与原生构建

- 所有方案都要**离开 Expo Go、迁 EAS 自定义构建**(static-server / tcp-socket / ble-plx / 热点配置 全是原生模块)。换协议**不能**绕开这一步。
- iOS 需 entitlement:**Network Extensions & Hotspot Configuration**(NEHotspotConfiguration)、Bluetooth 使用说明。
- 安卓需权限:`NEARBY_WIFI_DEVICES`/位置(BLE 扫描)、`CHANGE_WIFI_STATE` 等。

---

## 9. 待拍板的决策

- [ ] 「现场分享」入口放哪个屏(建议:行程详情页)
- [ ] v1 本地服务器选 §3.5 的 A 还是 B(建议:先 spike 验证 A)
- [ ] App 内「存为自己的行程」(§5 第 4–5 条)v1 做还是 v2 做(建议:v2)
- [ ] host 离线后访客内容是否本地保留(浏览器靠提前下载;app 访客靠提前 import)

---

## 10. 风险登记

| 风险 | 影响 | 缓解 |
|---|---|---|
| 本地动态服务器(上传/列表)在 RN 自建 | v1 核心,可能踩坑 | 先 spike;退路用方案 B 双端口 |
| host 须手动开热点(iOS 限制) | 体验差一步 | 图文引导 + 跳设置;v2 用 Wi-Fi Aware 消除 |
| iOS BLE 后台广播受限(UUID 进 overflow、丢 local name) | 后台发现不稳 | 本场景双方前台使用,前台→前台可靠 |
| `joinOnce`/NEHotspotConfiguration iOS 15+ 已知问题 | 加入异常 | `joinOnce=false`,手动管理断开 |
| 全链路需自定义原生构建 | 提高门槛 | 一次性基建,后续复用 |
