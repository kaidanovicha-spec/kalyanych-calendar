const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreNode = document.getElementById("score");
const bestNode = document.getElementById("best");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayText = document.getElementById("overlay-text");

const cellSize = 30;
const gridSize = canvas.width / cellSize;
const moveInterval = 120;
const bestKey = "snake-k-best";

const headImage = new Image();
headImage.src = "k-logo.svg";

let snake;
let direction;
let nextDirection;
let apple;
let score;
let bestScore = Number(localStorage.getItem(bestKey) || 0);
let running = false;
let started = false;
let gameOver = false;
let lastTick = 0;

bestNode.textContent = String(bestScore);

function resetGame() {
  snake = [
    { x: 8, y: 10 },
    { x: 7, y: 10 },
    { x: 6, y: 10 }
  ];
  direction = { x: 1, y: 0 };
  nextDirection = { x: 1, y: 0 };
  apple = spawnApple();
  score = 0;
  running = false;
  started = false;
  gameOver = false;
  lastTick = 0;
  scoreNode.textContent = "0";
  showOverlay("Нажми любую стрелку", "Собирай мешочки денег и не врезайся в стены или в себя.");
  draw();
}

function spawnApple() {
  while (true) {
    const candidate = {
      x: Math.floor(Math.random() * gridSize),
      y: Math.floor(Math.random() * gridSize)
    };
    const occupied = snake?.some((segment) => segment.x === candidate.x && segment.y === candidate.y);
    if (!occupied) {
      return candidate;
    }
  }
}

function showOverlay(title, text) {
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  overlay.classList.remove("hidden");
}

function hideOverlay() {
  overlay.classList.add("hidden");
}

function setDirection(x, y) {
  if (direction.x === -x && direction.y === -y) {
    return;
  }

  nextDirection = { x, y };

  if (!started) {
    started = true;
    running = true;
    gameOver = false;
    hideOverlay();
    requestAnimationFrame(loop);
  }
}

function togglePause() {
  if (!started || gameOver) {
    return;
  }

  running = !running;
  if (running) {
    hideOverlay();
    requestAnimationFrame(loop);
  } else {
    showOverlay("Пауза", "Нажми пробел, чтобы продолжить.");
  }
}

function endGame() {
  running = false;
  gameOver = true;
  showOverlay("Игра окончена", "Нажми Enter, чтобы начать заново.");
}

function update() {
  direction = nextDirection;
  const head = snake[0];
  const newHead = {
    x: head.x + direction.x,
    y: head.y + direction.y
  };

  const hitWall =
    newHead.x < 0 ||
    newHead.y < 0 ||
    newHead.x >= gridSize ||
    newHead.y >= gridSize;

  const hitSelf = snake.some((segment) => segment.x === newHead.x && segment.y === newHead.y);

  if (hitWall || hitSelf) {
    endGame();
    draw();
    return;
  }

  snake.unshift(newHead);

  if (newHead.x === apple.x && newHead.y === apple.y) {
    score += 1;
    scoreNode.textContent = String(score);
    if (score > bestScore) {
      bestScore = score;
      localStorage.setItem(bestKey, String(bestScore));
      bestNode.textContent = String(bestScore);
    }
    apple = spawnApple();
  } else {
    snake.pop();
  }

  draw();
}

function drawBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawApple() {
  const x = apple.x * cellSize;
  const y = apple.y * cellSize;

  ctx.fillStyle = "#9b5d2e";
  roundRect(ctx, x + 6, y + 9, 18, 16, 8);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(x + 10, y + 9);
  ctx.lineTo(x + 15, y + 4);
  ctx.lineTo(x + 20, y + 9);
  ctx.closePath();
  ctx.fillStyle = "#c9894d";
  ctx.fill();

  ctx.fillStyle = "#6d3d16";
  ctx.fillRect(x + 10, y + 8, 10, 3);

  ctx.fillStyle = "#ffd447";
  ctx.font = "bold 12px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("$", x + 15, y + 18);
}

function getHeadRotation(segment) {
  const lookX = apple.x - segment.x;
  const lookY = apple.y - segment.y;

  if (lookX === 0 && lookY === 0) {
    return Math.atan2(direction.y, direction.x);
  }

  // The source SVG already faces right, so the flat side stays at the back.
  return Math.atan2(lookY, lookX);
}

function drawSegment(segment, index) {
  const x = segment.x * cellSize;
  const y = segment.y * cellSize;
  const size = cellSize - 4;

  if (index === 0) {
    ctx.save();
    ctx.translate(x + cellSize / 2, y + cellSize / 2);
    ctx.rotate(getHeadRotation(segment));

    if (headImage.complete) {
      ctx.drawImage(headImage, -size / 2, -size / 2, size, size);
    } else {
      ctx.fillStyle = "#ff7a00";
      ctx.fillRect(-size / 2, -size / 2, size, size);
      ctx.fillStyle = "#000";
      ctx.font = "bold 18px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("K", 0, 1);
    }
    ctx.restore();
    return;
  }

  ctx.fillStyle = index % 2 === 0 ? "#1f8f54" : "#16673c";
  roundRect(ctx, x + 2, y + 2, size, size, 9);
  ctx.fill();
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function draw() {
  drawBoard();
  drawApple();
  snake.forEach(drawSegment);
}

function loop(timestamp) {
  if (!running) {
    return;
  }

  if (!lastTick) {
    lastTick = timestamp;
  }

  if (timestamp - lastTick >= moveInterval) {
    lastTick = timestamp;
    update();
  }

  if (running) {
    requestAnimationFrame(loop);
  }
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();

  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "enter", "w", "a", "s", "d"].includes(key)) {
    event.preventDefault();
  }

  if (key === "arrowup" || key === "w") {
    setDirection(0, -1);
  } else if (key === "arrowdown" || key === "s") {
    setDirection(0, 1);
  } else if (key === "arrowleft" || key === "a") {
    setDirection(-1, 0);
  } else if (key === "arrowright" || key === "d") {
    setDirection(1, 0);
  } else if (key === " ") {
    togglePause();
  } else if (key === "enter") {
    resetGame();
  }
});

headImage.addEventListener("load", draw);

resetGame();
