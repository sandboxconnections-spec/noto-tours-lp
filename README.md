# Noto, Slowly（3ツアーLP）

マインドフルネス／寿司／SUP の3つの1日ツアーを売るLP。申込はページ内フォーム → SBCが確定連絡 → Stripeのリンク。

- ページ: `index.html`（確認は `node server.js` → http://localhost:4192 ）
- 計測と申込の受け口: `gas/`（Google Apps Script）→ スプレッドシート「Noto Slowly LP 計測」
  - `events`＝出来事1件1行（名前・メールは入らない）／`requests`＝申込1件1行＋持ち主にメール通知／`ファネル`＝式で自動集計
- 配るリンクには `?src=名前`（例 `?src=colive` `?src=kimachi`）。自分で試すときは `#test`（記録されるが集計から外れる）
- localhost では `#test` を付けたときだけ送る

## 更新のしかた
- ページ: `index.html` を直して push
- 受け口: `clasp push` → `clasp deploy -i AKfycbzpsUj1l8gusjvJQfsgudRZ1zF40k1MA-iro1B3Cb0VvdK1b2blYnmIMe4Z5GZnJl3f`（URLを変えずに更新）
