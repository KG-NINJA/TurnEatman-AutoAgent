// ターンパックマン - ターン制2D迷路ゲーム
// プレイヤーが動いた時だけ敵も動く

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;

// マップ設定（シンプルなパックマン風迷路 28x31）
const MAP_W = 36;
const MAP_H = 41;
const TILE = 24;
// 0: 通路, 1: 壁, 2: ドット, 3: パワーエサ
// 必ずスタート地点と敵の周囲を通路に修正（fixList）
const fixList = [
  [2,2],[2,3],[3,2], // プレイヤー周囲（[2,2]開始）
  [1,MAP_W-2],[2,MAP_W-2],[1,MAP_W-3], // 右上敵周囲
  [MAP_H-2,1],[MAP_H-3,1],[MAP_H-2,2], // 左下敵周囲
  [MAP_H-2,MAP_W-2],[MAP_H-3,MAP_W-2],[MAP_H-2,MAP_W-3] // 右下敵周囲
];
let map = generatePacmanMaze();
console.log('map', map);

// パックマン風迷路自動生成
function generatePacmanMaze() {
  const map = [];
  // まずは全て壁で初期化
  for(let y=0; y<MAP_H; y++) {
    map[y] = [];
    for(let x=0; x<MAP_W; x++) {
      map[y][x] = 1;
    }
  }
  // 通路生成（左右対称・中央空間あり）
  for(let y=1; y<MAP_H-1; y++) {
    for(let x=1; x<Math.ceil(MAP_W/2); x++) {
      // 外周以外で通路を作る（中央空間や部屋っぽさも）
      let isRoom = (
        (y >= 13 && y <= 17 && x >= 11 && x <= 16) // 中央の部屋
      );
      let isCorridor = (
        y % 2 === 1 || x % 2 === 1 || (y === 15) // 通路を多めに
      );
      if(isRoom || isCorridor) {
        map[y][x] = 0;
        map[y][MAP_W-1-x] = 0; // 左右対称
      }
    }
  }
  // ドット配置
  for(let y=1; y<MAP_H-1; y++) {
    for(let x=1; x<MAP_W-1; x++) {
      if(map[y][x] === 0) map[y][x] = 2;
    }
  }
  // パワーエサ（四隅）
  map[1][1] = 3;
  map[1][MAP_W-2] = 3;
  map[MAP_H-2][1] = 3;
  map[MAP_H-2][MAP_W-2] = 3;
  // fixList適用（ただし四隅はパワーエサのまま）
  const corners = [[1,1],[1,MAP_W-2],[MAP_H-2,1],[MAP_H-2,MAP_W-2]];
  for(const [y,x] of fixList){
    // 四隅はパワーエサ、他はドット
    const isCorner = corners.some(([cy,cx]) => cy===y && cx===x);
    map[y][x] = isCorner ? 3 : 2;
  }
  return map;
}



// プレイヤー・敵
const player = { x: 2, y: 2, dir: 0, nextDir: 0, alive: true };
let gameOver = false;
let powerCount = 0; // パワー状態の残りターン
// 敵モンスターは色と性格を持つ
const monsters = [
  { x: MAP_W-2, y: 1, dir: 2, alive: true, respawn: 0, initX: MAP_W-2, initY: 1, color: '#ff0000', type: 'aggressive' }, // 右上: 追跡型
  { x: 1, y: MAP_H-2, dir: 1, alive: true, respawn: 0, initX: 1, initY: MAP_H-2, color: '#00ff00', type: 'coward' },     // 左下: 逃避型
  { x: MAP_W-2, y: MAP_H-2, dir: 3, alive: true, respawn: 0, initX: MAP_W-2, initY: MAP_H-2, color: '#0000ff', type: 'random' },  // 右下: ランダム型
];
gameOver = false;

// --- ファンファーレ再生 ---
function fanfare() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523, 659, 784, 1046, 784, 1046]; // C5, E5, G5, C6, G5, C6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.value = 0.12;
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i*0.13);
      osc.stop(ctx.currentTime + i*0.13 + 0.12);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    });
  } catch(e) {}
}
// --- 悲しいファンファーレ（ゲームオーバー用） ---
function playSadFanfare() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [784, 659, 523, 392, 261]; // G5, E5, C5, G4, C4（下降）
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.value = 0.14;
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i*0.18);
      osc.stop(ctx.currentTime + i*0.18 + 0.16);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    });
  } catch(e) {}
}

// --- パワーエサ取得時のコイン音 ---
function playCoinSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    // マリオのコイン風: G6 → E7 の2音
    const notes = [1568, 2637];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.value = 0.13 - i*0.03;
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i*0.06);
      osc.stop(ctx.currentTime + i*0.06 + 0.05);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    });
  } catch(e) {}
}
// --- Bright sound when eating a monster ---
function playEatMonsterSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Bright, happy 3-note melody (E6-G6-C7)
    const notes = [1318.5, 1568, 2093];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.value = 0.13 - i*0.03;
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i*0.07);
      osc.stop(ctx.currentTime + i*0.07 + 0.08);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    });
  } catch(e) {}
}

// --- 実況読み上げ（TTS） ---
// --- iOS用 TTSアンロックボタン処理 ---
document.addEventListener('DOMContentLoaded', () => {
  const unlockBtn = document.getElementById('tts-unlock-btn');
  if (unlockBtn) {
    unlockBtn.addEventListener('click', () => {
      if (window.speechSynthesis) {
        const u = new SpeechSynthesisUtterance('');
        u.lang = 'ja-JP';
        window.speechSynthesis.speak(u);
      }
      unlockBtn.disabled = true;
      unlockBtn.style.opacity = 0.5;
      setTimeout(() => {
        const cont = document.getElementById('tts-unlock-container');
        if (cont) cont.style.display = 'none';
      }, 600);
    }, { once: true });
  }
  fanfare();
  update();
  gameLoop();
});

// --- 実況読み上げ（TTS）・キュー制御付き ---
let narrationQueue = [];
let narrationSpeaking = false;
function narrateSituation(text) {
  if (!window.speechSynthesis) return;
  // 言語自動判定: 日本語文字が含まれていればja-JP、なければen-US
  const lang = /[\u3040-\u30FF\u4E00-\u9FFF]/.test(text) ? 'ja-JP' : 'en-US';

  // キューに積んで、再生トリガーを一元管理
  narrationQueue.push({text, lang});
  trySpeakNarration();
}

function trySpeakNarration() {
  if (narrationSpeaking || window.speechSynthesis.speaking) return;
  if (narrationQueue.length === 0) return;
  narrationSpeaking = true;
  const {text, lang} = narrationQueue.shift();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang;
  utter.rate = 1.0;
  utter.onend = () => {
    narrationSpeaking = false;
    setTimeout(trySpeakNarration, 50);
  };
  utter.onerror = () => {
    narrationSpeaking = false;
    setTimeout(trySpeakNarration, 50);
  };
  window.speechSynthesis.speak(utter);
}


// --- 実況条件・セリフ生成 ---
function getDramaticNarration({power, close, adjacent, gameover, clear}) {
  if(gameover) return "Oh no! Eat-Man has fallen here. Game Over!";
  if(clear) return "Yes! Eat-Man has eaten all the dots! Stage Clear!";
  if(power && close) {
    const lines = [
      "Hey, aren't you running away? Now it's payback time!",
      "Are you scared, monster? Here I come!",
      "Come at me! Now it's your turn to run!",
      "Full power! Now you run for your life!",
      "Tremble and wait, monster!",
      "This is my chance to chomp you down!",
      "I've got the power, time to turn the tables!",
      "Nowhere to hide, ghost!",
      "I'm shining! Time for revenge!",
      "Run if you can, I'm unstoppable!"
    ];
    return lines[Math.floor(Math.random()*lines.length)];
  }
  if(adjacent) {
    const lines = [
      "Danger! An enemy is right next to you! This is a critical situation!",
      "Watch out! It's right beside you!",
      "Woah, there's one breathing down your neck!",
      "Yikes! A ghost is within arm's reach!",
      "Careful! It's right there next to you!"
    ];
    return lines[Math.floor(Math.random()*lines.length)];
  }
  if(close) {
    const lines = [
      "An enemy is getting closer! Eat-Man, run! Tension is rising!",
      "Oh no, the enemy is closing in! What will you do, Eat-Man!?",
      "Watch out! You can sense the enemy nearby!",
      "Eat-Man, you're in trouble! The enemy is right in front of you!",
      "My heart is pounding... The enemy is near! This is dangerous!danger,danger!",
      "The ghost is gaining on you, hurry!",
      "It's getting hot! That ghost is close!",
      "Just a few steps away! Stay sharp!",
      "They're coming fast! Keep moving!"
    ];
    return lines[Math.floor(Math.random()*lines.length)];
  }
  if(power) {
    const lines = [
      "Power pellet acquired! Now's your chance to fight back, Eat-Man!",
      "Feel the power surge! Let's gobble them up!",
      "Power mode on! Time to scare those ghosts!",
      "I'm invincible for now! Go get 'em!"
    ];
    return lines[Math.floor(Math.random()*lines.length)];
  }
  // Chill lines (when no enemy is close, 80% chance)
  if(!power && !close && !adjacent && Math.random() < 0.8) {
    const lines = [
      "Heh, this is easy.",
      "Still going strong!",
      "I'll eat them all at this pace!",
      "I'm not afraid of any ghost!",
      "Eat-Man is on fire!",
      "Nice and quiet... for now.",
      "Cruising through the maze!",
      "Chomp chomp, feeling good!",
      "Nothing can stop me today!"
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  }
  return null;
}



// 入力管理
const keys = {};
window.addEventListener('keydown', e => {
  // カーソルキーのときはスクロール抑止
  if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)) {
    e.preventDefault();
  }
  keys[e.key] = true;
});
document.addEventListener('keydown', e => {
  if(gameOver) return;
  let dir = -1;
  if(e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') dir = 0;
  else if(e.key === 'ArrowDown'  || e.key === 's' || e.key === 'S') dir = 1;
  else if(e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') dir = 2;
  else if(e.key === 'ArrowUp'    || e.key === 'w' || e.key === 'W') dir = 3;
  if(dir !== -1) {
    const moved = tryMove(player, dir);
    if(moved) update();
  }
});
// バーチャルタッチ十字キー対応
function fireKeyEvent(key) {
  const event = new KeyboardEvent('keydown', {key});
  document.dispatchEvent(event);
}
document.getElementById('tc-up')?.addEventListener('touchstart', e => { e.preventDefault(); fireKeyEvent('ArrowUp'); });
document.getElementById('tc-down')?.addEventListener('touchstart', e => { e.preventDefault(); fireKeyEvent('ArrowDown'); });
document.getElementById('tc-left')?.addEventListener('touchstart', e => { e.preventDefault(); fireKeyEvent('ArrowLeft'); });
document.getElementById('tc-right')?.addEventListener('touchstart', e => { e.preventDefault(); fireKeyEvent('ArrowRight'); });
document.getElementById('tc-up')?.addEventListener('mousedown', e => { e.preventDefault(); fireKeyEvent('ArrowUp'); });
document.getElementById('tc-down')?.addEventListener('mousedown', e => { e.preventDefault(); fireKeyEvent('ArrowDown'); });
document.getElementById('tc-left')?.addEventListener('mousedown', e => { e.preventDefault(); fireKeyEvent('ArrowLeft'); });
document.getElementById('tc-right')?.addEventListener('mousedown', e => { e.preventDefault(); fireKeyEvent('ArrowRight'); });
document.addEventListener('keyup', e => {
  keys[e.key] = false;
  if(e.key === 'ArrowRight' || e.keyCode === 39) keys['ArrowRight'] = false;
  if(e.key === 'ArrowDown'  || e.keyCode === 40) keys['ArrowDown']  = false;
  if(e.key === 'ArrowLeft'  || e.keyCode === 37) keys['ArrowLeft']  = false;
  if(e.key === 'ArrowUp'    || e.keyCode === 38) keys['ArrowUp']    = false;
});

function canMove(x, y) {
  return map[y] && map[y][x] !== 1;
}

function tryMove(obj, dir) {
  const dx = [1,0,-1,0], dy = [0,1,0,-1];
  const nx = obj.x + dx[dir], ny = obj.y + dy[dir];
  if (canMove(nx, ny)) {
    obj.x = nx; obj.y = ny;
    return true;
  }
  return false;
}

function update() {
  if (gameOver) return; // ゲームオーバー時は何もしない
  // プレイヤーが動いたときだけターン進行
  // 衝突判定（敵の移動前にもチェック）
  for(const m of monsters) {
    if(!m.alive) continue;
    if(player.x === m.x && player.y === m.y) {
      if(powerCount > 0) {
        m.alive = false;
        m.respawn = 10;
        playEatMonsterSound();
      } else {
        document.getElementById('ui').textContent = 'Game Over';
        narrateSituation(getDramaticNarration({gameover:true}));
        gameOver = true;
        return;
      }
    }
  }
  let close = false, adjacent = false;
  for(const m of monsters) {
    if(!m.alive) continue;
    const dist = Math.abs(player.x - m.x) + Math.abs(player.y - m.y);
    if(dist === 1) adjacent = true;
    else if(dist === 2) close = true;
  }
  const narration = getDramaticNarration({power: powerCount > 0, close, adjacent});
  if(narration) narrateSituation(narration);
  // プレイヤーがドットを取ったら消す
  if(map[player.y][player.x] === 2) {
    map[player.y][player.x] = 0;
  }
  // パワーエサ取得
  if(map[player.y][player.x] === 3) {
    map[player.y][player.x] = 0;
    powerCount = 20;
    playCoinSound();
  }
  // パワー状態カウント減少
  if(powerCount > 0) powerCount--;
  // 敵の復活カウント
  for(const m of monsters) {
    if(!m.alive && m.respawn > 0) m.respawn--;
    if(!m.alive && m.respawn === 0) {
      m.x = m.initX; m.y = m.initY; m.alive = true; // 各自の初期位置で復活
    }
  }
  // すべてのドットが消えたらステージクリア
  let dotsLeft = 0;
  for(let y=0; y<MAP_H; y++) for(let x=0; x<MAP_W; x++) {
    if(map[y][x] === 2) dotsLeft++;
  }
  if(dotsLeft === 0) {
    fanfare();
    setTimeout(() => {
      document.getElementById('ui').innerHTML = '<div style="margin-top:40px;font-size:2em;color:#FFD700;">ステージクリア！<br>30秒後に次のステージ<br><a href="https://buymeacoffee.com/kgninja" target="_blank" style="color:#00c;text-decoration:underline;font-size:1.2em;">https://buymeacoffee.com/kgninja</a></div>';
      gameOver = true;
      // 新しい迷路を生成してリセット
      map = generatePacmanMaze();
      // プレイヤーと敵の初期化
      player.x = 2; player.y = 2; player.dir = 0; player.nextDir = 0; player.alive = true;
      powerCount = 0;
      monsters[0].x = MAP_W-2; monsters[0].y = 1; monsters[0].alive = true; monsters[0].respawn = 0;
      monsters[1].x = 1; monsters[1].y = MAP_H-2; monsters[1].alive = true; monsters[1].respawn = 0;
      monsters[2].x = MAP_W-2; monsters[2].y = MAP_H-2; monsters[2].alive = true; monsters[2].respawn = 0;
      gameOver = false;
    }, 30000);
    return;
  }
  document.getElementById('ui').textContent = '(矢印キーまたはwasdで操作)';
  // 衝突判定（自機と敵）
  for(const m of monsters) {
    if(!m.alive) continue;
    if(player.x === m.x && player.y === m.y) {
      if(powerCount > 0) {
        m.alive = false;
        m.respawn = 10;
      } else {
        document.getElementById('ui').textContent = 'ゲームオーバー';
        playSadFanfare();
        gameOver = true;
        return;
      }
    }
  }
  // 敵もターンで動く（色ごとの性格で行動）
  for(const m of monsters) {
    if(!m.alive) continue; // 消えてる敵は動かさない
    const dx = [1,0,-1,0], dy = [0,1,0,-1];
    let dirs = [];
    if(m.type === 'random') {
      for(let d=0; d<4; d++) {
        let nx = m.x + dx[d], ny = m.y + dy[d];
        if(canMove(nx, ny)) dirs.push(d);
      }
    } else {
      let targetDist = (m.type === 'aggressive') ? Infinity : -Infinity;
      let cmp = (m.type === 'aggressive') ? (a,b)=>a<b : (a,b)=>a>b;
      for(let d=0; d<4; d++) {
        let nx = m.x + dx[d], ny = m.y + dy[d];
        if(canMove(nx, ny)) {
          let dist = Math.abs(nx - player.x) + Math.abs(ny - player.y);
          if(cmp(dist, targetDist)) {
            targetDist = dist;
            dirs = [d];
          } else if(dist === targetDist) {
            dirs.push(d);
          }
        }
      }
    }
    if(dirs.length) m.dir = dirs[Math.floor(Math.random()*dirs.length)];
    tryMove(m, m.dir);
  }
  // 敵の移動後にも衝突判定（自機と敵）
  for(const m of monsters) {
    if(!m.alive) continue;
    if(player.x === m.x && player.y === m.y) {
      if(powerCount > 0) {
        m.alive = false;
        m.respawn = 10;
        playEatMonsterSound();
      } else {
        document.getElementById('ui').textContent = 'Game Over';
        narrateSituation(getDramaticNarration({gameover:true}));
        gameOver = true;
        return;
      }
    }
  }
  // 入力を一度消す（ターン制なので連続移動防止）
  keys['ArrowRight'] = keys['ArrowDown'] = keys['ArrowLeft'] = keys['ArrowUp'] = false;
}

function draw() {
  ctx.clearRect(0,0,W,H);
  // デバッグ: draw呼び出しとプレイヤー座標/map確認
  // console.log('draw called', map[1][1], player.x, player.y);
  // マップ
  for(let y=0; y<MAP_H; y++) for(let x=0; x<MAP_W; x++) {
    if(!map[y]) continue;
    if(map[y][x] === 1) {
      ctx.fillStyle = '#4488ff';
      ctx.fillRect(x*TILE, y*TILE, TILE, TILE);
    } else if(map[y][x] === 2) {
      ctx.fillStyle = '#ffeb3b';
      ctx.beginPath();
      ctx.arc(x*TILE+TILE/2, y*TILE+TILE/2, 2, 0, Math.PI*2);
      ctx.fill();
    } else if(map[y][x] === 3) {
      ctx.fillStyle = '#00e6e6';
      ctx.beginPath();
      ctx.arc(x*TILE+TILE/2, y*TILE+TILE/2, 5, 0, Math.PI*2);
      ctx.fill();
    }
  }
  // プレイヤー（パワー状態なら紫、通常は黄色）
  ctx.fillStyle = (powerCount > 0) ? '#e040ff' : '#ffe066';
  ctx.beginPath();
  ctx.arc(player.x*TILE+TILE/2, player.y*TILE+TILE/2, 10, 0, Math.PI*2);
  ctx.fill();
  // モンスター
  for(const m of monsters) {
    if(!m.alive) continue;
    ctx.fillStyle = m.color;
    ctx.beginPath();
    ctx.arc(m.x*TILE+TILE/2, m.y*TILE+TILE/2, 10, 0, Math.PI*2);
    ctx.fill();
  }
  // パワー状態表示（画面下）
  if(powerCount > 0) {
    ctx.fillStyle = '#18ffff';
    ctx.font = '16px sans-serif';
    ctx.fillText('POWER: ' + powerCount, 10, H-10);
  }
  // パワー残りターンを画面中央に大きく表示
  const timerDiv = document.getElementById('power-timer');
  if (timerDiv) {
    if (powerCount > 0) {
      timerDiv.textContent = powerCount;
      timerDiv.style.opacity = 1;
    } else {
      timerDiv.textContent = '';
      timerDiv.style.opacity = 0;
    }
  }
}


function gameLoop() {
  draw();
  requestAnimationFrame(gameLoop);
}
