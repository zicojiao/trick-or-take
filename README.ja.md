<div align="center">
  <img src="public/party/assets/wordmark-v3-ink.png" alt="Trick or Take" width="420">
  <p><strong>お菓子を取ろう。見つからないように。</strong></p>
  <p>ブラウザーで遊べる、小さなハロウィンのお菓子泥棒ゲーム。ひとりでも、友達とボイスチャットしながらでも。</p>
  <p><a href="https://trickortake.com/">今すぐ遊ぶ</a> · <a href="docs/deployment.md">デプロイガイド</a></p>
</div>

[English](README.md) · [简体中文](README.zh-CN.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · **日本語** · [한국어](README.ko.md) · [Português (Brasil)](README.pt-BR.md)

[![Agora RTC](https://img.shields.io/badge/Agora-RTC-0099FF)](https://www.agora.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-orange.svg)](LICENSE)
![Node.js 22.13+](https://img.shields.io/badge/Node.js-22.13%2B-339933)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers%20%2B%20D1-F38020)

[![Trick or Take](public/party/assets/og-home-v3-en.png)](https://trickortake.com/)

## ゲームについて

リリーはキッチンで大忙し。目の前にはお菓子がいっぱい。ひとつくらい、なくなっても気づかないよね？

長押しでお菓子を取り、離すと隠して知らんぷり。リリーが振り向いたときも取り続けていると、ほうきで叩かれて**お菓子がすべてゼロ**になります。制限時間は60秒。どれだけ持ち帰れるでしょうか？

おばけ、かぼちゃ、コウモリ猫からキャラクターを選べます。ひとりで挑戦することも、6桁のルームコードを友達に送って対戦することもできます。ボイスチャットは任意です。

| 機能 | 内容 |
| --- | --- |
| ソロ | ローカルの自己ベスト、一時停止、合成音によるBGM |
| マルチプレイ | 2〜6人、6桁のルームコード、準備確認、再戦 |
| 音声 | Agora RTCによるマイク通話、ミュート、再接続 |
| ルーム更新 | Agora RTMの通知。利用できない場合は定期的な問い合わせで更新 |
| 共通のチャレンジ | ランダムな間隔と明確な予告、全員に同じルール |
| ランキング | 共通のランキング。名前とスコアの公開はプレイヤーが選択 |
| シェア | 検証済みの結果リンクとダウンロードできるスコアカード |
| モバイル | タッチ操作、画面幅に応じたレイアウト、ホーム画面アイコン |
| ゲームの言語 | 12言語の画面とメタデータ。OG画像は英語と簡体字中国語に対応 |

## 遊び方

1. キャラクターを選びます。マルチプレイではルームを作成するか参加し、全員が準備できたら開始します。
2. 大きなボタン、ゲーム画面、または **スペースキー** を押し続けるとお菓子を取れます。長く押すほど取る速度が上がります。
3. リリーが振り向き始めたら離します。キャラクターはすぐに何もしていない表情に戻ります。
4. 見つかると所持数はゼロになります。短い気絶時間のあと、また挑戦できます。
5. 終了時は手に持っているお菓子も得点に含まれます。最も多い人が勝ち。同点は引き分けです。

1ラウンドは60秒。リリーは長短の間隔を織り交ぜ、振り向く前に0.55–1.90秒の予告を出します。難易度の選択はありません。

タイミングは毎回変わります。サーバーは警告が始まるまで次の振り向き時刻を公開しません。マルチプレイでは会話を妨げないようBGMを停止します。

## ローカルで起動する

**Node.js 22.13以降**とnpmが必要です。ローカルのゲームとルーム機能は、CloudflareのアカウントやAgoraの認証情報なしで試せます。

```bash
git clone https://github.com/zicojiao/trick-or-take.git
cd trick-or-take
npm ci
npm run db:migrate
npm run dev
```

**http://localhost:5173** を開きます。別のタブから同じルームに参加し、両方のプレイヤーを準備完了にすれば、マルチプレイの流れを確認できます。実際の通話品質は2台の端末で確認してください。

`wrangler.json` のゼロで埋めたデータベースIDはローカル開発用の仮の値です。デプロイ前に自分のD1データベースIDへ置き換えます。

### Agora RTCとRTMを有効にする

```bash
cp .dev.vars.example .dev.vars
```

`.dev.vars` に `AGORA_APP_ID` と `AGORA_APP_CERTIFICATE` を設定し、開発サーバーを再起動します。AgoraプロジェクトでRTCとSignaling/RTMを有効にしてください。サーバーは認証済みのルーム参加者に有効期間の短いトークンを発行します。App Certificateはブラウザーに送信されません。

各プレイヤーは **Join voice** を選び、マイクへのアクセスを許可します。localhostまたはHTTPSが必要です。本番環境の設定は英語の[デプロイガイド](docs/deployment.md)を参照してください。

### 任意のアクセス解析

解析は**初期状態では無効**です。自分の `POSTHOG_PROJECT_TOKEN` と `POSTHOG_HOST` を設定すると有効になります。`/config.js` は公開可能なイベント受信設定のみを返します。

PostHogはファーストパーティCookieとローカルストレージを使います。自動収集とセッション録画は無効です。イベントのURLからルームコード、チャレンジID、クエリパラメーターを取り除き、プレイヤー名は送信しません。運用に合わせてプライバシーページを見直してください。

## 仕組み

クライアントはJavaScriptとCanvas 2Dを使用します。Cloudflare Workerがページ、静的ファイル、API、OG画像を提供し、D1がルームと結果を保存します。音声はAgora RTC、ルーム更新の通知はRTMが担当します。

- **共通ルール：** `public/party/engine.mjs` をソロとサーバーの両方で使用します。
- **サーバーが管理する状態：** バージョンを条件にした更新で同時操作の上書きを防ぎます。RTMの通知だけでゲーム状態は決まりません。
- **結果の検証：** ソロの入力履歴をサーバーで再現し、マルチプレイの得点はルーム状態から取得します。
- **任意の公開：** ゲーム終了だけでは名前や得点を公開しません。チャレンジリンクにも名前は含まれません。
- **ルールのバージョン管理：** 難易度変更後も、対応する旧バージョンの記録を検証できます。

詳しくは英語の[アーキテクチャ説明](docs/architecture.md)を参照してください。検証は不整合な得点を拒否しますが、自動操作を完全に防ぐものではありません。

## ディレクトリ構成

```text
public/party/    ゲーム、Canvas、操作、音声、翻訳、画像
public/          アイコン、マニフェスト、検索エンジン向けファイル
server/          ルーム、トークン、得点検証、OG画像
worker/          ルーティングと言語別HTML
drizzle/         D1マイグレーション
scripts/         アイコン生成と検証
tests/           自動テスト
docs/            英語のデプロイ・設計ドキュメント
```

## ライセンス

[MIT](LICENSE)
