# firestore-io

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) <a href="https://www.buymeacoffee.com/rumadra"><img src="https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png" height="20px"></a>

Firestore のコレクションやサブコレクションを **Firebase Admin SDK** を用いてローカル環境で簡単に **エクスポート／インポート** できるCLIツールです。

## 機能

- 指定したコレクション以下を再帰的にたどり、全サブコレクションを含むデータを JSON ファイルにエクスポート
- JSON ファイルの構造を読み込んで、Firestore にドキュメント／サブコレクションを再帰的にインポート
- データベースIDの指定に対応（`(default)` 以外の DB でも使用可能）
- ログ出力

## 必要要件

- Node.js (version 22 以降推奨)
- TypeScript, tsx
- Firebase Admin SDK
- Firebaseプロジェクトの **サービスアカウント鍵ファイル** (例: `serviceAccountKey.json`)  
  - [Firebaseコンソール](https://console.firebase.google.com/) または [Google Cloud コンソール](https://console.cloud.google.com/iam-admin/serviceaccounts) からダウンロードしてください。


## インストール

```bash
git clone https://github.com/Rumadra/firestore-io.git
cd firestore-io
npm install
```

## 使い方

### 1. サービスアカウントを準備

Firebase の管理画面または GCP コンソールからサービスアカウントキーをダウンロードして
 `serviceAccountKey.json` のファイル名で本リポジトリ直下に配置します。

### 2. TypeScript でコンパイル／または tsx で実行

#### エクスポート

```bash
npx tsx firestore-admin-io.ts \
  --serviceAccount=./serviceAccountKey.json \
  --dbId=databaseId \
  --export \
  --collection=users \
  --output=./users.json
```

- `--serviceAccount`: サービスアカウントキーへのパス
- `--dbId`: Firestore のデータベース ID（省略した場合は `(default)` が適用されます）
- `--export`: エクスポートモード
- `--collection`: エクスポート対象コレクション名
- `--output`: 出力先 JSON ファイルパス

#### インポート

```bash
npx tsx firestore-admin-io.ts \
  --serviceAccount=./serviceAccountKey.json \
  --dbId=databaseId \
  --import \
  --file=./users.json
```

- `--import`: インポートモード
- `--file`: インポートに使用する JSON ファイルパス

### 3. 実行ログ例

実行中は以下のようなログが表示され、どのドキュメントやサブコレクションを処理しているかが確認できるようになっています。

```text
[EXPORT] Fetching documents from collection: users
[EXPORT]  - Document found: users/user1
[EXPORT]  -> Document user1 has subcollections: posts, comments
[EXPORT] Fetching documents from collection: users/user1/posts
...
[IMPORT]  - Writing document: users/user1
[IMPORT]  -> Document user1 has subcollections: posts
[IMPORT] Wrote 1 documents to users
[IMPORT]  - Writing document: users/user1/posts/post1
...
```

## jsonファイルフォーマット例

```json
{
  "users": {
    "docId1": {
      "name": "Alice",
      "profile": { ... },
      "subColName": {
        "subDocId1": {
          "fieldA": "...",
          "nestedSubCol": { ... }
        }
      }
    },
    "docId2": { ... }
  }
}

```

## ディレクトリ構成

```
.
├── firestore-admin-io.ts     // 本スクリプト
├── package.json
├── tsconfig.json
└── serviceAccountKey.json    // サービスアカウント認証キー(例)
```

## 注意点

- Admin SDK で実行するため、**Firestore セキュリティルールは適用されません**。
   誤ってデータを上書き/削除しないよう気をつけください。
- JSON の構造によっては大きな入れ子を作り込みやすくなるため、**データ量が膨大な場合は実行時間やメモリ使用量に注意**してください。必要に応じてバッチ処理や分割インポートなどの対応を検討してください。
- 本ツールの利用に伴うデータ損失や障害などが発生しても、作成者は一切の責任を負いません。自己責任にてご利用ください。

------

要望や質問、不具合があればお気軽に Issue お待ちしてます。
