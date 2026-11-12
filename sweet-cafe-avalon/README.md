# 甜綿菓室：今晚正常營業嗎？

FF14 RP 咖啡廳主題的多人社交推理遊戲網站。Vite + 原生 TypeScript 前端，只使用 Firebase Spark 免費方案
（Authentication、Cloud Firestore、Hosting），**沒有 Cloud Functions，不需要 Blaze，不需要綁定帳單**。

## 目前已實作（第一階段）
- 房主 Google 登入；玩家匿名登入
- 房主建立房間（自訂 4 位數字密碼，可 0 開頭）、開放入場、開始遊戲、關閉房間、移除玩家；`HOST_ONLY` 與 `HOST_IS_PLAYER`
- 房間狀態：準備中（created）→ 招募中（open）→ 遊戲中（playing）→ 已結束（closed）
- 首頁有公開房間列表（即時同步）；只有「招募中」的房間可輸入暱稱與密碼加入，準備中、遊戲中、已結束都不能加入
- 招募中至少 6 人才能開始，最多 12 人；同房暱稱不重複；房間結束後密碼雜湊立即刪除
- 大廳即時同步（Firestore `onSnapshot`）
- 遊戲規則引擎 `src/rules.ts`（未修改）；遊戲流程、秘密職業發牌尚未整合

## 目錄
- `src/rules.ts`：既有規則引擎與其測試
- `web/src/api.ts`：直接操作 Firestore 的房間功能
- `web/src/lib/`：驗證、PBKDF2 密碼雜湊、座位與暱稱索引（可單元測試）
- `firestore.rules`：安全規則（沒有後端時唯一的權限把關者）
- `tests/firestore.rules.test.ts`：規則測試（需要 Firestore 模擬器）

## Firestore 資料結構
| 路徑 | 內容 | 誰能讀 | 誰能寫 |
|---|---|---|---|
| `admins/{uid}` | `{ enabled: true }` | 只有本人 | 只有 Firebase 主控台 |
| `rooms/{roomId}` | hostUid、hostMode、status（created/open/playing/closed）、maxPlayers、pwSaltB64（公開鹽值）、createdAt、openedAt、closedAt | 登入者憑房間編號 | 該房房主（依序改狀態） |
| `roomSecrets/{roomId}` | `{ hashB64 }` 密碼的 PBKDF2 雜湊 | **沒有人** | 房主建房時建立、關房時刪除 |
| `rooms/{roomId}/seats/{1..12}` | `{ uid }` | 登入者 | 玩家加入／離開（同批次） |
| `rooms/{roomId}/nicknames/{編碼後暱稱}` | `{ uid }` | 單筆讀取（不可列出） | 同上 |
| `rooms/{roomId}/joinProofs/{uid}` | `{ proof }` 玩家加入時送出的密碼雜湊 | **沒有人** | 本人 |
| `rooms/{roomId}/members/{uid}` | 暱稱、角色、座位、加入時間 | 房主與同房成員 | 加入／離開，建立後不可修改 |
| `rooms/{roomId}/private/{uid}` | 秘密職業（下一階段） | 只有本人 | 本階段無人可寫 |

## 房間密碼的運作與安全限制（請務必閱讀）
Firestore 規則無法執行 PBKDF2，只能比對「相等」。因此：
1. 房主建房時，瀏覽器用 PBKDF2-SHA256（公開鹽值、100,000 次）算出雜湊，存進 `roomSecrets`（客戶端不可讀）。
2. 玩家加入時，瀏覽器用同一個鹽算出雜湊，與座位、暱稱、成員資料同一批次寫入；規則用 `getAfter()` 比對該雜湊是否等於 `roomSecrets` 的值。
3. 資料庫沒有明文密碼；其他玩家讀不到雜湊。

**這不等同伺服器端密碼驗證**，限制如下：
- 密碼只有 4 位數字（10,000 種組合）且沒有嘗試次數限制（依你的決定），任何人都能用匿名帳號反覆猜。這適合朋友間的私人遊戲；房間列表是公開的，陌生人看得到房間，只是需要猜中密碼才能進入。
- 雜湊本身等同「密碼的替身」：任何能讀到 `roomSecrets` 的人（例如有 Firebase 專案權限的人，或資料庫匯出檔）可直接送出該雜湊加入房間。客戶端無法讀取。
- 人數上限（12）與暱稱不重複靠座位／暱稱文件由規則強制；人數下限（6）只由房主的瀏覽器在開始遊戲時檢查。暱稱的正規化由瀏覽器計算，被改寫過的瀏覽器可能繞過「大小寫／全形視為同名」，但不能超過 12 個座位，房主也能移除玩家。
- 沒有後端：之後的遊戲流程（發牌、算票）會由房主的瀏覽器執行，房主技術上能看到更多資訊，詳見先前的檢查報告。

## 你需要在 Firebase 主控台手動設定
1. 建立 Firebase 專案（Spark 免費方案即可），並新增「網頁應用程式」，記下 apiKey、authDomain、projectId、appId。
2. Authentication → 登入方式：啟用「Google」與「匿名」。Authentication → 設定 → 授權網域：確認有你的 Hosting 網域。
3. 建立 Firestore 資料庫（正式模式）。
4. **建立房主白名單**：先用 Google 登入網站一次（`/host`）；Authentication → 使用者 找到你的帳號並複製「使用者 UID」；Firestore → 新增集合 `admins` → 文件 ID 貼上該 UID → 新增欄位 `enabled`（boolean）= `true`。
5. 部署規則：Firestore 規則由 GitHub Actions 的 Deploy 一併部署（見下）。

## GitHub 部署設定
GitHub 儲存庫 Settings → Secrets and variables → Actions 新增：
`VITE_FIREBASE_API_KEY`、`VITE_FIREBASE_AUTH_DOMAIN`、`VITE_FIREBASE_PROJECT_ID`、`VITE_FIREBASE_APP_ID`，
以及 `FIREBASE_SERVICE_ACCOUNT`（你自己在 Google Cloud 建立、只存放在 GitHub Secrets 的服務帳戶 JSON，不要貼給任何人）。
然後在 Actions 頁手動執行 Deploy，只會部署 Hosting 與 Firestore 規則。
