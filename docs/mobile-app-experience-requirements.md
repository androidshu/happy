# 移动端 / 桌面端体验需求（持续维护）

> **使用约定（重要）**
> 本文件是 Happy 手机端与桌面端体验需求的权威记录。任何会话在改动下列功能
> 之前必须先阅读本文件；完成改动后必须同步更新对应条目的状态与实现要点。
> 条目状态：`已实现` / `待实现` / `进行中`。

## 1. 扫码链接设备：系统扫码器失败必须回退

**状态：已实现**

### 背景

小米等国行 ROM 的 Google Play 服务缺少 ML Kit code scanner 的 Chimera 动态
模块，`CameraView.launchScanner()` 启动后约 20ms 即闪退，且 JS 侧未捕获
rejection，表现为"点链接新设备，闪一下回到账户页，没反应"。

### 要求

- 系统扫码器不可用或启动失败时，必须自动回退到应用内扫码页，不允许静默
  失败。
- 用户主动取消系统扫码器时不回退、不报错，停留在原页面。
- 应用内扫码页自行处理相机权限（未授权时引导，拒绝后给出去系统设置的入口）。
- 同时支持 `happy:///account?` 与 `happy://terminal?` 两类 QR。

### 实现要点

- `sources/utils/qrScanner.ts`：`launchSystemScannerOrFallback(router)`，
  web 直接早退；`CameraView.isModernBarcodeScannerAvailable` 为 false 直接进
  `/scan`；`launchScanner` 抛错且消息不含 "cancel" 时进 `/scan`。
- `sources/app/(app)/scan.tsx`：自建扫码页。注意 expo-camera 的
  `barcodeScannerEnabled` 由 `onBarcodeScanned` 回调是否存在推导（内部
  `ensureNativeProps` 覆盖），暂停扫码必须移除回调而不是传 prop；JS 层有
  500ms 同事件节流，失败的 QR 用 ref 去重防止反复弹错。
- 接入点：`useConnectAccount`、`useConnectTerminal`。
- i18n：`scanner.*` 文案段在全部 11 个语言文件（`_default.ts` +
  `translations/` 10 个）中必须同步。

## 2. 会话列表必须有明确状态指示

**状态：已实现**

### 背景

flat 会话列表一度丢失状态标识，用户无法区分闲置 / 运行中 / 已完成。

### 要求

- 位置：行右下元数据行（时间戳正下方、草稿图标左边），小尺寸（8px 点），
  不与标题争抢注意力。
- 颜色语义（与旧版项目卡片列表 STATUS_CONFIG 同源）：
  - 运行中（thinking）：**蓝色呼吸**（淡入淡出动画）
  - 阻塞（permission_required / input_required）：**橙色呼吸**
  - **完成且有未读结果（hasUnread）：绿色静止点**——只有这一种情况是绿色
  - 闲置已读（waiting）：**无点**
  - 断连（disconnected）：灰色点
  - 机器离线 / 已归档（faded）：无点
- 点开会话后绿点立即取消（由 hasUnread 清除驱动，350ms 过渡）。
- 时间戳常驻右上槽位，不被状态挤占。

### 实现要点

- `sources/utils/flatSessionRowPresentation.ts`：`resolveFlatSessionRowPresentation`
  输出 `statusDot`（type/color/pulsing）与 `shimmerTitle`；判断顺序：
  faded → 阻塞 → thinking → hasUnread → waiting → disconnected。
- `sources/components/FlatSessionRow.tsx`：`workspaceMeta` 行首渲染
  `StatusDot`（react-native-reanimated 呼吸），带无障碍标签。
- 对应测试：`flatSessionRowPresentation.test.ts`。

## 3. 列表排序必须固定，禁止使用中跳动

**状态：已实现**

### 背景

手机端机器分节原先按"最近活动"排序——哪台机器的会话有动静，该分节跳到
最上面，使用中列表不停重排；桌面端用 `localeCompare`，依赖系统 locale，
手机与电脑排序结果可能不一致。

### 要求

- 机器分节 / 机器分组顺序只由机器名字典序决定，跨设备结果一致，使用中
  永不跳动。
- 比较器必须是纯码点序（`a < b ? -1 : a > b ? 1 : 0`），禁止用
  `localeCompare`（locale 依赖导致跨平台不一致）。
- 无机器的行固定排在最后（unknown 分节）。
- 分节内部的会话仍按最近活动排序（不变）。

### 实现要点

- `sources/utils/sessionDisplayOrder.ts`：`compareInDictionaryOrder`，
  桌面端机器分组与项目排序均使用。
- `sources/utils/flatSessionList.ts`：`groupFlatSessionRowsByMachine`
  分节排序使用同一比较器。
- 对应测试：`flatSessionList.test.ts`、`sessionDisplayOrder.test.ts`。

## 4. 未读状态必须跨设备同步

**状态：待实现**

### 背景

当前 `unreadSessionIds` 是 app 内纯内存状态（`sync/storage.ts`，注释自承
"memory-only"）：

- 手机点开会话消除绿点，Mac 上绿点仍在（反之亦然）；
- app 重启后所有绿点丢失；
- 当时不在线的设备连绿点都不会产生（错过活跃→闲置的实时状态转变）。

### 要求

- 任一端点开会话消除未读后，其它端应立即同步消除。
- 未读状态重启不丢。
- 弱网 / 离线时本地先生效，恢复后同步（乐观更新 + 版本冲突重试）。

### 预定方案（已调研，服务端零改动）

- 复用服务端账户级 KV 存储（`userKVStore` 表，`/v1/kv` 接口）：
  带版本号乐观锁，值 base64（客户端自行加密，符合 E2E 设计），
  变更通过 `kv-batch-update` 实时事件广播给同账号所有设备。
- app 侧已有封装：`sources/sync/apiKv.ts`（kvGet / kvBulkGet / kvMutate /
  kvGetByPrefix），事件 schema：`ApiKvBatchUpdateSchema`（apiTypes.ts），
  但目前全未接线（sync.ts 不处理该事件）。
- 设计：key 前缀 `session-read.`；点开会话 → 本地清除 + kvMutate →
  其它设备收 `kv-batch-update` → 本地清除；启动时 kvGetByPrefix 拉全量
  恢复未读集合。
- 工作量集中在：`sync/sync.ts` 事件处理、`sync/storage.ts` 的
  markSessionRead / 未读产生逻辑、新增 readState 模块。

## 变更记录

- 2026-08-27：建立本文件。条目 1（扫码回退）、2（状态指示）、3（字典序
  固定）已在真机（HappyD debug / HappyR release）与桌面端验证完成；
  条目 4（未读跨设备同步）完成方案调研，待实现。
