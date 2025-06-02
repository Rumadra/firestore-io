#!/usr/bin/env ts-node

import * as admin from 'firebase-admin';
import { Firestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

function parseArgs(): Record<string, string | boolean> {
  const args = process.argv.slice(2);
  const result: Record<string, string | boolean> = {};
  for (const arg of args) {
    if (arg.startsWith('--')) {
      // 例: --serviceAccount=./serviceAccountKey.json
      //     --export, --import など
      const [key, value] = arg.replace('--', '').split('=');
      if (value === undefined) {
        result[key] = true;
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}

/**
 * Admin SDKのFirestoreを初期化する。
 * 
 * - databaseId が (default) の場合は従来通り admin.firestore() を返す
 * - それ以外のDB IDを指定する場合は new Firestore(...) を使い、databaseIdを明示する
 */
function initFirestore(
  serviceAccountPath: string,
  databaseId: string
): Firestore {
  // サービスアカウントキーを読み込む
  const serviceAccount = JSON.parse(
    fs.readFileSync(path.resolve(serviceAccountPath), 'utf-8')
  );

  // データベースIDが (default) なら標準の初期化
  if (!databaseId || databaseId === '(default)') {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
    return admin.firestore();
  } else {
    // それ以外のDB IDを使う => multi-databaseの利用を想定
    // Firestoreクラスのコンストラクタに projectId, credentials, databaseId を渡す
    const { project_id, private_key, client_email } = serviceAccount;
    return new Firestore({
      projectId: project_id,
      credentials: {
        private_key,
        client_email,
      },
      databaseId: databaseId, // (default) 以外を指定
    });
  }
}

/**
 * 再帰的に Firestore のコレクションをエクスポートする
 */
async function exportCollectionRecursively(
  db: Firestore,
  collectionPath: string
): Promise<Record<string, any>> {
  const result: Record<string, any> = {};
  const colRef = db.collection(collectionPath);
  const snapshot = await colRef.get();

  for (const docSnap of snapshot.docs) {
    const docId = docSnap.id;
    const data = docSnap.data();

    // listCollections() でサブコレクションを取得
    const subCollections = await docSnap.ref.listCollections();
    for (const subColRef of subCollections) {
      const subColName = subColRef.id;
      const subData = await exportCollectionRecursively(
        db,
        `${collectionPath}/${docId}/${subColName}`
      );
      data[subColName] = subData;
    }
    result[docId] = data;
  }
  return result;
}

/**
 * Firestoreの指定コレクションをJSONにエクスポート
 */
async function exportFirestoreToJson(
  db: Firestore,
  collectionName: string,
  outputFile: string
) {
  const data = await exportCollectionRecursively(db, collectionName);
  const exportData = { [collectionName]: data };
  fs.writeFileSync(outputFile, JSON.stringify(exportData, null, 2));
  console.log(`Exported "${collectionName}" to ${outputFile}`);
}

/**
 * JSONをFirestoreへインポートする
 */
async function importJsonToFirestore(db: Firestore, filePath: string) {
  const jsonStr = fs.readFileSync(path.resolve(filePath), 'utf-8');
  const data = JSON.parse(jsonStr);

  for (const [collectionName, collectionObj] of Object.entries(data)) {
    await importRecursively(db, collectionName, collectionObj as Record<string, any>);
    console.log(`Imported collection "${collectionName}" from ${filePath}`);
  }
}

/**
 * 再帰的にドキュメントとサブコレクションを書き込む
 */
async function importRecursively(
  db: Firestore,
  parentPath: string,
  obj: Record<string, any>
) {
  for (const [docId, value] of Object.entries(obj)) {
    const { fields, subCollections } = separateFieldsAndSubcollections(value);
    const docRef = db.doc(`${parentPath}/${docId}`);
    await docRef.set(fields);

    for (const [subColName, subColData] of Object.entries(subCollections)) {
      await importRecursively(db, `${parentPath}/${docId}/${subColName}`, subColData);
    }
  }
}

/**
 * value の中から、「フィールド部分」と「サブコレクション部分」を分離する簡易ロジック
 */
function separateFieldsAndSubcollections(obj: Record<string, any>): {
  fields: Record<string, any>;
  subCollections: Record<string, any>;
} {
  const fields: Record<string, any> = {};
  const subCollections: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      hasDocStructure(value)
    ) {
      subCollections[key] = value;
    } else {
      fields[key] = value;
    }
  }

  return { fields, subCollections };
}

/**
 * 「docId: {...}」のような構造があればサブコレクションと見なす簡易判定
 */
function hasDocStructure(obj: Record<string, any>): boolean {
  return Object.values(obj).some(
    (v) => v && typeof v === 'object' && !Array.isArray(v)
  );
}

/**
 * エントリーポイント
 * 
 * 使い方例:
 *   ts-node firestore-admin-io.ts --serviceAccount=./serviceAccountKey.json --dbId=myDb --export --collection=users --output=users.json
 *   ts-node firestore-admin-io.ts --serviceAccount=./serviceAccountKey.json --dbId=myDb --import --file=users.json
 */
async function main() {
  const args = parseArgs();
  const serviceAccountPath = args.serviceAccount as string;
  const databaseId = (args.dbId as string) || '(default)';

  // Firestore初期化 (databaseId付き)
  const db = initFirestore(serviceAccountPath, databaseId);

  // エクスポート
  if (args.export) {
    const collectionName = args.collection as string;
    const outputFile = args.output as string;
    if (!collectionName || !outputFile) {
      console.error('Error: --collection=<name> and --output=<file> are required for export.');
      process.exit(1);
    }
    await exportFirestoreToJson(db, collectionName, outputFile);
    process.exit(0);
  }

  // インポート
  if (args.import) {
    const filePath = args.file as string;
    if (!filePath) {
      console.error('Error: --file=<jsonPath> is required for import.');
      process.exit(1);
    }
    await importJsonToFirestore(db, filePath);
    process.exit(0);
  }

  console.log('No valid command specified. Use --export or --import.');
  process.exit(1);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
