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
const restartButton = document.getElementById("restart-button");

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
const davidDropValue = 1;
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
  },
  david: {
    title: "5: Давид",
    obstacleCount: 0,
    obstacleTypes: [],
    moneyPerBag: davidDropValue,
    moveInterval: 16,
    moneyBagCount: 0,
    beerSlots: 0,
    beerMode: "none"
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
let davidPlayerX = 0;
let davidDrops = [];
let davidMove = 0;
let davidLastSpawn = 0;
let davidSpeedMultiplier = 1;

bestNode.textContent = formatMoney(bestScore);
collectedMoneyNode.textContent = formatMoney(0);
updateBeerTimer();

function formatMoney(value) {
  if (currentLevel === "david") {
    return `${value.toLocaleString("ru-RU")} л`;
  }
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

  if (level === "david") {
    return "Лови капли, которые падают с трубы сверху. Каждая пойманная капля = 1 литр воды.";
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
  if (currentLevel === "david") {
    buyLeftFieldButton.disabled = true;
    buyRightFieldButton.disabled = true;
    buySlowdownButton.disabled = true;
    buyFieldNote.textContent = "В режиме Давид покупки полей и замедления отключены.";
    return;
  }

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
  davidDrops = [];
  davidMove = 0;
  davidLastSpawn = 0;
  davidSpeedMultiplier = 1;

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
  davidPlayerX = Math.floor(gridColumns / 2) - 1;
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
  if (currentLevel === "david") {
    davidMove = x;

    if (!started) {
      started = true;
      running = true;
      gameOver = false;
      hideOverlay();
      requestAnimationFrame(loop);
    }
    return;
  }

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
  if (currentLevel === "david") {
    return;
  }

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
  if (currentLevel === "david") {
    return;
  }

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

function spawnDavidDrop() {
  davidDrops.push({
    x: randomBetween(1, gridColumns - 2),
    y: 1,
    speed: (0.09 + Math.random() * 0.04) * davidSpeedMultiplier
  });
}

function updateDavid(timestamp) {
  if (!lastTick) {
    lastTick = timestamp;
  }

  const delta = timestamp - lastTick;
  lastTick = timestamp;

  davidPlayerX += davidMove * (delta / 42);
  davidPlayerX = Math.max(0, Math.min(gridColumns - 3, davidPlayerX));

  if (!davidLastSpawn || timestamp - davidLastSpawn > 1150) {
    davidLastSpawn = timestamp;
    spawnDavidDrop();
  }

  const bucketMinX = Math.floor(davidPlayerX) + 1;
  const bucketMaxX = bucketMinX + 1;
  const bucketY = gridRows - 2;

  const remainingDrops = [];
  for (const drop of davidDrops) {
    const nextDrop = { ...drop, y: drop.y + drop.speed * (delta / 16) };
    const dropCellX = Math.round(nextDrop.x);
    const dropCellY = Math.round(nextDrop.y);

    if (dropCellY >= bucketY && dropCellX >= bucketMinX && dropCellX <= bucketMaxX) {
      score += davidDropValue;
      collectedMoney += davidDropValue;
      scoreNode.textContent = formatMoney(score);
      collectedMoneyNode.textContent = formatMoney(collectedMoney);
      davidSpeedMultiplier = 1 + Math.floor(collectedMoney / 50) * 0.05;
      if (score > bestScore) {
        bestScore = score;
        saveBestScore(currentLevel, bestScore);
        bestNode.textContent = formatMoney(bestScore);
      }
      continue;
    }

    if (nextDrop.y >= gridRows - 1) {
      running = false;
      gameOver = true;
      showOverlay("Игра окончена", "Капля упала на пол. Нажми Enter, чтобы начать заново.");
      draw();
      return;
    }

    if (nextDrop.y < gridRows) {
      remainingDrops.push(nextDrop);
    }
  }

  davidDrops = remainingDrops;
  draw();
}

function update() {
  if (currentLevel === "david") {
    return;
  }

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

  if (currentLevel === "david") {
    ctx.fillStyle = "#111925";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#162131";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawGrid();
    drawFieldWatermark("Потоп в офисе");
    return;
  }

  const activeBounds = getActiveBounds();

  const boardGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  boardGradient.addColorStop(0, "#101823");
  boardGradient.addColorStop(1, "#0d141d");
  ctx.fillStyle = boardGradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const activeGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  activeGradient.addColorStop(0, "#172130");
  activeGradient.addColorStop(1, "#111a27");
  ctx.fillStyle = activeGradient;
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

function drawFieldWatermark(text) {
  ctx.save();
  ctx.fillStyle = "#d9e7ff14";
  ctx.font = "600 44px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  ctx.restore();
}

function drawGrid() {
  ctx.strokeStyle = "#ffffff10";
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
  ctx.fillStyle = "#0a1018aa";
  ctx.fillRect(startX, 0, width, canvas.height);

  ctx.fillStyle = "#89f78c";
  ctx.font = "600 22px sans-serif";
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

  ctx.save();
  ctx.shadowColor = "rgba(255, 214, 102, 0.38)";
  ctx.shadowBlur = 14;
  ctx.font = "22px 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🍺", x + 15, y + 17);
  ctx.restore();
}

function drawMoneyBag(itemX, itemY) {
  const x = itemX * cellSize;
  const y = itemY * cellSize;

  ctx.save();
  ctx.shadowColor = "rgba(255, 115, 88, 0.42)";
  ctx.shadowBlur = 20;
  const glow = ctx.createRadialGradient(x + 15, y + 15, 2, x + 15, y + 15, 11);
  glow.addColorStop(0, "#ffae63");
  glow.addColorStop(1, "#ff5a4e");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x + 15, y + 15, 9, 0, Math.PI * 2);
  ctx.fill();

  const core = ctx.createLinearGradient(x + 8, y + 8, x + 22, y + 22);
  core.addColorStop(0, "#ffcf78");
  core.addColorStop(1, "#ff6a4a");
  ctx.shadowBlur = 0;
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(x + 15, y + 15, 7, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.42)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x + 13, y + 13, 3.5, Math.PI * 1.1, Math.PI * 1.75);
  ctx.stroke();
  ctx.restore();
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

function drawDavidPipe() {
  ctx.fillStyle = "#6f7b85";
  roundRect(ctx, 8, 10, canvas.width - 16, 16, 8);
  ctx.fill();

  for (let x = 28; x < canvas.width - 20; x += 120) {
    ctx.fillStyle = "#5d6770";
    ctx.fillRect(x, 22, 8, 10);
  }
}

function drawDavidDrops() {
  davidDrops.forEach((drop) => {
    const x = drop.x * cellSize;
    const y = drop.y * cellSize;
    ctx.font = "20px 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("💧", x + 15, y + 14);
  });
}

function drawDavidPlayer() {
  const x = davidPlayerX * cellSize;
  const y = (gridRows - 3) * cellSize;

  ctx.fillStyle = "#1c1c1c";
  ctx.beginPath();
  ctx.arc(x + 45, y + 16, 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#2f4f6f";
  roundRect(ctx, x + 32, y + 28, 26, 34, 10);
  ctx.fill();

  ctx.fillStyle = "#5c3a1b";
  ctx.fillRect(x + 26, y + 40, 10, 28);

  ctx.fillStyle = "#a36a2d";
  roundRect(ctx, x + 20, y + 38, 18, 14, 5);
  ctx.fill();
  ctx.strokeStyle = "#6d451f";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x + 29, y + 38, 7, Math.PI, Math.PI * 2);
  ctx.stroke();
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
  const size = cellSize - 6;

  if (index === 0) {
    ctx.save();
    ctx.translate(x + cellSize / 2, y + cellSize / 2);
    ctx.rotate(getHeadRotation(segment));

    if (headImage.complete) {
      ctx.save();
      ctx.beginPath();
      roundRect(ctx, -size / 2, -size / 2, size, size, 10);
      ctx.clip();
      const headGradient = ctx.createLinearGradient(-size / 2, -size / 2, size / 2, size / 2);
      headGradient.addColorStop(0, "#cbff8d");
      headGradient.addColorStop(1, "#4ad76a");
      ctx.fillStyle = headGradient;
      ctx.fillRect(-size / 2, -size / 2, size, size);
      ctx.globalAlpha = 0.92;
      ctx.drawImage(headImage, -size / 2 + 2, -size / 2 + 2, size - 4, size - 4);
      ctx.restore();

      ctx.strokeStyle = "rgba(255, 255, 255, 0.32)";
      ctx.lineWidth = 1.4;
      roundRect(ctx, -size / 2, -size / 2, size, size, 10);
      ctx.stroke();
    } else {
      const fallbackHead = ctx.createLinearGradient(-size / 2, -size / 2, size / 2, size / 2);
      fallbackHead.addColorStop(0, "#cbff8d");
      fallbackHead.addColorStop(1, "#4ad76a");
      ctx.fillStyle = fallbackHead;
      roundRect(ctx, -size / 2, -size / 2, size, size, 10);
      ctx.fill();
      ctx.fillStyle = "#0f1620";
      ctx.font = "bold 18px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("K", 0, 1);
    }
    ctx.restore();
    return;
  }

  ctx.save();
  const bodyGradient = ctx.createLinearGradient(x + 2, y + 2, x + size, y + size);
  bodyGradient.addColorStop(0, index % 2 === 0 ? "#bfff8b" : "#8ef06e");
  bodyGradient.addColorStop(1, index % 2 === 0 ? "#62dd6d" : "#40c968");
  ctx.fillStyle = bodyGradient;
  ctx.shadowColor = "rgba(112, 255, 144, 0.2)";
  ctx.shadowBlur = 10;
  roundRect(ctx, x + 3, y + 3, size, size, 10);
  ctx.fill();
  ctx.restore();
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

  if (currentLevel === "david") {
    drawDavidPipe();
    drawDavidDrops();
    drawDavidPlayer();
    return;
  }

  obstacles.forEach(drawObstacle);
  moneyBags.forEach((bag) => drawMoneyBag(bag.x, bag.y));
  beers.forEach((beer) => drawBeer(beer.x, beer.y));
  snake.forEach(drawSegment);
}

function loop(timestamp) {
  if (!running) {
    return;
  }

  if (currentLevel === "david") {
    updateDavid(timestamp);
    requestAnimationFrame(loop);
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

  if (currentLevel === "david") {
    if (key === "arrowleft" || key === "a") {
      setDirection(-1, 0);
    } else if (key === "arrowright" || key === "d") {
      setDirection(1, 0);
    } else if (key === " ") {
      togglePause();
    } else if (key === "enter") {
      resetGame();
    }
    return;
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

window.addEventListener("keyup", (event) => {
  if (currentLevel !== "david") {
    return;
  }

  const key = event.key.toLowerCase();
  if (key === "arrowleft" || key === "a" || key === "arrowright" || key === "d") {
    davidMove = 0;
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
restartButton.addEventListener("click", resetGame);

headImage.addEventListener("load", draw);

resetGame();
