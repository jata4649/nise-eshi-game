console.log("topics.js version 623 loaded");

// ==============================
// v623 お題ペア一覧
// normalTopic: 市民絵師のお題
// fakeTopic: ニセ絵師のお題
// ==============================
window.TOPIC_PAIRS = [
  // 動物
  { normalTopic: "猫", fakeTopic: "虎", category: "動物" },
  { normalTopic: "犬", fakeTopic: "狼", category: "動物" },
  { normalTopic: "うさぎ", fakeTopic: "カンガルー", category: "動物" },
  { normalTopic: "パンダ", fakeTopic: "シロクマ", category: "動物" },
  { normalTopic: "ライオン", fakeTopic: "チーター", category: "動物" },
  { normalTopic: "ゾウ", fakeTopic: "マンモス", category: "動物" },
  { normalTopic: "キリン", fakeTopic: "首長竜", category: "動物" },
  { normalTopic: "ペンギン", fakeTopic: "アヒル", category: "動物" },
  { normalTopic: "ニワトリ", fakeTopic: "孔雀", category: "動物" },
  { normalTopic: "カエル", fakeTopic: "トカゲ", category: "動物" },
  { normalTopic: "カメ", fakeTopic: "恐竜", category: "動物" },
  { normalTopic: "サメ", fakeTopic: "クジラ", category: "動物" },
  { normalTopic: "魚", fakeTopic: "イルカ", category: "動物" },
  { normalTopic: "馬", fakeTopic: "ユニコーン", category: "動物" },
  { normalTopic: "コウモリ", fakeTopic: "悪魔", category: "動物" },

  // 食べ物
  { normalTopic: "りんご", fakeTopic: "トマト", category: "食べ物" },
  { normalTopic: "バナナ", fakeTopic: "とうもろこし", category: "食べ物" },
  { normalTopic: "いちご", fakeTopic: "さくらんぼ", category: "食べ物" },
  { normalTopic: "みかん", fakeTopic: "レモン", category: "食べ物" },
  { normalTopic: "ぶどう", fakeTopic: "ブルーベリー", category: "食べ物" },
  { normalTopic: "スイカ", fakeTopic: "メロン", category: "食べ物" },
  { normalTopic: "もも", fakeTopic: "りんご", category: "食べ物" },
  { normalTopic: "なし", fakeTopic: "りんご", category: "食べ物" },
  { normalTopic: "パイナップル", fakeTopic: "サボテン", category: "食べ物" },
  { normalTopic: "にんじん", fakeTopic: "大根", category: "食べ物" },
  { normalTopic: "じゃがいも", fakeTopic: "さつまいも", category: "食べ物" },
  { normalTopic: "きゅうり", fakeTopic: "ナス", category: "食べ物" },
  { normalTopic: "カレー", fakeTopic: "シチュー", category: "食べ物" },
  { normalTopic: "ラーメン", fakeTopic: "うどん", category: "食べ物" },
  { normalTopic: "寿司", fakeTopic: "おにぎり", category: "食べ物" },
  { normalTopic: "ケーキ", fakeTopic: "プリン", category: "食べ物" },
  { normalTopic: "ハンバーガー", fakeTopic: "サンドイッチ", category: "食べ物" },
  { normalTopic: "ピザ", fakeTopic: "お好み焼き", category: "食べ物" },
  { normalTopic: "たこ焼き", fakeTopic: "団子", category: "食べ物" },
  { normalTopic: "焼きそば", fakeTopic: "スパゲッティ", category: "食べ物" },
  { normalTopic: "ドーナツ", fakeTopic: "ベーグル", category: "食べ物" },
  { normalTopic: "アイス", fakeTopic: "かき氷", category: "食べ物" },
  { normalTopic: "チョコ", fakeTopic: "クッキー", category: "食べ物" },
  { normalTopic: "パン", fakeTopic: "クロワッサン", category: "食べ物" },
  { normalTopic: "目玉焼き", fakeTopic: "オムレツ", category: "食べ物" },
  { normalTopic: "牛乳", fakeTopic: "ヨーグルト", category: "食べ物" },

  // 乗り物
  { normalTopic: "車", fakeTopic: "バス", category: "乗り物" },
  { normalTopic: "電車", fakeTopic: "新幹線", category: "乗り物" },
  { normalTopic: "飛行機", fakeTopic: "鳥", category: "乗り物" },
  { normalTopic: "自転車", fakeTopic: "バイク", category: "乗り物" },
  { normalTopic: "船", fakeTopic: "潜水艦", category: "乗り物" },
  { normalTopic: "ヘリコプター", fakeTopic: "ドローン", category: "乗り物" },
  { normalTopic: "トラック", fakeTopic: "消防車", category: "乗り物" },
  { normalTopic: "パトカー", fakeTopic: "救急車", category: "乗り物" },
  { normalTopic: "タクシー", fakeTopic: "リムジン", category: "乗り物" },
  { normalTopic: "ロケット", fakeTopic: "ミサイル", category: "乗り物" },
  { normalTopic: "気球", fakeTopic: "パラシュート", category: "乗り物" },
  { normalTopic: "スケボー", fakeTopic: "スキー", category: "乗り物" },
  { normalTopic: "ローラースケート", fakeTopic: "スケート靴", category: "乗り物" },

  // 道具
  { normalTopic: "鉛筆", fakeTopic: "ペン", category: "道具" },
  { normalTopic: "消しゴム", fakeTopic: "石けん", category: "道具" },
  { normalTopic: "はさみ", fakeTopic: "カニ", category: "道具" },
  { normalTopic: "傘", fakeTopic: "きのこ", category: "道具" },
  { normalTopic: "靴", fakeTopic: "スリッパ", category: "道具" },
  { normalTopic: "帽子", fakeTopic: "ヘルメット", category: "道具" },
  { normalTopic: "メガネ", fakeTopic: "双眼鏡", category: "道具" },
  { normalTopic: "カバン", fakeTopic: "ランドセル", category: "道具" },
  { normalTopic: "鍵", fakeTopic: "スプーン", category: "道具" },
  { normalTopic: "マイク", fakeTopic: "懐中電灯", category: "道具" },
  { normalTopic: "スマホ", fakeTopic: "テレビ", category: "道具" },
  { normalTopic: "時計", fakeTopic: "コンパス", category: "道具" },
  { normalTopic: "本", fakeTopic: "ノート", category: "道具" },
  { normalTopic: "ゲーム機", fakeTopic: "リモコン", category: "道具" },
  { normalTopic: "カメラ", fakeTopic: "スマホ", category: "道具" },
  { normalTopic: "パソコン", fakeTopic: "レジ", category: "道具" },
  { normalTopic: "イヤホン", fakeTopic: "聴診器", category: "道具" },

  // 場所・自然
  { normalTopic: "学校", fakeTopic: "病院", category: "場所" },
  { normalTopic: "家", fakeTopic: "城", category: "場所" },
  { normalTopic: "富士山", fakeTopic: "ピラミッド", category: "場所" },
  { normalTopic: "海", fakeTopic: "プール", category: "自然" },
  { normalTopic: "川", fakeTopic: "道路", category: "自然" },
  { normalTopic: "森", fakeTopic: "公園", category: "自然" },
  { normalTopic: "砂漠", fakeTopic: "ビーチ", category: "自然" },
  { normalTopic: "火山", fakeTopic: "山", category: "自然" },
  { normalTopic: "滝", fakeTopic: "シャワー", category: "自然" },
  { normalTopic: "雲", fakeTopic: "綿あめ", category: "自然" },
  { normalTopic: "雨", fakeTopic: "涙", category: "自然" },
  { normalTopic: "虹", fakeTopic: "橋", category: "自然" },
  { normalTopic: "太陽", fakeTopic: "月", category: "自然" },
  { normalTopic: "雪だるま", fakeTopic: "ロボット", category: "自然" },

  // 人・職業
  { normalTopic: "警察官", fakeTopic: "探偵", category: "人物" },
  { normalTopic: "医者", fakeTopic: "科学者", category: "人物" },
  { normalTopic: "先生", fakeTopic: "店員", category: "人物" },
  { normalTopic: "忍者", fakeTopic: "侍", category: "人物" },
  { normalTopic: "魔法使い", fakeTopic: "魔女", category: "人物" },
  { normalTopic: "宇宙飛行士", fakeTopic: "ロボット", category: "人物" },
  { normalTopic: "王様", fakeTopic: "サンタ", category: "人物" },
  { normalTopic: "海賊", fakeTopic: "船長", category: "人物" },
  { normalTopic: "シェフ", fakeTopic: "寿司職人", category: "人物" },
  { normalTopic: "アイドル", fakeTopic: "ダンサー", category: "人物" },

  // スポーツ・遊び
  { normalTopic: "サッカー", fakeTopic: "バスケ", category: "スポーツ" },
  { normalTopic: "野球", fakeTopic: "テニス", category: "スポーツ" },

  // 音楽
  { normalTopic: "ピアノ", fakeTopic: "オルガン", category: "音楽" },
  { normalTopic: "ギター", fakeTopic: "バイオリン", category: "音楽" },
  { normalTopic: "太鼓", fakeTopic: "ドラム", category: "音楽" },
  { normalTopic: "笛", fakeTopic: "ラッパ", category: "音楽" },

  // 形・記号
  { normalTopic: "ハート", fakeTopic: "桃", category: "形" },
  { normalTopic: "星", fakeTopic: "ヒトデ", category: "形" },
  { normalTopic: "丸", fakeTopic: "ボール", category: "形" },
  { normalTopic: "四角", fakeTopic: "テレビ", category: "形" },
  { normalTopic: "三角", fakeTopic: "おにぎり", category: "形" },
  { normalTopic: "リボン", fakeTopic: "蝶々", category: "形" },
  { normalTopic: "花", fakeTopic: "風車", category: "自然" },
  { normalTopic: "木", fakeTopic: "ブロッコリー", category: "自然" },
  { normalTopic: "葉っぱ", fakeTopic: "羽", category: "自然" },
  { normalTopic: "炎", fakeTopic: "唐辛子", category: "自然" },

  // ファンタジー
  { normalTopic: "おばけ", fakeTopic: "クラゲ", category: "ファンタジー" },
  { normalTopic: "ドラゴン", fakeTopic: "恐竜", category: "ファンタジー" },
  { normalTopic: "ユニコーン", fakeTopic: "馬", category: "ファンタジー" },
  { normalTopic: "天使", fakeTopic: "妖精", category: "ファンタジー" },
  { normalTopic: "悪魔", fakeTopic: "コウモリ", category: "ファンタジー" },
  { normalTopic: "ゾンビ", fakeTopic: "ミイラ", category: "ファンタジー" },
  { normalTopic: "吸血鬼", fakeTopic: "魔法使い", category: "ファンタジー" },
  { normalTopic: "人魚", fakeTopic: "魚", category: "ファンタジー" },
  { normalTopic: "サンタ", fakeTopic: "雪だるま", category: "ファンタジー" },
  { normalTopic: "鬼", fakeTopic: "レスラー", category: "ファンタジー" }
];

// 旧形式との互換用
window.TOPICS = window.TOPIC_PAIRS;

console.log("TOPIC_PAIRS loaded:", window.TOPIC_PAIRS.length);
