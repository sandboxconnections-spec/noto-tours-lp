# のとくる？ 3ツアーLP（旧称 Noto, Slowly）

マインドフルネス／寿司／SUP の3つの1日ツアーを売るLP。申込はページ内フォーム → SBCが確定連絡 → Stripeのリンク。

- ページ: `index.html`（確認は `node server.js` → http://localhost:4192 ）
- 計測と申込の受け口: `gas/`（Google Apps Script）→ スプレッドシート「Noto Slowly LP 計測」
  - `events`＝出来事1件1行（名前・メールは入らない）／`requests`＝申込1件1行＋持ち主にメール通知／`ファネル`＝式で自動集計
- 配るリンクには `?src=名前`（例 `?src=colive` `?src=kimachi`）。自分で試すときは `#test`（記録されるが集計から外れる）
- localhost では `#test` を付けたときだけ送る
- 言語: 1ファイルで日英。`?lang=ja`／`?lang=en`（無ければ前回の選択→ブラウザの言語）。右上のボタンで切り替え。英語はHTMLそのもの、日本語は `index.html` の `JA` 対応表で差し替え。**英語の文を直したら JA の左側も同じに直す**（`?lang=ja&check` で訳し漏れが画面に出る）
- 価格は総額表示（税込）＝165,000円／220,000円（税別15万・20万）

## 更新のしかた
- ページ: `index.html` を直して push
- 受け口: `clasp push` → `clasp deploy -i AKfycbzpsUj1l8gusjvJQfsgudRZ1zF40k1MA-iro1B3Cb0VvdK1b2blYnmIMe4Z5GZnJl3f`（URLを変えずに更新）
