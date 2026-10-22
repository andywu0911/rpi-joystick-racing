const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('score-display');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const finalScoreDisplay = document.getElementById('final-score');

let lastObsColor = '';
let lastObsX = 0;

const debugX = document.getElementById('debug-x');
const debugY = document.getElementById('debug-y');
const debugLight = document.getElementById('debug-light');
const modeDisplay = document.getElementById('mode-display');

const vipSection = document.getElementById('vip-section');
const colorBtns = document.querySelectorAll('.color-btn');
const vipCloseBtn = document.getElementById('vip-close-btn');

let vipColor = 'red'; // default vip color
let isVIP = false;
let lastRfidUid = null;
let selectedVipIndex = 0;
let joystickMovedX = false;
let hwButtonWasPressed = false;

function updateVipSelection() {
    colorBtns.forEach((b, i) => {
        if (i === selectedVipIndex) {
            b.style.border = '3px solid white';
            b.style.transform = 'scale(1.2)';
            vipColor = b.getAttribute('data-color');
            player.color = vipColor;
            if (!isPlaying) draw();
        } else {
            b.style.border = '2px solid transparent';
            b.style.transform = 'scale(1)';
        }
    });
}

colorBtns.forEach((btn, index) => {
    btn.addEventListener('click', () => {
        selectedVipIndex = index;
        updateVipSelection();
    });
});

const nitroStatus = document.getElementById('nitro-status');

// Game state
let isPlaying = false;
let score = 0;
let lastScoreThreshold = 0;
let gameLoopId;
let linesOffset = 0;

// Police State
let strikes = 0;
let policeDistance = 80;
let targetPoliceDistance = 80;
let isSirenOn = false;
let hitCooldown = 0; 
let policeX = 175; 

const MAX_POLICE_DIST = 80;

// Player Car (Size Unified)
const player = {
    x: 175,
    y: 335, 
    width: 45,
    height: 85,
    speed: 5,
    color: '#ffffff'
};

const police = {
    width: 45,
    height: 85,
    color: '#111'
};

let obstacles = [];
let baseObstacleSpeed = 4;
let spawnRate = 90;
let frameCount = 0;

// Hardware Mocks & States
let hwX = 512;
let hwY = 512;
let hwLight = 800;
let hwButton = false;
let hwRfid = null;

// New Mechanics States
let strikeTime = 0;
let gameOverTime = 0;
let resetToDayDone = true;

function initGame() {
    document.getElementById('canvas-container').classList.remove('shake');
    player.x = canvas.width / 2 - player.width / 2;
    policeX = player.x;
    score = 0;
    lastScoreThreshold = 0;
    baseObstacleSpeed = 4;
    vipSection.classList.add('hidden');
    obstacles = [];
    frameCount = 0;
    
    strikes = 0;
    policeDistance = MAX_POLICE_DIST;
    targetPoliceDistance = MAX_POLICE_DIST;
    isSirenOn = false;
    hitCooldown = 0;
    strikeTime = 0;
    
    // Check hardware state immediately on start to apply VIP if RFID is present
    if(hwRfid && hwRfid !== "None" && hwRfid !== "") {
        isVIP = true;
    }
    if (isVIP) player.color = vipColor;
    else player.color = '#ffffff';
    
    nitroStatus.innerText = "";
    
    sendFeedback('siren_off', 0);
    
    scoreDisplay.innerText = score;
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
}

function handleStrike() {
    if (hitCooldown > 0) return;
    
    strikes++;
    hitCooldown = 60; // 1 second cooldown
    
    if (strikes === 1) {
        strikeTime = Date.now();
        targetPoliceDistance = 15; // Extremely close behind
        if (!isSirenOn) {
            isSirenOn = true;
            sendFeedback('siren_on', score);
        }
    } else if (strikes >= 2) {
        targetPoliceDistance = -15; // Overlap for the crash
    }
}

function spawnObstacle() {
    const type = Math.random() > 0.3 ? 'car' : 'cone';
    let w, h, finalColor;
    let x;
    if (type === 'car') {
        w = 45; h = 85; 
        const colors = ['#ff4b4b', '#f9ca24', '#6ab04c', '#e056fd', '#00cec9'];
        let availableColors = colors.filter(c => c !== lastObsColor);
        finalColor = availableColors[Math.floor(Math.random() * availableColors.length)];
        lastObsColor = finalColor;
    } else {
        w = 25; h = 35;
        finalColor = '#ff6600';
    }
    
    let attempts = 0;
    do {
        x = Math.random() * (canvas.width - w - 20) + 10;
        attempts++;
    } while (Math.abs(x - lastObsX) < 70 && attempts < 10);
    lastObsX = x;

    obstacles.push({
        type: type,
        x: x,
        y: -h,
        width: w,
        height: h,
        color: finalColor
    });
}

function update() {
    if (!isPlaying) return;

    let moveLeft = (hwX < 400);
    let moveRight = (hwX > 600);

    // Apply Speed logic
    let currentSpeed = baseObstacleSpeed;
    if (hwY < 400) currentSpeed = baseObstacleSpeed * 1.2;
    if (hwY > 600) currentSpeed = baseObstacleSpeed * 0.8;
    
    if (hitCooldown > 0) {
        hitCooldown--;
        if (strikes < 2) {
            currentSpeed *= 0.5; // Slow down during cooldown
        }
    } else {
        if (targetPoliceDistance < MAX_POLICE_DIST && strikes === 0) {
             targetPoliceDistance = MAX_POLICE_DIST;
        }
    }

    // 5-second recovery from first strike
    if (strikes === 1 && Date.now() - strikeTime > 5000) {
        strikes = 0;
        targetPoliceDistance = MAX_POLICE_DIST;
        isSirenOn = false;
        sendFeedback('siren_off', score);
    }

    // Smoothly interpolate police distance and X coordinate
    policeDistance += (targetPoliceDistance - policeDistance) * 0.05;
    policeX += (player.x - policeX) * 0.08; 

    let playerSpeed = player.speed;

    if (moveLeft) player.x -= playerSpeed;
    if (moveRight) player.x += playerSpeed;

    // Boundary collision (visual edge)
    if (player.x < -5) {
        player.x = -5;
        handleStrike();
    }
    if (player.x > canvas.width - player.width + 5) {
        player.x = canvas.width - player.width + 5;
        handleStrike();
    }

    linesOffset += currentSpeed;
    if (linesOffset > 100) linesOffset = 0;

    frameCount++;
    
    let currentSpawnRate = spawnRate;
    
    if (frameCount % Math.max(20, Math.floor(currentSpawnRate)) === 0) {
        spawnObstacle();
    }

    for (let i = 0; i < obstacles.length; i++) {
        obstacles[i].y += currentSpeed;

        if (player.x + 5 < obstacles[i].x + obstacles[i].width - 5 &&
            player.x + player.width - 5 > obstacles[i].x + 5 &&
            player.y + 5 < obstacles[i].y + obstacles[i].height - 5 &&
            player.y + player.height - 5 > obstacles[i].y + 5) {
            
            if (obstacles[i].type === 'car') {
                draw();
                drawExplosion(player.x, player.y);
                document.getElementById('canvas-container').classList.add('shake');
                gameOver();
                return;
            } else if (obstacles[i].type === 'cone') {
                handleStrike();
                obstacles.splice(i, 1);
                i--;
                continue;
            }
        }

        if (obstacles[i].y > canvas.height) {
            if (obstacles[i].type === 'car') {
                score += 10;
                scoreDisplay.innerText = score;
                if (score - lastScoreThreshold >= 50) {
                    lastScoreThreshold = score;
                    baseObstacleSpeed += 0.2;
                    spawnRate -= 2;
                }
            }
            obstacles.splice(i, 1);
            i--;
        }
    }
    
    if (strikes >= 2 && policeDistance <= -10) {
        policeDistance = -15;
        draw();
        drawExplosion(player.x, player.y + player.height/2);
        document.getElementById('canvas-container').classList.add('shake');
        gameOver();
    }
}

function drawSportsCar(x, y, w, h, color) {
    let finalColor = color;

    // Drop shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x + 2, y + 2, w, h);

    // Main Body
    ctx.fillStyle = finalColor;
    ctx.fillRect(x + 5, y + 10, w - 10, h - 20);
    // Front & rear bumpers (tapered)
    ctx.fillRect(x + 10, y + 5, w - 20, 5);
    ctx.fillRect(x + 10, y + h - 10, w - 20, 5);

    // Side skirts (dark/black)
    ctx.fillStyle = '#111';
    ctx.fillRect(x + 3, y + 25, 2, h - 50); 
    ctx.fillRect(x + w - 5, y + 25, 2, h - 50); 

    // Hood contour
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.moveTo(x + 15, y + 15);
    ctx.lineTo(x + w - 15, y + 15);
    ctx.lineTo(x + w - 10, y + 30);
    ctx.lineTo(x + 10, y + 30);
    ctx.fill();

    // Windshield (wraps around slightly)
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.moveTo(x + 10, y + 35);
    ctx.lineTo(x + w - 10, y + 35);
    ctx.lineTo(x + w - 12, y + 22);
    ctx.lineTo(x + 12, y + 22);
    ctx.fill();

    // Roof
    ctx.fillStyle = finalColor;
    ctx.fillRect(x + 12, y + 35, w - 24, 20);

    // Rear Window
    ctx.fillStyle = '#222';
    ctx.fillRect(x + 12, y + 55, w - 24, 10);

    // Big Racing Spoiler
    ctx.fillStyle = '#111';
    ctx.fillRect(x + 2, y + h - 15, w - 4, 6);
    // Spoiler struts
    ctx.fillRect(x + 12, y + h - 20, 4, 5);
    ctx.fillRect(x + w - 16, y + h - 20, 4, 5);

    // Headlights (Aggressive slits)
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(x + 8, y + 10);
    ctx.lineTo(x + 16, y + 12);
    ctx.lineTo(x + 8, y + 14);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + w - 8, y + 10);
    ctx.lineTo(x + w - 16, y + 12);
    ctx.lineTo(x + w - 8, y + 14);
    ctx.fill();
    
    if (document.body.classList.contains('night-mode')) {
        let gradient1 = ctx.createLinearGradient(x + 5, y + 10, x - 15, y - 60);
        gradient1.addColorStop(0, 'rgba(255, 255, 200, 0.9)');
        gradient1.addColorStop(1, 'rgba(255, 255, 200, 0)');
        ctx.fillStyle = gradient1;
        ctx.beginPath(); ctx.moveTo(x + 10, y + 10); ctx.lineTo(x - 20, y - 60); ctx.lineTo(x + 20, y - 60); ctx.fill();
        
        let gradient2 = ctx.createLinearGradient(x + w - 5, y + 10, x + w + 15, y - 60);
        gradient2.addColorStop(0, 'rgba(255, 255, 200, 0.9)');
        gradient2.addColorStop(1, 'rgba(255, 255, 200, 0)');
        ctx.fillStyle = gradient2;
        ctx.beginPath(); ctx.moveTo(x + w - 10, y + 10); ctx.lineTo(x + w - 20, y - 60); ctx.lineTo(x + w + 20, y - 60); ctx.fill();
    }
    
    // Flash white when hit
    if (hitCooldown > 0 && Math.floor(hitCooldown / 5) % 2 === 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.fillRect(x, y, w, h);
    }
}

function drawCar(x, y, w, h, color, isPolice=false, isPlayer=false) {
    let finalColor = color;

    ctx.fillStyle = finalColor;
    ctx.fillRect(x + 5, y + 10, w - 10, h - 20);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(x + 10, y + 30, w - 20, 30);
    ctx.fillStyle = '#111';
    ctx.fillRect(x, y + 15, 5, 20);
    ctx.fillRect(x + w - 5, y + 15, 5, 20);
    ctx.fillRect(x, y + h - 35, 5, 20);
    ctx.fillRect(x + w - 5, y + h - 35, 5, 20);
    
    if (isPolice) {
        // Police Light bar
        ctx.fillStyle = '#222';
        ctx.fillRect(x + 10, y + 25, w - 20, 8);
        
        let redOn = (frameCount % 20 < 10);
        
        ctx.fillStyle = redOn ? '#ff0000' : '#550000';
        ctx.fillRect(x + 10, y + 25, (w - 20)/2, 8);
        if (redOn) {
            ctx.shadowColor = '#ff0000';
            ctx.shadowBlur = 15;
            ctx.fillRect(x + 10, y + 25, (w - 20)/2, 8);
            ctx.shadowBlur = 0;
        }

        ctx.fillStyle = !redOn ? '#0000ff' : '#000055';
        ctx.fillRect(x + 10 + (w - 20)/2, y + 25, (w - 20)/2, 8);
        if (!redOn) {
            ctx.shadowColor = '#0000ff';
            ctx.shadowBlur = 15;
            ctx.fillRect(x + 10 + (w - 20)/2, y + 25, (w - 20)/2, 8);
            ctx.shadowBlur = 0;
        }
        
        // Police headlights
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fillRect(x + 10, y + 5, 8, 5);
        ctx.fillRect(x + w - 18, y + 5, 8, 5);
    } else if (isPlayer && document.body.classList.contains('night-mode')) {
        let gradient1 = ctx.createLinearGradient(x + 5, y + 10, x - 15, y - 60);
        gradient1.addColorStop(0, 'rgba(255, 255, 200, 0.9)');
        gradient1.addColorStop(1, 'rgba(255, 255, 200, 0)');
        ctx.fillStyle = gradient1;
        ctx.beginPath(); ctx.moveTo(x + 10, y + 10); ctx.lineTo(x - 20, y - 60); ctx.lineTo(x + 20, y - 60); ctx.fill();
        
        let gradient2 = ctx.createLinearGradient(x + w - 5, y + 10, x + w + 15, y - 60);
        gradient2.addColorStop(0, 'rgba(255, 255, 200, 0.9)');
        gradient2.addColorStop(1, 'rgba(255, 255, 200, 0)');
        ctx.fillStyle = gradient2;
        ctx.beginPath(); ctx.moveTo(x + w - 10, y + 10); ctx.lineTo(x + w - 20, y - 60); ctx.lineTo(x + w + 20, y - 60); ctx.fill();
    }
    
    // Flash white when hit
    if (isPlayer && hitCooldown > 0 && Math.floor(hitCooldown / 5) % 2 === 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.fillRect(x, y, w, h);
    }
}

function drawCone(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + w/2, y); 
    ctx.lineTo(x + w, y + h); 
    ctx.lineTo(x, y + h); 
    ctx.fill();
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.moveTo(x + w/4 + 3, y + h/2);
    ctx.lineTo(x + w*3/4 - 3, y + h/2);
    ctx.lineTo(x + w*3/4 + 2, y + h/2 + 10);
    ctx.lineTo(x + w/4 - 2, y + h/2 + 10);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillRect(x - 5, y + h - 5, w + 10, 5);
}

function drawExplosion(x, y) {
    ctx.fillStyle = '#ff6600';
    ctx.beginPath();
    ctx.arc(x + player.width/2, y + player.height/2, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffff00';
    ctx.beginPath();
    ctx.arc(x + player.width/2, y + player.height/2, 25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = "bold 20px Orbitron";
    ctx.textAlign = "center";
    ctx.fillText("BAM!", x + player.width/2, y + player.height/2 + 7);
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--line-color').trim();
    for (let i = -100; i < canvas.height; i += 100) {
        ctx.fillRect(canvas.width / 2 - 5, i + linesOffset, 10, 50);
    }

    obstacles.forEach(obs => {
        if (obs.type === 'car') {
            drawCar(obs.x, obs.y, obs.width, obs.height, obs.color);
        } else {
            drawCone(obs.x, obs.y, obs.width, obs.height, obs.color);
        }
    });

    if (isVIP) {
        drawSportsCar(player.x, player.y, player.width, player.height, player.color);
    } else {
        drawCar(player.x, player.y, player.width, player.height, player.color, false, true);
    }
    
    let policeY = player.y + player.height + policeDistance;
    if (policeY < canvas.height + 50) {
        drawCar(policeX, policeY, police.width, police.height, police.color, true);
    }
}

function loop() {
    update();
    draw();
    if (isPlaying) {
        gameLoopId = requestAnimationFrame(loop);
    }
}

function startGame() {
    if (isPlaying) return;
    initGame();
    isPlaying = true;
    loop();
}

function gameOver() {
    isPlaying = false;
    gameOverTime = Date.now();
    resetToDayDone = false;
    cancelAnimationFrame(gameLoopId);
    
    isSirenOn = false;
    sendFeedback('siren_off', score);
    
    sendFeedback('crash', score);
    
    finalScoreDisplay.innerText = score;
    gameOverScreen.classList.remove('hidden');
    // Draw the car so they can see changes if they unlock VIP while dead
    draw();
}

function fetchHardwareState() {
    fetch('/api/state')
        .then(res => res.json())
        .then(data => {
            hwX = data.joystick_x;
            hwY = data.joystick_y;
            hwLight = data.light_value;
            hwButton = data.button_pressed;
            
            if (data.rfid_uid && data.rfid_uid !== "None" && data.rfid_uid !== "") {
                if (!isPlaying && data.rfid_uid !== lastRfidUid) {
                    isVIP = true;
                    vipSection.classList.remove('hidden');
                    updateVipSelection();
                }
            }
            lastRfidUid = data.rfid_uid;
            
            // Joystick Menu Navigation
            if (!vipSection.classList.contains('hidden')) {
                if (hwX < 300 && !joystickMovedX) {
                    selectedVipIndex--;
                    if (selectedVipIndex < 0) selectedVipIndex = 0;
                    joystickMovedX = true;
                    updateVipSelection();
                } else if (hwX > 700 && !joystickMovedX) {
                    selectedVipIndex++;
                    if (selectedVipIndex > colorBtns.length - 1) selectedVipIndex = colorBtns.length - 1;
                    joystickMovedX = true;
                    updateVipSelection();
                } else if (hwX >= 300 && hwX <= 700) {
                    joystickMovedX = false;
                }
                
                if (hwButton) {
                    if (!hwButtonWasPressed) {
                        vipSection.classList.add('hidden');
                        if (!isPlaying) startGame();
                    }
                    hwButtonWasPressed = true;
                } else {
                    hwButtonWasPressed = false;
                }
            } else {
                // If on start screen or game over screen, allow hardware button to start game
                if (hwButton && !hwButtonWasPressed && !isPlaying) {
                    startGame();
                }
                hwButtonWasPressed = hwButton;
            }
            
            debugX.innerText = hwX;
            debugY.innerText = hwY;
            debugLight.innerText = hwLight;
            
            if (!isPlaying && (Date.now() - gameOverTime > 1500)) {
                if (!resetToDayDone) {
                    document.body.classList.remove('night-mode');
                    modeDisplay.innerText = "DAY";
                    draw();
                    resetToDayDone = true;
                }
                
                let isNightNow = document.body.classList.contains('night-mode');
                if (hwLight < 600) {
                    if (!isNightNow) {
                        document.body.classList.add('night-mode');
                        modeDisplay.innerText = "NIGHT";
                        draw();
                    }
                }
            }
        })
        .catch(err => console.error("Error fetching state:", err));
}

function sendFeedback(event, currentScore) {
    fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: event, score: currentScore })
    }).catch(err => console.error("Error sending feedback:", err));
}

setInterval(fetchHardwareState, 50);
draw();
