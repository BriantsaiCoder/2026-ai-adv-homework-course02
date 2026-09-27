const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initializeDatabase() {
  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'admin')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      price INTEGER NOT NULL CHECK(price > 0),
      stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
      image_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cart_items (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      user_id TEXT,
      product_id TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_no TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      recipient_name TEXT NOT NULL,
      recipient_email TEXT NOT NULL,
      recipient_address TEXT NOT NULL,
      total_amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'failed')),

      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      product_price INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );
  `);

  // Migration: add merchant_trade_no column for ECPay integration
  try {
    db.exec(`ALTER TABLE orders ADD COLUMN merchant_trade_no TEXT`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Seed data
  seedAdminUser();
  seedProducts();
}

function seedAdminUser() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@hexschool.com';
  const adminPassword = process.env.ADMIN_PASSWORD || '12345678';

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
  if (!existing) {
    const saltRounds = process.env.NODE_ENV === 'test' ? 1 : 10;
    const hash = bcrypt.hashSync(adminPassword, saltRounds);
    db.prepare(
      'INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)'
    ).run(uuidv4(), adminEmail, hash, 'Admin', 'admin');
  }
}

function seedProducts() {
  const count = db.prepare('SELECT COUNT(*) as count FROM products').get();
  if (count.count > 0) return;

  const seedProducts = [
    {
      name: '粉色玫瑰花束',
      description: '精選 20 朵頂級粉色玫瑰，搭配滿天星與尤加利葉，由專業花藝師手工包紮。柔美的粉色花瓣層層綻放，散發淡雅清香，適合生日、紀念日或任何想要表達心意的場合。每束花皆附贈保鮮指南小卡與精美緞帶包裝，讓美麗延續更久。',
      price: 1680,
      stock: 30,
      image_url: 'https://images.unsplash.com/photo-1565279445322-30ab5314ff94?w=400'
    },
    {
      name: '白色百合花禮盒',
      description: '嚴選 6 枝純白香水百合，花朵碩大飽滿，綻放時散發優雅迷人的清甜香氣。搭配翠綠葉材，置於典雅燙金禮盒中，無需額外包裝即可直接送禮。適合開幕誌慶、喬遷祝賀、長輩生日等正式場合，傳遞最體面的祝福心意。',
      price: 1280,
      stock: 25,
      image_url: 'https://images.unsplash.com/photo-1555596112-ca9a1e964e13?w=400'
    },
    {
      name: '繽紛向日葵花束',
      description: '陽光般燦爛的向日葵 10 朵，搭配橙色雛菊、黃金球與新鮮綠葉，組成充滿活力的繽紛花束。向日葵象徵樂觀與希望，適合畢業祝賀、探病慰問或為朋友加油打氣。花束以牛皮紙與麻繩包裝，呈現自然清新的田園風格。',
      price: 980,
      stock: 40,
      image_url: 'https://images.unsplash.com/photo-1543409777-30250849aa3e?w=400'
    },
    {
      name: '紫色鬱金香盆栽',
      description: '荷蘭進口紫色鬱金香球根盆栽，含手工陶瓷花盆，整體高度約 25-30cm。鬱金香花期約 2-3 週，花朵會隨光線開合，姿態優雅迷人。放置於明亮通風處，每 2-3 天澆水一次即可。適合擺放在書桌、窗台或玄關，為空間增添一抹春日浪漫。',
      price: 750,
      stock: 50,
      image_url: 'https://images.unsplash.com/photo-1668170782281-330e987237ba?w=400'
    },
    {
      name: '乾燥花藝術花圈',
      description: '由花藝師手工製作的乾燥花圈，直徑約 30cm，嚴選棉花、兔尾草、星辰花、尤加利葉等天然花材，以大地色系與柔粉色調交織而成。無需澆水照顧，可保存 6 個月以上，是居家門飾、牆面裝飾或拍照道具的絕佳選擇。附贈麻繩掛環，收到即可懸掛。',
      price: 1450,
      stock: 20,
      image_url: 'https://images.unsplash.com/photo-1610467618849-66d363f5aa16?w=400'
    },
    {
      name: '迷你多肉組合盆',
      description: '嚴選 5 種不同品種的迷你多肉植物（含石蓮花、熊童子、虹之玉等），搭配手工水泥圓盆與鋪面小石，整體直徑約 15cm。多肉植物耐旱好照顧，約 7-10 天澆水一次即可，是辦公桌、書架上的療癒小物。適合送給喜歡綠植但忙碌的朋友。',
      price: 580,
      stock: 60,
      image_url: 'https://images.unsplash.com/photo-1763609196518-46f0ee9d5cfd?w=400'
    },
    {
      name: '經典紅玫瑰花束',
      description: '頂級厄瓜多進口紅玫瑰 99 朵，花朵碩大、色澤濃郁飽滿，象徵「長長久久」的永恆愛情。搭配滿天星與進口葉材，以豪華紅色緞帶與高級霧面包裝紙層層包紮，花束直徑超過 50cm，氣勢磅礴。最適合求婚、情人節或重要紀念日，給摯愛最隆重的浪漫告白。',
      price: 3980,
      stock: 15,
      image_url: 'https://images.unsplash.com/photo-1735598564837-dc45391d5ca1?w=400'
    },
    {
      name: '季節鮮花訂閱（月配）',
      description: '每月由駐店花藝師依當季花材精心搭配一束鮮花，直送到府。春天有鬱金香與牡丹，夏天有繡球與向日葵，秋冬則有菊花與聖誕紅等應景花材。每次收花都是驚喜，讓家中四季皆有鮮花相伴。訂閱期間享免運優惠，每月中旬配送，亦可指定暫停月份。',
      price: 890,
      stock: 100,
      image_url: 'https://images.unsplash.com/photo-1610190427750-03e9095f18e3?w=400'
    }
  ];

  const insert = db.prepare(
    'INSERT INTO products (id, name, description, price, stock, image_url) VALUES (?, ?, ?, ?, ?, ?)'
  );

  const insertMany = db.transaction((products) => {
    for (const p of products) {
      insert.run(uuidv4(), p.name, p.description, p.price, p.stock, p.image_url);
    }
  });

  insertMany(seedProducts);
}

initializeDatabase();

module.exports = db;
