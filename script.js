const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreNode = document.getElementById("score");
const bestNode = document.getElementById("best");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayText = document.getElementById("overlay-text");
const difficultyButtons = document.querySelectorAll(".difficulty-button");

const cellSize = 30;
const gridSize = canvas.width / cellSize;
const bestKey = "snake-k-best";
const levelConfig = {
  intern: {
    title: "1: Продавец",
    obstacleCount: 0,
    obstacleTypes: [],
    moneyPerBag: 100,
    moveInterval: 145
  },
  manager: {
    title: "2: Управляющий",
    obstacleCount: 5,
    obstacleTypes: ["store"],
    moneyPerBag: 500,
    moveInterval: 132
  },
  owner: {
    title: "3: ИПэшник",
    obstacleCount: 10,
    obstacleTypes: ["court", "store", "police", "tax", "contract", "camera", "stamp", "safe", "truck", "notice"],
    moneyPerBag: 1000,
    moveInterval: 119
  }
};

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
let obstacles = [];
let currentLevel = "intern";

bestNode.textContent = formatMoney(bestScore);

function formatMoney(value) {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

function getLevelMessage(level) {
  if (level === "manager") {
    return "Собирай мешочки денег и обходи 5 магазинов-помех.";
  }

  if (level === "owner") {
    return "Собирай мешочки денег и обходи 10 препятствий: суд, магазин, полицейского и другие.";
  }

  return "Собирай мешочки денег и не врезайся в стены или в себя.";
}

function updateDifficultyButtons() {
  difficultyButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.level === currentLevel);
  });
}

function resetGame() {
  snake = [
    { x: 8, y: 10 },
    { x: 7, y: 10 },
    { x: 6, y: 10 }
  ];
  direction = { x: 1, y: 0 };
  nextDirection = { x: 1, y: 0 };
  obstacles = spawnObstacles();
  apple = spawnApple();
  score = 0;
  running = false;
  started = false;
  gameOver = false;
  lastTick = 0;
  scoreNode.textContent = formatMoney(0);
  updateDifficultyButtons();
  showOverlay(levelConfig[currentLevel].title, getLevelMessage(currentLevel));
  draw();
}

function spawnApple() {
  while (true) {
    const candidate = {
      x: Math.floor(Math.random() * gridSize),
      y: Math.floor(Math.random() * gridSize)
    };
    const occupied = snake?.some((segment) => segment.x === candidate.x && segment.y === candidate.y);
    const blocked = obstacles.some((obstacle) => obstacle.x === candidate.x && obstacle.y === candidate.y);
    if (!occupied && !blocked) {
      return candidate;
    }
  }
}

function spawnObstacles() {
  const config = levelConfig[currentLevel];
  const nextObstacles = [];

  while (nextObstacles.length < config.obstacleCount) {
    const candidate = {
      x: Math.floor(Math.random() * gridSize),
      y: Math.floor(Math.random() * gridSize),
      type: config.obstacleTypes[nextObstacles.length % config.obstacleTypes.length]
    };

    const onSnake = snake?.some((segment) => segment.x === candidate.x && segment.y === candidate.y);
    const duplicate = nextObstacles.some((obstacle) => obstacle.x === candidate.x && obstacle.y === candidate.y);
    const tooCloseToStart = candidate.x >= 4 && candidate.x <= 11 && candidate.y >= 7 && candidate.y <= 13;

    if (!onSnake && !duplicate && !tooCloseToStart) {
      nextObstacles.push(candidate);
    }
  }

  return nextObstacles;
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
  const hitObstacle = obstacles.some((obstacle) => obstacle.x === newHead.x && obstacle.y === newHead.y);

  if (hitWall || hitSelf || hitObstacle) {
    endGame();
    draw();
    return;
  }

  snake.unshift(newHead);

  if (newHead.x === apple.x && newHead.y === apple.y) {
    score += levelConfig[currentLevel].moneyPerBag;
    scoreNode.textContent = formatMoney(score);
    if (score > bestScore) {
      bestScore = score;
      localStorage.setItem(bestKey, String(bestScore));
      bestNode.textContent = formatMoney(bestScore);
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

function drawMoneyBag(itemX, itemY) {
  const x = itemX * cellSize;
  const y = itemY * cellSize;

  ctx.fillStyle = "#9b5d2e";
  roundRect(ctx, x + 5, y + 8, 20, 18, 9);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(x + 9.5, y + 8);
  ctx.lineTo(x + 15, y + 2.5);
  ctx.lineTo(x + 20.5, y + 8);
  ctx.closePath();
  ctx.fillStyle = "#c9894d";
  ctx.fill();

  ctx.fillStyle = "#6d3d16";
  ctx.fillRect(x + 9.5, y + 7, 11, 3.3);

  ctx.fillStyle = "#ffd447";
  ctx.font = "bold 12px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("$", x + 15, y + 18);
}

function drawStore(x, y) {
  ctx.fillStyle = "#f4efe7";
  roundRect(ctx, x + 4, y + 8, 22, 16, 4);
  ctx.fill();
  ctx.fillStyle = "#c7472f";
  ctx.fillRect(x + 4, y + 8, 22, 5);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x + 8, y + 16, 5, 8);
  ctx.fillRect(x + 17, y + 16, 5, 8);
}

function drawCourt(x, y) {
  ctx.fillStyle = "#d8d0c4";
  ctx.fillRect(x + 6, y + 10, 18, 2);
  ctx.fillRect(x + 8, y + 12, 3, 10);
  ctx.fillRect(x + 14, y + 12, 3, 10);
  ctx.fillRect(x + 20, y + 12, 3, 10);
  ctx.beginPath();
  ctx.moveTo(x + 5, y + 10);
  ctx.lineTo(x + 15, y + 5);
  ctx.lineTo(x + 25, y + 10);
  ctx.closePath();
  ctx.fill();
}

function drawPolice(x, y) {
  ctx.fillStyle = "#1f5ea8";
  roundRect(ctx, x + 6, y + 10, 18, 12, 6);
  ctx.fill();
  ctx.fillStyle = "#ffd447";
  ctx.fillRect(x + 10, y + 14, 10, 4);
  ctx.fillStyle = "#234";
  ctx.fillRect(x + 9, y + 8, 12, 3);
}

function drawTax(x, y) {
  ctx.fillStyle = "#e7f1ff";
  roundRect(ctx, x + 7, y + 6, 16, 18, 4);
  ctx.fill();
  ctx.fillStyle = "#3d6ca8";
  ctx.fillRect(x + 10, y + 10, 10, 2);
  ctx.fillRect(x + 10, y + 14, 8, 2);
  ctx.fillRect(x + 10, y + 18, 6, 2);
}

function drawContract(x, y) {
  ctx.fillStyle = "#fff7e3";
  roundRect(ctx, x + 8, y + 6, 14, 18, 3);
  ctx.fill();
  ctx.fillStyle = "#b9862f";
  ctx.beginPath();
  ctx.arc(x + 15, y + 22, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x + 11, y + 11, 8, 2);
}

function drawCamera(x, y) {
  ctx.fillStyle = "#4e5b65";
  roundRect(ctx, x + 6, y + 10, 18, 12, 4);
  ctx.fill();
  ctx.fillStyle = "#93b7d8";
  ctx.beginPath();
  ctx.arc(x + 15, y + 16, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawStamp(x, y) {
  ctx.fillStyle = "#7c4dff";
  roundRect(ctx, x + 9, y + 8, 12, 8, 4);
  ctx.fill();
  ctx.fillStyle = "#5a35c6";
  ctx.fillRect(x + 11, y + 16, 8, 6);
}

function drawSafe(x, y) {
  ctx.fillStyle = "#64707a";
  roundRect(ctx, x + 7, y + 7, 16, 16, 3);
  ctx.fill();
  ctx.fillStyle = "#d7dee5";
  ctx.beginPath();
  ctx.arc(x + 15, y + 15, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawTruck(x, y) {
  ctx.fillStyle = "#ff9f1c";
  ctx.fillRect(x + 6, y + 11, 10, 8);
  ctx.fillRect(x + 16, y + 13, 8, 6);
  ctx.fillStyle = "#3f3f46";
  ctx.beginPath();
  ctx.arc(x + 11, y + 21, 2.5, 0, Math.PI * 2);
  ctx.arc(x + 21, y + 21, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawNotice(x, y) {
  ctx.fillStyle = "#ffe37b";
  roundRect(ctx, x + 8, y + 7, 14, 18, 3);
  ctx.fill();
  ctx.fillStyle = "#8d5c00";
  ctx.fillRect(x + 14, y + 11, 2, 7);
  ctx.fillRect(x + 14, y + 20, 2, 2);
}

function drawObstacle(obstacle) {
  const x = obstacle.x * cellSize;
  const y = obstacle.y * cellSize;

  ctx.save();
  ctx.fillStyle = "#00000010";
  ctx.beginPath();
  ctx.arc(x + 15, y + 25, 8, 0, Math.PI * 2);
  ctx.fill();

  if (obstacle.type === "store") {
    drawStore(x, y);
  } else if (obstacle.type === "court") {
    drawCourt(x, y);
  } else if (obstacle.type === "police") {
    drawPolice(x, y);
  } else if (obstacle.type === "tax") {
    drawTax(x, y);
  } else if (obstacle.type === "contract") {
    drawContract(x, y);
  } else if (obstacle.type === "camera") {
    drawCamera(x, y);
  } else if (obstacle.type === "stamp") {
    drawStamp(x, y);
  } else if (obstacle.type === "safe") {
    drawSafe(x, y);
  } else if (obstacle.type === "truck") {
    drawTruck(x, y);
  } else if (obstacle.type === "notice") {
    drawNotice(x, y);
  }

  ctx.restore();
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
  obstacles.forEach(drawObstacle);
  drawMoneyBag(apple.x, apple.y);
  snake.forEach(drawSegment);
}

function loop(timestamp) {
  if (!running) {
    return;
  }

  if (!lastTick) {
    lastTick = timestamp;
  }

  if (timestamp - lastTick >= levelConfig[currentLevel].moveInterval) {
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

difficultyButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currentLevel = button.dataset.level;
    resetGame();
  });
});

headImage.addEventListener("load", draw);

resetGame();
