export type FeatureTarget = 'items' | 'camera';

export const sectionGuide = {
  settings: { title: '読み込み・設定', short: '設定', description: '使う機能を読み込み、色・初期値・Vue の状態を用意します。', color: '#527da5' },
  stage: { title: '画面を準備する', short: '画面の準備', description: '描画先の canvas・レンダラー・シーンを用意します。', color: '#338caa' },
  items: { title: 'アイテムを宣言・配置する', short: 'アイテム', description: '形・材質・メッシュ・光源を作り、シーンに配置する場所です。', color: '#248564' },
  camera: { title: 'カメラ・視点を決める', short: 'カメラ', description: 'カメラの位置や注視点、ドラッグによる視点操作を設定します。', color: '#8561bc' },
  animation: { title: '動き・描画を更新する', short: '動き', description: '毎フレーム繰り返します。回転や移動を変えるコードはここへ。', color: '#b57b1d' },
  cleanup: { title: '後片付けする', short: '後片付け', description: '画面を閉じるときに、作った形や材質・操作を解放します。', color: '#b56975' },
  lifecycle: { title: '起動・エラー処理', short: '起動処理', description: '初期化の完了を待ち、描画を開始します。', color: '#7b8796' },
  template: { title: '画面の要素を並べる', short: '操作画面', description: 'canvas やボタンなど、Vue のテンプレートを書く場所です。', color: '#2a8b8a' },
  style: { title: '画面の見た目を整える', short: '見た目', description: '操作欄・ボタン・余白などの CSS を書きます。', color: '#aa689c' },
  data: { title: 'モデルの元データ', short: 'モデルデータ', description: 'STL 本体の保存データです。形の調整はアイテムのブロックで行います。', color: '#8a8c98' },
};
export type SectionKind = keyof typeof sectionGuide;
export interface CodeSection {
  kind: SectionKind;
  startLine: number;
  endLine: number;
  target: FeatureTarget | null;
}
