let scene, camera, renderer, player, enemies = [];
let lastSpawnTime = 0;
const spawnInterval = 3000; // Spawn a new dinosaur every 3 seconds

// Add these new variables
let raycaster, mouse;
let lastShootTime = 0;
const shootCooldown = 500; // 500 ms cooldown between shots
let powerups = [];
let isSlowActive = false;
let slowEffectEndTime = 0;
const slowDuration = 5000; // 5 seconds of slow effect
const normalSpeed = 0.05;
const slowSpeed = 0.02;
let particleSystems = [];

let dinoHitCount = 0;
let reloadProgress = 0;

let moveForward = false;
let moveBackward = false;
let strafeLeft = false;
let strafeRight = false;
let rotateLeft = false;
let rotateRight = false;

let audioContext, gunSound, biteSound;

const FIELD_SIZE = 100; // Assuming the ground plane is 100x100 units

let minimapCanvas, minimapContext;

const ATTACK_INTERVAL = 1000; // 1 second between attacks
const ATTACK_RANGE = 2; // Distance at which dinosaurs stop and attack
let playerHealth = 10;
let lastAttackTimes = {}; // To track last attack time for each dinosaur

function init() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Light blue sky color

    // Create camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.y = 1.6; // Average eye height

    // Create renderer
    renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Create player
    player = new THREE.Group();
    scene.add(player);
    player.add(camera);

    // Add a simple ground
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const groundMaterial = new THREE.MeshBasicMaterial({ color: 0x90EE90 }); // Light green ground
    const grougnd = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // Add trees
    addTrees();

    // Add some basic lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(0, 1, 0);
    scene.add(directionalLight);

    // Set up mouse controls
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('click', onMouseClick);

    // Initialize raycaster and mouse vector
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // Add event listeners for keyboard controls
    document.addEventListener('keydown', onKeyDown, false);
    document.addEventListener('keyup', onKeyUp, false);

    // Initialize audio
    loadSounds();

    // Initialize minimap
    minimapCanvas = document.getElementById('minimap');
    minimapContext = minimapCanvas.getContext('2d');

    // Start game loop
    animate();

    // Initialize audio context on user interaction
    document.addEventListener('click', function initAudio() {
        audioContext.resume().then(() => {
            console.log('Audio context started');
            document.removeEventListener('click', initAudio);
        });
    }, { once: true });
}

function addTrees() {
    const treeCount = 50; // Increased number of trees
    
    for (let i = 0; i < treeCount; i++) {
        const tree = new THREE.Group();
        
        // Create trunk (brown box)
        const trunkGeometry = new THREE.BoxGeometry(1, 2, 1);
        const trunkMaterial = new THREE.MeshPhongMaterial({ color: 0x8B4513 }); // Brown color
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.y = 1; // Move trunk up by half its height
        tree.add(trunk);
        
        // Create top (larger green box)
        const topGeometry = new THREE.BoxGeometry(3, 3, 3);
        const topMaterial = new THREE.MeshPhongMaterial({ color: 0x228B22 }); // Forest green
        const top = new THREE.Mesh(topGeometry, topMaterial);
        top.position.y = 3.5; // Position on top of the trunk
        tree.add(top);
        
        // Random position
        const angle = Math.random() * Math.PI * 2;
        const radius = 10 + Math.random() * 40; // Trees between 10-50 units away
        tree.position.set(
            Math.cos(angle) * radius,
            0, // Place at ground level
            Math.sin(angle) * radius
        );

        // Random scale
        const scale = 0.5 + Math.random() * 0.5; // Scale between 0.5 and 1
        tree.scale.set(scale, scale, scale);

        // Random rotation
        tree.rotation.y = Math.random() * Math.PI * 2;

        scene.add(tree);
    }
}

function onMouseMove(event) {
    const screenWidth = window.innerWidth;
    const mouseX = event.clientX;
    const rotationSpeed = 0.05;

    // Calculate rotation based on mouse position
    if (mouseX < screenWidth / 3) {
        // Left third of the screen
        const rotationFactor = (screenWidth / 3 - mouseX) / (screenWidth / 3);
        player.rotation.y += rotationSpeed * rotationFactor;
    } else if (mouseX > (2 * screenWidth) / 3) {
        // Right third of the screen
        const rotationFactor = (mouseX - (2 * screenWidth) / 3) / (screenWidth / 3);
        player.rotation.y -= rotationSpeed * rotationFactor;
    }

    // Vertical mouse movement for camera pitch
    const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;
    camera.rotation.x -= movementY * 0.002;
    camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x));
}

function onMouseClick(event) {
    const currentTime = Date.now();
    if (currentTime - lastShootTime < shootCooldown) {
        // Still in cooldown, don't shoot
        return;
    }

    // Update last shoot time
    lastShootTime = currentTime;
    reloadProgress = 0;

    // Play gun sound
    playGunSound();

    // Update mouse position for raycaster
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;

    // Set raycaster
    raycaster.setFromCamera(mouse, camera);

    // Check for intersections with enemies
    const intersectsEnemies = raycaster.intersectObjects(enemies);

    if (intersectsEnemies.length > 0) {
        // Hit an enemy
        const hitEnemy = intersectsEnemies[0].object;
        removeEnemy(hitEnemy);
        createBulletEffect(intersectsEnemies[0].point);
        dinoHitCount++;
    } else {
        // Miss, create bullet effect at a distance
        const bulletDirection = raycaster.ray.direction.multiplyScalar(50);
        const bulletPosition = raycaster.ray.origin.add(bulletDirection);
        createBulletEffect(bulletPosition);
    }
}

function removeEnemy(enemy) {
    scene.remove(enemy);
    enemies = enemies.filter(e => e !== enemy);
}

function createBulletEffect(position) {
    const bulletGeometry = new THREE.SphereGeometry(0.1, 8, 8);
    const bulletMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
    bullet.position.copy(position);
    scene.add(bullet);

    // Remove bullet after a short time
    setTimeout(() => {
        scene.remove(bullet);
    }, 1000);
}

function spawnEnemy() {
    const geometry = new THREE.BoxGeometry(1, 2, 1); // Simple dinosaur shape
    const material = new THREE.MeshPhongMaterial({ color: isSlowActive ? 0x0000FF : 0x8B3A3A }); // Reddish-brown color
    const dinosaur = new THREE.Mesh(geometry, material);
    dinosaur.id = Math.random().toString(36).substr(2, 9); // Add a unique id

    // Spawn in front of the player
    const spawnRadius = 20 + Math.random() * 10; // Spawn between 20-30 units away
    const spawnAngle = (Math.random() - 0.5) * Math.PI / 2; // Spawn within a 90-degree arc in front of the player

    // Calculate spawn position based on player's rotation
    const playerRotation = player.rotation.y;
    dinosaur.position.set(
        player.position.x + Math.sin(playerRotation + spawnAngle) * spawnRadius,
        1, // Half the height of the dinosaur
        player.position.z + Math.cos(playerRotation + spawnAngle) * spawnRadius
    );

    // Clamp the dinosaur position to the playing field
    dinosaur.position.x = Math.max(-FIELD_SIZE/2, Math.min(FIELD_SIZE/2, dinosaur.position.x));
    dinosaur.position.z = Math.max(-FIELD_SIZE/2, Math.min(FIELD_SIZE/2, dinosaur.position.z));

    if (isSlowActive) {
        addSlowParticles(dinosaur);
    }

    scene.add(dinosaur);
    enemies.push(dinosaur);
    lastAttackTimes[dinosaur.id] = 0; // Initialize last attack time
}

function spawnPowerup() {
    const geometry = new THREE.SphereGeometry(0.5, 32, 32);
    const material = new THREE.MeshPhongMaterial({ color: 0x00ffff }); // Cyan color
    const powerup = new THREE.Mesh(geometry, material);

    // Random position on the ground
    const angle = Math.random() * Math.PI * 2;
    const radius = 10 + Math.random() * 10; // Spawn between 10-20 units away
    powerup.position.set(
        player.position.x + radius * Math.cos(angle),
        0.5, // Half the height of the powerup
        player.position.z + radius * Math.sin(angle)
    );

    scene.add(powerup);
    powerups.push(powerup);
}

function updatePowerups() {
    const playerPosition = new THREE.Vector3();
    player.getWorldPosition(playerPosition);

    powerups.forEach((powerup, index) => {
        // Rotate powerups for visual effect
        powerup.rotation.y += 0.01;

        // Check for collision with player
        if (playerPosition.distanceTo(powerup.position) < 2) { // Adjust collision distance as needed
            // Player collected the powerup
            scene.remove(powerup);
            powerups.splice(index, 1);
            activateSlowEffect();
        }
    });
}

function activateSlowEffect() {
    isSlowActive = true;
    slowEffectEndTime = Date.now() + slowDuration;
    enemies.forEach(enemy => {
        enemy.material.color.setHex(0x0000FF);
        addSlowParticles(enemy);
    });
}

function updateSlowEffect() {
    if (isSlowActive && Date.now() >= slowEffectEndTime) {
        isSlowActive = false;
        enemies.forEach(enemy => {
            enemy.material.color.setHex(0x8B3A3A); // Change back to reddish-brown
            removeSlowParticles(enemy);
        });
    }
}

function addSlowParticles(enemy) {
    const particleGeometry = new THREE.BufferGeometry();
    const particleCount = 20;
    const posArray = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount * 3; i++) {
        posArray[i] = (Math.random() - 0.5) * 2;
    }

    particleGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));

    const particleMaterial = new THREE.PointsMaterial({
        color: 0x00FFFF,
        size: 0.1,
        transparent: true,
        opacity: 0.8
    });

    const particleSystem = new THREE.Points(particleGeometry, particleMaterial);
    enemy.add(particleSystem);
    particleSystems.push({ enemy, system: particleSystem });
}

function removeSlowParticles(enemy) {
    const index = particleSystems.findIndex(ps => ps.enemy === enemy);
    if (index !== -1) {
        enemy.remove(particleSystems[index].system);
        particleSystems.splice(index, 1);
    }
}

function updateParticles() {
    particleSystems.forEach(ps => {
        const positions = ps.system.geometry.attributes.position.array;
        for (let i = 0; i < positions.length; i += 3) {
            positions[i] += (Math.random() - 0.5) * 0.01;
            positions[i + 1] += (Math.random() - 0.5) * 0.01;
            positions[i + 2] += (Math.random() - 0.5) * 0.01;
        }
        ps.system.geometry.attributes.position.needsUpdate = true;
    });
}

function updateEnemies() {
    const currentTime = Date.now();
    
    // Spawn new enemies
    if (currentTime - lastSpawnTime > spawnInterval) {
        spawnEnemy();
        lastSpawnTime = currentTime;
    }

    // Move enemies towards the player or attack
    const speed = isSlowActive ? slowSpeed : normalSpeed;
    enemies.forEach(enemy => {
        const distanceToPlayer = enemy.position.distanceTo(player.position);

        if (distanceToPlayer > ATTACK_RANGE) {
            // Move towards player
            const direction = new THREE.Vector3()
                .subVectors(player.position, enemy.position)
                .normalize();
            enemy.position.add(direction.multiplyScalar(speed));
        } else {
            // Attack player
            if (!lastAttackTimes[enemy.id] || currentTime - lastAttackTimes[enemy.id] >= ATTACK_INTERVAL) {
                attackPlayer(enemy);
                lastAttackTimes[enemy.id] = currentTime;
            }
        }

        // Make the enemy face the player
        enemy.lookAt(player.position);
    });
}

function attackPlayer(enemy) {
    playerHealth -= 1;
    console.log(`Player attacked! Health: ${playerHealth}`);
    if (playerHealth <= 0) {
        gameOver();
    }

    // Play bite sound
    playBiteSound();

    // Determine attack direction and show flashing bar
    showAttackDirection(enemy);
}

function showAttackDirection(enemy) {
    const playerDirection = new THREE.Vector3();
    player.getWorldDirection(playerDirection);
    const toEnemy = new THREE.Vector3().subVectors(enemy.position, player.position).normalize();

    const angle = playerDirection.angleTo(toEnemy);
    const cross = new THREE.Vector3().crossVectors(playerDirection, toEnemy).y;

    let directions = [];

    if (angle < Math.PI / 4) {
        // Enemy is in behind
        directions = ['bottom'];
    } else if (angle > 3 * Math.PI / 4) {
        // Enemy is front
        directions = ['top', 'left', 'right', 'bottom'];
    } else if (cross > 0) {
        // Enemy is to the right
        directions = ['right'];
    } else {
        // Enemy is to the left
        directions = ['left'];
    }

    flashAttackBars(directions);
}

function flashAttackBars(directions) {
    directions.forEach(direction => {
        const bar = document.createElement('div');
        bar.className = `attack-bar ${direction}`;
        document.body.appendChild(bar);

        bar.style.opacity = '1';
        setTimeout(() => {
            bar.style.opacity = '0';
            setTimeout(() => {
                document.body.removeChild(bar);
            }, 800);
        }, 0);
    });
}

function gameOver() {
    console.log("Game Over!");
    // Add any game over logic here (e.g., stop the game, show a message)
}

function updateHUD() {
    document.getElementById('dino-counter').textContent = `Dinos hit: ${dinoHitCount}`;
    document.getElementById('player-health').textContent = `Health: ${playerHealth}`;
    
    const reloadIndicator = document.getElementById('reload-indicator');
    const progress = (Date.now() - lastShootTime) / shootCooldown;
    reloadProgress = Math.min(progress, 1);
    
    const angle = reloadProgress * 360;
    reloadIndicator.style.background = `conic-gradient(
        #0000ff ${angle}deg, 
        #000000 ${angle}deg 360deg
    )`;
}

function onKeyDown(event) {
    switch (event.code) {
        case 'KeyS':
            moveForward = true;
            break;
        case 'KeyW':
            moveBackward = true;
            break;
        case 'KeyA':
            rotateLeft = true;
            break;
        case 'KeyD':
            rotateRight = true;
            break;
        case 'KeyQ':
            strafeLeft = true;
            break;
        case 'KeyE':
            strafeRight = true;
            break;
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'KeyS':
            moveForward = false;
            break;
        case 'KeyW':
            moveBackward = false;
            break;
        case 'KeyA':
            rotateLeft = false;
            break;
        case 'KeyD':
            rotateRight = false;
            break;
        case 'KeyQ':
            strafeLeft = false;
            break;
        case 'KeyE':
            strafeRight = false;
            break;
    }
}

function updatePlayerPosition() {
    const moveSpeed = 0.15;
    const rotateSpeed = 0.03;
    const playerDirection = new THREE.Vector3();
    player.getWorldDirection(playerDirection);

    const newPosition = player.position.clone();

    if (moveForward) {
        newPosition.add(playerDirection.multiplyScalar(moveSpeed));
    }
    if (moveBackward) {
        newPosition.sub(playerDirection.multiplyScalar(moveSpeed));
    }
    if (strafeLeft) {
        newPosition.add(playerDirection.cross(player.up).normalize().multiplyScalar(-moveSpeed));
    }
    if (strafeRight) {
        newPosition.add(playerDirection.cross(player.up).normalize().multiplyScalar(moveSpeed));
    }

    // Clamp the new position to the playing field
    newPosition.x = Math.max(-FIELD_SIZE/2, Math.min(FIELD_SIZE/2, newPosition.x));
    newPosition.z = Math.max(-FIELD_SIZE/2, Math.min(FIELD_SIZE/2, newPosition.z));

    player.position.copy(newPosition);

    if (rotateLeft) {
        player.rotation.y += rotateSpeed;
    }
    if (rotateRight) {
        player.rotation.y -= rotateSpeed;
    }
}

function loadSounds() {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    loadSound('gunshot.mp3', buffer => gunSound = buffer);
    loadSound('bite.mp3', buffer => biteSound = buffer);
}

function loadSound(url, onLoad) {
    const request = new XMLHttpRequest();
    request.open('GET', url, true);
    request.responseType = 'arraybuffer';

    request.onload = function() {
        audioContext.decodeAudioData(request.response, onLoad, function(error) {
            console.error('Error decoding sound:', error);
        });
    };
    request.send();
}

function playGunSound() {
    if (gunSound) {
        const source = audioContext.createBufferSource();
        source.buffer = gunSound;
        source.connect(audioContext.destination);
        source.start(0);
    }
}

function playBiteSound() {
    if (biteSound) {
        const source = audioContext.createBufferSource();
        source.buffer = biteSound;
        source.connect(audioContext.destination);
        source.start(0);
    }
}

function updateMinimap() {
    const mapSize = minimapCanvas.width;
    const scale = mapSize / FIELD_SIZE;

    // Clear the minimap
    minimapContext.fillStyle = '#90EE90'; // Light green background
    minimapContext.fillRect(0, 0, mapSize, mapSize);

    // Draw player (white dot)
    minimapContext.fillStyle = 'white';
    const playerX = (player.position.x + FIELD_SIZE / 2) * scale;
    const playerZ = (player.position.z + FIELD_SIZE / 2) * scale;
    minimapContext.beginPath();
    minimapContext.arc(playerX, playerZ, 3, 0, Math.PI * 2);
    minimapContext.fill();

    // Draw player direction pointer
    const pointerLength = 8; // Length of the direction pointer
    const playerAngle = player.rotation.y;
    const pointerEndX = playerX - Math.sin(playerAngle) * pointerLength;
    const pointerEndZ = playerZ - Math.cos(playerAngle) * pointerLength;

    minimapContext.strokeStyle = 'white';
    minimapContext.lineWidth = 2;
    minimapContext.beginPath();
    minimapContext.moveTo(playerX, playerZ);
    minimapContext.lineTo(pointerEndX, pointerEndZ);
    minimapContext.stroke();

    // Draw dinosaurs (red or blue dots depending on slow effect)
    enemies.forEach(enemy => {
        const enemyX = (enemy.position.x + FIELD_SIZE / 2) * scale;
        const enemyZ = (enemy.position.z + FIELD_SIZE / 2) * scale;
        
        if (isSlowActive) {
            minimapContext.fillStyle = 'blue';
        } else {
            minimapContext.fillStyle = 'red';
        }
        
        minimapContext.beginPath();
        minimapContext.arc(enemyX, enemyZ, 2, 0, Math.PI * 2);
        minimapContext.fill();
    });
}

function animate() {
    requestAnimationFrame(animate);

    updatePlayerPosition();
    updateSlowEffect();
    updateEnemies();
    updatePowerups();
    updateParticles();
    updateHUD();
    updateMinimap();

    renderer.render(scene, camera);
}

// Spawn a powerup every 10 seconds
setInterval(spawnPowerup, 10000);

init();