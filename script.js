const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreNode = document.getElementById("score");
const bestNode = document.getElementById("best");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayText = document.getElementById("overlay-text");
const overlayActions = document.getElementById("overlay-actions");
const payBribeButton = document.getElementById("pay-bribe-button");
const restartFromBribeButton = document.getElementById("restart-from-bribe-button");
const difficultyButtons = document.querySelectorAll(".difficulty-button");
const buyLeftFieldButton = document.getElementById("buy-left-field-button");
const buyRightFieldButton = document.getElementById("buy-right-field-button");
const buySlowdownButton = document.getElementById("buy-slowdown-button");
const buyFieldNote = document.getElementById("buy-field-note");
const collectedMoneyNode = document.getElementById("collected-money");
const beerTimerNode = document.getElementById("beer-timer");

const cellSize = 30;
const gridColumns = canvas.width / cellSize;
const gridRows = canvas.height / cellSize;
const firstFieldUnlockCost = 25000;
const secondFieldUnlockCost = 50000;
const slowdownCost = 10000;
const bribeCost = 15000;
const sideZoneColumns = 5;
const beerDurationMs = 60_000;
const beerMoneyStep = 15_000;
const levelConfig = {
  intern: {
    title: "1: Продавец",
    obstacleCount: 0,
    obstacleTypes: [],
    moneyPerBag: 100,
    moveInterval: 145,
    moneyBagCount: 1,
    beerSlots: 1,
    beerMode: "milestone"
  },
  manager: {
    title: "2: Управляющий",
    obstacleCount: 5,
    obstacleTypes: ["🏬"],
    moneyPerBag: 500,
    moveInterval: 132,
    moneyBagCount: 1,
    beerSlots: 1,
    beerMode: "milestone"
  },
  owner: {
    title: "3: ИПэшник",
    obstacleCount: 10,
    obstacleTypes: ["👮🏻‍♀️", "🕵🏻", "👩🏻‍🎓", "🧑🏻‍⚖️", "🥷🏻", "🔥", "☄️", "🌪️", "❄️", "🏬"],
    moneyPerBag: 1000,
    moveInterval: 119,
    moneyBagCount: 1,
    beerSlots: 1,
    beerMode: "milestone"
  },
  tax: {
    title: "4: Налоговая",
    obstacleCount: 0,
    obstacleTypes: [],
    moneyPerBag: 5000,
    moveInterval: 145,
    moneyBagCount: 10,
    beerSlots: 3,
    beerMode: "always"
  }
};

const headImage = new Image();
headImage.src = "k-logo.svg";

let snake;
let direction;
let nextDirection;
let moneyBags = [];
let score;
let bestScore = 0;
let running = false;
let started = false;
let gameOver = false;
let lastTick = 0;
let obstacles = [];
let currentLevel = "intern";
let unlockedSides = { left: false, right: false };
let beers = [];
let slowUntil = 0;
let collectedMoney = 0;
let nextBeerMilestone = beerMoneyStep;
let purchasedSlowdownMultiplier = 1;
let awaitingBribeDecision = false;

bestNode.textContent = formatMoney(bestScore);
collectedMoneyNode.textContent = formatMoney(0);
updateBeerTimer();

function formatMoney(value) {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

function getBestKey(level) {
  return `snake-k-best-${level}`;
}

function loadBestScore(level) {
  return Number(localStorage.getItem(getBestKey(level)) || 0);
}

function saveBestScore(level, value) {
  localStorage.setItem(getBestKey(level), String(value));
}

function getLevelMessage(level) {
  if (level === "manager") {
    return "Собирай мешочки денег, обходи 5 магазинов и лови 🍺 для временного замедления.";
  }

  if (level === "owner") {
    return "Собирай мешочки денег, обходи 10 эмодзи-помех и лови 🍺 для временного замедления.";
  }

  if (level === "tax") {
    return "Налоговая просто собирает деньги: сразу 10 мешочков и 3 пива на поле, без препятствий.";
  }

  return "Собирай мешочки денег, бери 🍺 для передышки и не врезайся в стены или в себя.";
}

function getActiveBounds() {
  return {
    minX: unlockedSides.left ? 0 : sideZoneColumns,
    maxX: unlockedSides.right ? gridColumns - 1 : gridColumns - sideZoneColumns - 1,
    minY: 0,
    maxY: gridRows - 1
  };
}

function getUnlockedFieldsCount() {
  return Number(unlockedSides.left) + Number(unlockedSides.right);
}

function getNextFieldUnlockCost() {
  return getUnlockedFieldsCount() === 0 ? firstFieldUnlockCost : secondFieldUnlockCost;
}

function canUnlockField(side) {
  return !unlockedSides[side] && score >= getNextFieldUnlockCost();
}

function canBuySlowdown() {
  return !running && started && !gameOver && score >= slowdownCost;
}

function updateFieldPurchaseUI() {
  const canBuyLeft = !running && started && !gameOver && canUnlockField("left");
  const canBuyRight = !running && started && !gameOver && canUnlockField("right");
  const canBuySlow = canBuySlowdown();
  const unlockCost = formatMoney(getNextFieldUnlockCost());

  buyLeftFieldButton.disabled = !canBuyLeft;
  buyRightFieldButton.disabled = !canBuyRight;
  buySlowdownButton.disabled = !canBuySlow;
  buyLeftFieldButton.textContent = `Открыть левое поле за ${unlockCost}`;
  buyRightFieldButton.textContent = `Открыть правое поле за ${unlockCost}`;
  buySlowdownButton.textContent = `Замедлить скорость на 10% за ${formatMoney(slowdownCost)}`;

  if (unlockedSides.left && unlockedSides.right) {
    buyFieldNote.textContent = canBuySlow
      ? "Оба поля уже открыты. На паузе можно еще купить замедление скорости на 10%."
      : "Оба боковых поля уже открыты. Теперь можно заработать больше.";
    return;
  }

  if (canBuyLeft || canBuyRight) {
    buyFieldNote.textContent = canBuySlow
      ? `На паузе можно открыть левое или правое поле за ${unlockCost} или купить замедление скорости.`
      : `На паузе можно открыть левое или правое поле за ${unlockCost}.`;
    return;
  }

  if (canBuySlow) {
    buyFieldNote.textContent = "На паузе можно купить замедление скорости на 10%.";
    return;
  }

  const remainingField = Math.max(getNextFieldUnlockCost() - score, 0);
  const remainingSlow = Math.max(slowdownCost - score, 0);
  const remaining = Math.min(remainingField, remainingSlow);
  buyFieldNote.textContent = `Поставь на паузу и накопи ${formatMoney(remaining)}, чтобы купить улучшение.`;
}

function updateDifficultyButtons() {
  difficultyButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.level === currentLevel);
  });
  bestScore = loadBestScore(currentLevel);
  bestNode.textContent = formatMoney(bestScore);
}

function updateBeerTimer() {
  const remainingMs = Math.max(slowUntil - Date.now(), 0);

  if (remainingMs <= 0) {
    beerTimerNode.textContent = "🍺 не активно";
    beerTimerNode.classList.remove("active");
    return;
  }

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  beerTimerNode.textContent = `🍺 замедление: ${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  beerTimerNode.classList.add("active");
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function isCellBlocked(x, y) {
  const onSnake = snake?.some((segment) => segment.x === x && segment.y === y);
  const onObstacle = obstacles.some((obstacle) => obstacle.x === x && obstacle.y === y);
  const onBag = moneyBags.some((bag) => bag.x === x && bag.y === y);
  const onBeer = beers.some((beer) => beer.x === x && beer.y === y);
  return onSnake || onObstacle || onBag || onBeer;
}

function spawnFreeCell() {
  const activeBounds = getActiveBounds();

  while (true) {
    const candidate = {
      x: randomBetween(activeBounds.minX, activeBounds.maxX),
      y: randomBetween(activeBounds.minY, activeBounds.maxY)
    };

    if (!isCellBlocked(candidate.x, candidate.y)) {
      return candidate;
    }
  }
}

function spawnMoneyBags(count) {
  moneyBags = [];
  while (moneyBags.length < count) {
    moneyBags.push(spawnFreeCell());
  }
}

function spawnBeerItem() {
  return spawnFreeCell();
}

function refillBeers(force = false) {
  const config = levelConfig[currentLevel];

  if (config.beerMode !== "always" && !force) {
    return;
  }

  while (beers.length < config.beerSlots) {
    beers.push(spawnBeerItem());
  }
}

function maybeSpawnBeer() {
  const config = levelConfig[currentLevel];

  if (config.beerMode === "always") {
    refillBeers();
    return;
  }

  if (beers.length < config.beerSlots && collectedMoney >= nextBeerMilestone) {
    beers.push(spawnBeerItem());
    nextBeerMilestone += beerMoneyStep;
  }
}

function spawnObstacles() {
  const config = levelConfig[currentLevel];
  const nextObstacles = [];
  const activeBounds = getActiveBounds();
  const safeZone = {
    minX: Math.max(activeBounds.minX, Math.floor((activeBounds.minX + activeBounds.maxX) / 2) - 4),
    maxX: Math.min(activeBounds.maxX, Math.floor((activeBounds.minX + activeBounds.maxX) / 2) + 3),
    minY: 7,
    maxY: 13
  };

  while (nextObstacles.length < config.obstacleCount) {
    const candidate = {
      x: randomBetween(activeBounds.minX, activeBounds.maxX),
      y: randomBetween(activeBounds.minY, activeBounds.maxY),
      type: config.obstacleTypes[nextObstacles.length % config.obstacleTypes.length]
    };

    const onSnake = snake?.some((segment) => segment.x === candidate.x && segment.y === candidate.y);
    const duplicate = nextObstacles.some((obstacle) => obstacle.x === candidate.x && obstacle.y === candidate.y);
    const tooCloseToStart =
      candidate.x >= safeZone.minX &&
      candidate.x <= safeZone.maxX &&
      candidate.y >= safeZone.minY &&
      candidate.y <= safeZone.maxY;

    if (!onSnake && !duplicate && !tooCloseToStart) {
      nextObstacles.push(candidate);
    }
  }

  return nextObstacles;
}

function resetGame() {
  unlockedSides = { left: false, right: false };
  beers = [];
  moneyBags = [];
  slowUntil = 0;
  purchasedSlowdownMultiplier = 1;
  collectedMoney = 0;
  nextBeerMilestone = beerMoneyStep;
  awaitingBribeDecision = false;

  const activeBounds = getActiveBounds();
  const centerX = Math.floor((activeBounds.minX + activeBounds.maxX) / 2);
  const centerY = Math.floor((activeBounds.minY + activeBounds.maxY) / 2);

  snake = [
    { x: centerX, y: centerY },
    { x: centerX - 1, y: centerY },
    { x: centerX - 2, y: centerY }
  ];
  direction = { x: 1, y: 0 };
  nextDirection = { x: 1, y: 0 };
  obstacles = spawnObstacles();
  spawnMoneyBags(levelConfig[currentLevel].moneyBagCount);
  refillBeers(true);
  score = 0;
  running = false;
  started = false;
  gameOver = false;
  lastTick = 0;
  scoreNode.textContent = formatMoney(0);
  collectedMoneyNode.textContent = formatMoney(0);
  updateBeerTimer();
  updateDifficultyButtons();
  updateFieldPurchaseUI();
  showOverlay(levelConfig[currentLevel].title, getLevelMessage(currentLevel));
  draw();
}

function showOverlay(title, text) {
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  overlay.classList.remove("hidden");
  overlayActions.classList.add("hidden");
  updateFieldPurchaseUI();
}

function hideOverlay() {
  overlay.classList.add("hidden");
  overlayActions.classList.add("hidden");
  updateFieldPurchaseUI();
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
    const canBuyAny = canUnlockField("left") || canUnlockField("right");
    const canBuySpeed = canBuySlowdown();
    const pauseText = canBuyAny
      ? `Нажми пробел, чтобы продолжить, или используй кнопки сверху для открытия поля за ${formatMoney(getNextFieldUnlockCost())}.`
      : canBuySpeed
        ? "Нажми пробел, чтобы продолжить, или купи замедление скорости на 10%."
        : "Нажми пробел, чтобы продолжить.";
    showOverlay("Пауза", pauseText);
  }
}

function endGame() {
  running = false;
  gameOver = true;
  awaitingBribeDecision = false;
  showOverlay("Игра окончена", "Нажми Enter, чтобы начать заново.");
}

function showBribeOverlay() {
  running = false;
  gameOver = true;
  awaitingBribeDecision = true;
  overlayTitle.textContent = "Откупиться за 15 000 ₽";
  overlayText.textContent = "Заплати и продолжай игру из центра поля или начни заново.";
  payBribeButton.disabled = score < bribeCost;
  restartFromBribeButton.disabled = false;
  overlay.classList.remove("hidden");
  overlayActions.classList.remove("hidden");
  updateFieldPurchaseUI();
}

function getCenterSpawnSnake() {
  const activeBounds = getActiveBounds();
  const centerX = Math.floor((activeBounds.minX + activeBounds.maxX) / 2);
  const centerY = Math.floor((activeBounds.minY + activeBounds.maxY) / 2);
  const targetLength = snake.length;
  const nextSnake = [];

  for (let index = 0; index < targetLength; index += 1) {
    nextSnake.push({ x: centerX - index, y: centerY });
  }

  return nextSnake;
}

function continueAfterBribe() {
  if (!awaitingBribeDecision || score < bribeCost) {
    return;
  }

  score -= bribeCost;
  scoreNode.textContent = formatMoney(score);
  snake = getCenterSpawnSnake();
  direction = { x: 1, y: 0 };
  nextDirection = { x: 1, y: 0 };
  running = true;
  gameOver = false;
  awaitingBribeDecision = false;
  lastTick = 0;
  hideOverlay();
  draw();
  requestAnimationFrame(loop);
}

function buyField(side) {
  if (running || !started || gameOver || !canUnlockField(side)) {
    return;
  }

  score -= getNextFieldUnlockCost();
  scoreNode.textContent = formatMoney(score);
  unlockedSides[side] = true;
  obstacles = spawnObstacles();
  beers = [];
  moneyBags = [];
  spawnMoneyBags(levelConfig[currentLevel].moneyBagCount);
  refillBeers(true);
  updateFieldPurchaseUI();
  showOverlay("Поле открыто", `${side === "left" ? "Левое" : "Правое"} поле активировано. Нажми пробел, чтобы продолжить.`);
  draw();
}

function buySlowdown() {
  if (!canBuySlowdown()) {
    return;
  }

  score -= slowdownCost;
  scoreNode.textContent = formatMoney(score);
  purchasedSlowdownMultiplier *= 1.1;
  updateFieldPurchaseUI();
  showOverlay("Скорость снижена", "Скорость змейки уменьшена на 10% от текущей. Нажми пробел, чтобы продолжить.");
}

function getCurrentMoveInterval() {
  const baseInterval = levelConfig[currentLevel].moveInterval * purchasedSlowdownMultiplier;
  return Date.now() < slowUntil ? baseInterval * 2 : baseInterval;
}

function update() {
  const activeBounds = getActiveBounds();
  direction = nextDirection;
  const head = snake[0];
  const newHead = {
    x: head.x + direction.x,
    y: head.y + direction.y
  };

  const hitWall =
    newHead.x < activeBounds.minX ||
    newHead.y < activeBounds.minY ||
    newHead.x > activeBounds.maxX ||
    newHead.y > activeBounds.maxY;

  const hitSelf = snake.some((segment) => segment.x === newHead.x && segment.y === newHead.y);
  const hitObstacle = obstacles.some((obstacle) => obstacle.x === newHead.x && obstacle.y === newHead.y);

  if (hitWall && currentLevel === "owner") {
    showBribeOverlay();
    draw();
    return;
  }

  if (hitWall || hitSelf || hitObstacle) {
    endGame();
    draw();
    return;
  }

  snake.unshift(newHead);

  const bagIndex = moneyBags.findIndex((bag) => bag.x === newHead.x && bag.y === newHead.y);
  const beerIndex = beers.findIndex((beer) => beer.x === newHead.x && beer.y === newHead.y);

  if (bagIndex !== -1) {
    const bagValue = levelConfig[currentLevel].moneyPerBag;
    score += bagValue;
    collectedMoney += bagValue;
    scoreNode.textContent = formatMoney(score);
    collectedMoneyNode.textContent = formatMoney(collectedMoney);

    if (score > bestScore) {
      bestScore = score;
      saveBestScore(currentLevel, bestScore);
      bestNode.textContent = formatMoney(bestScore);
    }

    updateFieldPurchaseUI();
    moneyBags.splice(bagIndex, 1);
    moneyBags.push(spawnFreeCell());
    maybeSpawnBeer();
  } else if (beerIndex !== -1) {
    slowUntil = Date.now() + beerDurationMs;
    beers.splice(beerIndex, 1);
    refillBeers();
    updateBeerTimer();
    snake.pop();
  } else {
    snake.pop();
  }

  draw();
}

function drawBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const activeBounds = getActiveBounds();

  ctx.fillStyle = "#f8ead0";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#f5dfbc";
  ctx.fillRect(
    activeBounds.minX * cellSize,
    activeBounds.minY * cellSize,
    (activeBounds.maxX - activeBounds.minX + 1) * cellSize,
    (activeBounds.maxY - activeBounds.minY + 1) * cellSize
  );

  drawGrid();

  if (!unlockedSides.left) {
    drawLockedZone(0, sideZoneColumns * cellSize, "Купить");
  }

  if (!unlockedSides.right) {
    drawLockedZone(canvas.width - sideZoneColumns * cellSize, sideZoneColumns * cellSize, "Купить");
  }
}

function drawGrid() {
  ctx.strokeStyle = "#ffffff55";
  ctx.lineWidth = 1;

  for (let x = 0; x <= canvas.width; x += cellSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  for (let y = 0; y <= canvas.height; y += cellSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

function drawLockedZone(startX, width, label) {
  ctx.save();
  ctx.fillStyle = "#ead6b645";
  ctx.fillRect(startX, 0, width, canvas.height);

  ctx.fillStyle = "#b76a1d";
  ctx.font = "bold 22px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const lines = label.split("\n");
  lines.forEach((line, index) => {
    ctx.fillText(line, startX + width / 2, canvas.height / 2 + index * 28 - 14);
  });

  ctx.restore();
}

function drawBeer(itemX, itemY) {
  const x = itemX * cellSize;
  const y = itemY * cellSize;

  ctx.font = "22px 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🍺", x + 15, y + 17);
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

function drawObstacle(obstacle) {
  const x = obstacle.x * cellSize;
  const y = obstacle.y * cellSize;

  ctx.save();
  ctx.font = "22px 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(obstacle.type, x + 15, y + 17);
  ctx.restore();
}

function getHeadRotation(segment) {
  const nearestBag = moneyBags.reduce((closest, bag) => {
    if (!closest) {
      return bag;
    }

    const currentDistance = Math.abs(closest.x - segment.x) + Math.abs(closest.y - segment.y);
    const candidateDistance = Math.abs(bag.x - segment.x) + Math.abs(bag.y - segment.y);
    return candidateDistance < currentDistance ? bag : closest;
  }, null);

  const target = nearestBag || { x: segment.x + direction.x, y: segment.y + direction.y };
  const lookX = target.x - segment.x;
  const lookY = target.y - segment.y;

  if (lookX === 0 && lookY === 0) {
    return Math.atan2(direction.y, direction.x);
  }

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

  ctx.fillStyle = index % 2 === 0 ? "#ff9b34" : "#d96a0c";
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
  moneyBags.forEach((bag) => drawMoneyBag(bag.x, bag.y));
  beers.forEach((beer) => drawBeer(beer.x, beer.y));
  snake.forEach(drawSegment);
}

function loop(timestamp) {
  if (!running) {
    return;
  }

  updateBeerTimer();

  if (!lastTick) {
    lastTick = timestamp;
  }

  if (timestamp - lastTick >= getCurrentMoveInterval()) {
    lastTick = timestamp;
    update();
  }

  if (running) {
    requestAnimationFrame(loop);
  }
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();

  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "enter", "w", "a", "s", "d", "b", "и"].includes(key)) {
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

buyLeftFieldButton.addEventListener("click", () => buyField("left"));
buyRightFieldButton.addEventListener("click", () => buyField("right"));
buySlowdownButton.addEventListener("click", buySlowdown);
payBribeButton.addEventListener("click", continueAfterBribe);
restartFromBribeButton.addEventListener("click", resetGame);

headImage.addEventListener("load", draw);

resetGame();
