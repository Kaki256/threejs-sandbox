# Three.js Sandbox

Vue 3 + TypeScript + Three.js + Vite + Bun で動く、小部屋のプレイグラウンドとコードサンドボックスです。

## 小部屋で遊ぶ

小部屋0〜4を横一列に表示します。小部屋1〜4の8つのアイテムを小部屋0にも配置し、同じIDのアイテム同士で部屋内の相対位置を共有します。移動・座標入力・取り消し・位置のリセットは両方の部屋に同時に反映します。部屋の回転は個別です。

- 小部屋0のアイテムをクリック、または一覧から選択します。
- WASD・矢印キーで床上を移動します。画面の方向に動き、部屋の端で止まります。
- 右ドラッグでその部屋だけを回転します。カメラは固定で、床より下から見えない範囲に傾きを制限します。
- スマホでは横スクロールで部屋を見渡せます。「指で部屋を回す」で回転し、下部の矢印でアイテムを移動します。
- Ctrl / Cmd + Z と「一手戻る」で操作を取り消せます。配置・回転・選択は端末内のlocalStorageに保存します。

## コードで作る

作品ごとにVue SFCを編集できます。型・構文チェック、コード補完、追加ボタンとパラメータ、自動反映・自動保存、STL読込、スクリーンショット、JSONバックアップに対応します。作品もブラウザごとの保存です。

## 開発

```sh
bun install --frozen-lockfile
bun run dev
bun run check:rooms
bun run check:features
bun run build:public
bun run preview:public
```

公開先の標準ベースパスは /threejs-sandbox/ です。変更する場合は PAGES_BASE を設定してビルドします。GitHub Pagesではハッシュ形式のルーターを使うため、直接URLを開いた場合や再読み込みでもページを表示できます。

## GitHub Pages

リポジトリの Settings → Pages → Build and deployment → Source を GitHub Actions に設定します。main にpushすると、.github/workflows/deploy-pages.yml がBunで検証・ビルド・公開します。Actionsタブから手動実行もできます。

公開ビルドにはインポートされた記事本文を含めません。scripts/check-public.ts で記事ページや識別子の混入を検査します。このリポジトリにも元の記事ファイルは含めません。
