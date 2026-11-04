# 甜綿菓室：今晚正常營業嗎？

FF14 RP 咖啡廳主題的多人社交推理遊戲網站（TypeScript + Firebase）。

## 第一階段已實作
- 店長（Google 登入 + 後端白名單 `HOST_EMAILS`）建立／開放／關閉房間、開始遊戲、移除玩家
- 店長建立房間時自訂密碼；後端只存加鹽 scrypt 雜湊，關房即刪除；錯誤次數限制
- 客人以邀請網址 `/join/<房間編號>` + 暱稱 + 密碼加入（匿名登入）
- 大廳即時同步（Firestore onSnapshot）；Firestore Security Rules 禁止客戶端寫入、保護密碼雜湊與 `private/` 秘密資料

## 目錄
- `src/rules.ts` 既有規則引擎（未修改）
- `functions/src/core` 房間邏輯（不依賴 Firebase，可單元測試）
- `functions/src/index.ts`、`firestoreStore.ts` Cloud Functions 入口與 Firestore 轉接
- `firestore.rules`、`tests/firestore.rules.test.ts`
- `web/` 前端（Vite + TypeScript）

## 你需要設定的事項（一次性）
1. 建立 Firebase 專案，升級為 Blaze 方案（Cloud Functions 需要）。
2. Authentication 啟用「Google」與「匿名」，授權網域加入你的網站網域。
3. 建立 Firestore 資料庫（正式模式）。
4. 專案設定新增「網頁應用程式」，取得 apiKey / authDomain / projectId / appId。
5. GitHub 儲存庫 Settings → Secrets 新增：
   `FIREBASE_SERVICE_ACCOUNT`（服務帳戶 JSON）、`HOST_EMAILS`（你的店長 Google 信箱）、
   `VITE_FIREBASE_API_KEY`、`VITE_FIREBASE_AUTH_DOMAIN`、`VITE_FIREBASE_PROJECT_ID`、`VITE_FIREBASE_APP_ID`。
6. 在 Actions 頁手動執行 Deploy。
