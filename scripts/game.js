const scene = new THREE.Scene();
const gltfLoader = new THREE.GLTFLoader();

const stats = new Stats();
stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
document.body.appendChild(stats.dom);

const textureLoader = new THREE.TextureLoader();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);








// Load shaders
const loader = new THREE.FileLoader();
let shadersLoaded = false;
let vertexShader, fragmentShader;
let blueShaderMaterial, orangeShaderMaterial;

// Load the shaders asynchronously
loader.load('shaders/PortalShaders.vert', (data) => {
    vertexShader = data;
    checkShadersLoaded();
});

loader.load('shaders/PortalShaders.frag', (data) => {
    fragmentShader = data;
    checkShadersLoaded();
});

// This function is called once both shaders are loaded
function checkShadersLoaded() {
    if (vertexShader && fragmentShader) {
        console.log('Shaders loaded');
        blueShaderMaterial = portalShaderMaterial(0x0000ff);
        orangeShaderMaterial = portalShaderMaterial(0xff7f00);
        shadersLoaded = true;
        createPortals(); // Call createPortals here, after materials are created
    }
}

// Function to create the shader material
const portalShaderMaterial = (color) => new THREE.ShaderMaterial({
    vertexShader: vertexShader,
    fragmentShader: fragmentShader,
    side: THREE.DoubleSide,
uniforms: {
    iTime: { value: 0 },
    resolution: { value: new THREE.Vector4(window.innerWidth, window.innerHeight, 1, 1) },
    portalColor: { value: new THREE.Color(color) }
},
    transparent: true
});


//Sounds
const audioLoader = new THREE.AudioLoader();
const listener = new THREE.AudioListener();
camera.add(listener); // Add the listener to the camera so audio is spatialized relative to the player

const portalGunSounds = {
    blueShoot: null,
    orangeShoot: null,
    blueOpen: null,
    orangeOpen: null
};

audioLoader.load('sounds//portalgun/shoot_blue.wav', buffer => {
    portalGunSounds.blueShoot = buffer;
});

audioLoader.load('sounds//portalgun/shoot_orange.wav', buffer => {
    portalGunSounds.orangeShoot = buffer;
});

audioLoader.load('sounds//portalgun/open_blue.wav', buffer => {
    portalGunSounds.blueOpen = buffer;
});

audioLoader.load('sounds//portalgun/open_orange.wav', buffer => {
    portalGunSounds.orangeOpen = buffer;
});



const portalSounds = {
	Portal: null,
    Enter: null,
    Exit: null,
};

audioLoader.load('sounds//portal/portal.wav', buffer => {
    portalSounds.Portal = buffer;
});

audioLoader.load('sounds//portal/portal_enter.wav', buffer => {
    portalSounds.Enter = buffer;
});

audioLoader.load('sounds//portal/portal_exit.wav', buffer => {
    portalSounds.Exit = buffer;
});

//Sounds End


const raycaster = new THREE.Raycaster();
const downVector = new THREE.Vector3(0, -1, 0);

let transformAux; // Declare globally, initialize after Ammo is loaded

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

let paused = false;
document.addEventListener('visibilitychange', () => paused = document.hidden);
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

const skyboxloader = new THREE.CubeTextureLoader();
scene.background = skyboxloader.load([
    'skybox/clouds1_east_iq8cr6.png', 'skybox/clouds1_west_gwd0gs.png', 'skybox/clouds1_up_tnxqka.png',
    'skybox/clouds1_down_p10z7n.png', 'skybox/clouds1_north_anykiq.png', 'skybox/clouds1_south_bek22d.png'
]);
scene.fog = new THREE.FogExp2(0xcccccc, 0.007);

const grassTexture = textureLoader.load('textures/grass.png');
grassTexture.wrapS = grassTexture.wrapT = THREE.RepeatWrapping;
grassTexture.repeat.set(256, 256);

const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
scene.add(ambientLight);

const Sun = new THREE.DirectionalLight(0xffffff, 1);
Sun.castShadow = true;
Sun.shadow.camera.left = -50;
Sun.shadow.camera.right = 50;
Sun.shadow.camera.top = 50;
Sun.shadow.camera.bottom = -50;
Sun.shadow.camera.near = 1;
Sun.shadow.camera.far = 300;
Sun.shadow.mapSize.set(4096, 4096);
Sun.shadow.bias = 0.00005;
Sun.shadow.normalBias = 0.02;
scene.add(Sun);

let physicsWorld, player;
const clock = new THREE.Clock();

let yaw = 0;
let pitch = 0;
const keys = {};
let playerPosition = new THREE.Vector3(); // Used for camera, updated from physics

let isJumping = false;


window.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
        shootPortal('blue'); // Left click
    } else if (event.button === 2) {
        shootPortal('orange'); // Right click
    }
});

window.addEventListener('contextmenu', e => e.preventDefault());


window.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    if (["w", "a", "s", "d", "arrowup", "arrowleft", "arrowdown", "arrowright", " "].includes(e.key.toLowerCase())) {
        e.preventDefault();
    }
});

window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

renderer.domElement.addEventListener('click', () => {
    renderer.domElement.requestPointerLock();
});

document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === renderer.domElement) {
        document.addEventListener('mousemove', onMouseMove);
    } else {
        document.removeEventListener('mousemove', onMouseMove);
    }
});

function onMouseMove(event) {
    const sensitivity = 0.002;
    yaw -= event.movementX * sensitivity;
    pitch -= event.movementY * sensitivity;
    pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
}

Ammo().then(() => {
    transformAux = new Ammo.btTransform(); // Initialize transformAux HERE
    initPhysics();
    createGround();
    //createMap(); // Consider if map needs physics bodies
    createRoom();
    createPlayer();
    createPortals();
    animate();
});

function initPhysics() {
    const config = new Ammo.btDefaultCollisionConfiguration();
    const dispatcher = new Ammo.btCollisionDispatcher(config);
    const broadphase = new Ammo.btDbvtBroadphase();
    const solver = new Ammo.btSequentialImpulseConstraintSolver();
    physicsWorld = new Ammo.btDiscreteDynamicsWorld(dispatcher, broadphase, solver, config);
    physicsWorld.setGravity(new Ammo.btVector3(0, -19.81, 0)); // Standard gravity
}

function createGround() {
    const size = 265, thickness = 3; // Ground slightly thicker for robustness
    const shape = new Ammo.btBoxShape(new Ammo.btVector3(size / 2, thickness / 2, size / 2));
    const transform = new Ammo.btTransform();
    transform.setIdentity();
    transform.setOrigin(new Ammo.btVector3(0, 0, 0)); // Center ground at y=0 or slightly below
    const motionState = new Ammo.btDefaultMotionState(transform);
    const rbInfo = new Ammo.btRigidBodyConstructionInfo(0, motionState, shape, new Ammo.btVector3(0, 0, 0)); // Mass 0 for static
    const groundBody = new Ammo.btRigidBody(rbInfo);
    physicsWorld.addRigidBody(groundBody);

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, thickness, size), new THREE.MeshStandardMaterial({ map: grassTexture }));
    mesh.position.y = -thickness / 2;
    mesh.receiveShadow = true;
    scene.add(mesh);
    // Store rigid body with mesh if needed for raycasting, though ground is often special-cased
    mesh.userData.rigidBody = groundBody;
}

function createMap() {
    gltfLoader.load('models/map.glb', gltf => {
        const map = gltf.scene;
        map.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true; // Or false, depending on effect
                child.receiveShadow = true;

                // TODO: Add physics for map colliders if your map.glb isn't just visual
                // This often involves creating Ammo.btBvhTriangleMeshShape from geometry
                // For simplicity, this example doesn't make the GLTF model a physics object.
                // If you need map collision, you'll need to add rigid bodies for its parts.
            }
        });
        //scene.add(map);
    });
}


function createRoom() {
    const roomSize = 10;
    const wallHeight = 15;
    const wallThickness = 0.1;

    const textureLoader = new THREE.TextureLoader();

    const floorTexture = textureLoader.load('textures/floor.png');
    const ceilingTexture = textureLoader.load('textures/ceiling.png');
    const wallTexture = textureLoader.load('textures/wall.png');

    // Set the repeating factor for the textures
    const floorRepeatX = 16; // Repeat the texture 4 times along the width
    const floorRepeatZ = 16; // Repeat the texture 4 times along the depth
    floorTexture.wrapS = THREE.RepeatWrapping;
    floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(floorRepeatX, floorRepeatZ);

    const ceilingRepeatX = 16;
    const ceilingRepeatZ = 16;
    ceilingTexture.wrapS = THREE.RepeatWrapping;
    ceilingTexture.wrapT = THREE.RepeatWrapping;
    ceilingTexture.repeat.set(ceilingRepeatX, ceilingRepeatZ);

    const wallRepeatX = 16; // Repeat once along the width (height of the wall)
    const wallRepeatY = 6; // Repeat 4 times along the height (length of the wall)
    wallTexture.wrapS = THREE.RepeatWrapping;
    wallTexture.wrapT = THREE.RepeatWrapping;
    wallTexture.repeat.set(wallRepeatY, wallRepeatX); // Note the order here due to wall orientation

    const wallMaterial = new THREE.MeshStandardMaterial({ map: wallTexture, side: THREE.DoubleSide });
    const floorMaterial = new THREE.MeshStandardMaterial({ map: floorTexture, side: THREE.DoubleSide });
    const ceilingMaterial = new THREE.MeshStandardMaterial({ map: ceilingTexture, side: THREE.DoubleSide });

    // Function to create a wall (mesh and physics body)
    const createWall = (width, height, depth, position) => {
        const geometry = new THREE.BoxGeometry(width, height, depth);
        const mesh = new THREE.Mesh(geometry, wallMaterial);
        mesh.position.copy(position);
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        scene.add(mesh);

        // Ammo.js physics
        const shape = new Ammo.btBoxShape(new Ammo.btVector3(width / 2, height / 2, depth / 2));
        const transform = new Ammo.btTransform();
        transform.setIdentity();
        transform.setOrigin(new Ammo.btVector3(position.x, position.y, position.z));
        const motionState = new Ammo.btDefaultMotionState(transform);
        const rbInfo = new Ammo.btRigidBodyConstructionInfo(0, motionState, shape, new Ammo.btVector3(0, 0, 0)); // Mass 0 for static
        const body = new Ammo.btRigidBody(rbInfo);
        physicsWorld.addRigidBody(body);
        mesh.userData.rigidBody = body; // Optional: Store rigid body with mesh for potential later use
    };

    // Function to create the floor and ceiling (mesh and physics body)
    const createFloorOrceiling = (width, height, depth, position, material) => {
        const geometry = new THREE.BoxGeometry(width, height, depth);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(position);
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        scene.add(mesh);

        // Ammo.js physics
        const shape = new Ammo.btBoxShape(new Ammo.btVector3(width / 2, height / 2, depth / 2));
        const transform = new Ammo.btTransform();
        transform.setIdentity();
        transform.setOrigin(new Ammo.btVector3(position.x, position.y, position.z));
        const motionState = new Ammo.btDefaultMotionState(transform);
        const rbInfo = new Ammo.btRigidBodyConstructionInfo(0, motionState, shape, new Ammo.btVector3(0, 0, 0)); // Mass 0 for static
        const body = new Ammo.btRigidBody(rbInfo);
        physicsWorld.addRigidBody(body);
        mesh.userData.rigidBody = body; // Optional
    };

    // Create the four walls
    createWall(roomSize, wallHeight, wallThickness, new THREE.Vector3(0, wallHeight / 2, roomSize / 2)); // Front
    //createWall(roomSize, wallHeight, wallThickness, new THREE.Vector3(0, wallHeight / 2, -roomSize / 2)); // Back
    createWall(wallThickness, wallHeight, roomSize, new THREE.Vector3(-roomSize / 2, wallHeight / 2, 0)); // Left
    createWall(wallThickness, wallHeight, roomSize, new THREE.Vector3(roomSize / 2, wallHeight / 2, 0)); // Right

    // Create the ceiling
    createFloorOrceiling(roomSize, wallThickness, roomSize, new THREE.Vector3(0, wallHeight + wallThickness / 2, 0), ceilingMaterial);

    // Create the floor
    createFloorOrceiling(roomSize, wallThickness, roomSize, new THREE.Vector3(0, +wallThickness / 2, 0), floorMaterial);
}

function createPlayer() {
    const playerRadius = 0.5; // Keep radius as a constant or make it a variable too
    const playerHeight = 2.0; // Define the desired height of the player
    const capsuleCylinderHeight = playerHeight - 2 * playerRadius;
    const finalCylinderHeight = Math.max(0, capsuleCylinderHeight);

    // Create a capsule shape for Ammo.js (physics)
    const shape = new Ammo.btCapsuleShape(playerRadius, finalCylinderHeight);

    const transform = new Ammo.btTransform();
    transform.setIdentity();
    transform.setOrigin(new Ammo.btVector3(0, playerHeight / 2, 0)); // Align center of capsule with y = playerHeight / 2
    const motionState = new Ammo.btDefaultMotionState(transform);

    const localInertia = new Ammo.btVector3(0, 0, 0);
    shape.calculateLocalInertia(1, localInertia);

    const rbInfo = new Ammo.btRigidBodyConstructionInfo(1, motionState, shape, localInertia);
    const rigidBody = new Ammo.btRigidBody(rbInfo);
    rigidBody.setActivationState(4); // Disable deactivation
    rigidBody.setAngularFactor(new Ammo.btVector3(0, 0, 0)); // Prevent rotation

    physicsWorld.addRigidBody(rigidBody);

    // Create an empty THREE.Object3D to represent the player visually
    player = new THREE.Object3D();
    player.userData = { rigidBody: rigidBody, height: playerHeight, radius: playerRadius }; // Store physics body and dimensions

    scene.add(player); // Add the empty object to the scene
}




function createAmmoShapeFromMesh(mesh) {
    const geometry = mesh.geometry;
    if (!geometry || !geometry.attributes.position) return null;

    const vertices = geometry.attributes.position.array;
    const index = geometry.index ? geometry.index.array : null;
    const triangleMesh = new Ammo.btTriangleMesh();

    // create the triangle mesh from geometry's indices
    for (let i = 0; i < (index ? index.length : vertices.length / 3); i += 3) {
        const idx0 = index ? index[i] * 3 : i * 3;
        const idx1 = index ? index[i + 1] * 3 : (i + 1) * 3;
        const idx2 = index ? index[i + 2] * 3 : (i + 2) * 3;

        const v0 = new Ammo.btVector3(vertices[idx0], vertices[idx0 + 1], vertices[idx0 + 2]);
        const v1 = new Ammo.btVector3(vertices[idx1], vertices[idx1 + 1], vertices[idx1 + 2]);
        const v2 = new Ammo.btVector3(vertices[idx2], vertices[idx2 + 1], vertices[idx2 + 2]);

        triangleMesh.addTriangle(v0, v1, v2, true);
    }

    const shape = new Ammo.btBvhTriangleMeshShape(triangleMesh, true, true);
    return shape;
}

const playerHalfHeight = 0.9; // Approximate, will be updated dynamically
let playerRadiusPhysics = 0.5;

let portalGun;

gltfLoader.load(
    'models/PortalGun.glb',
    (gltf) => {
        portalGun = gltf.scene; // Set the portalGun to the loaded model

        // Make sure the model casts and receives shadows
        portalGun.traverse(function (object) {
            if (object.isMesh) {
                object.castShadow = true;  // Cast shadows
                object.receiveShadow = true; // Receive shadows
            }
        });

        scene.add(portalGun); // Add the portal gun to the scene
        portalGun.scale.set(1, 1, 1); // Adjust scale if necessary
        portalGun.position.set(0, 0, 0); // Initial position, will be updated in the animate function
    },
    undefined, // Optional: Function called when download progresses
    (error) => {
        console.error('Error loading the .glb model:', error);
    }
);








let bluePortal, orangePortal;
const bluePortalCamera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
const orangePortalCamera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);

const blueRenderTarget = new THREE.WebGLRenderTarget(512, 1024);
const orangeRenderTarget = new THREE.WebGLRenderTarget(512, 1024);

// Shader Material (Loaded previously)
let portalMaterial;

let portalsCreated = 0; // Counter to track the number of portals created

function createPortals() {
    const innerRadius = 3;
    const outerRadius = 3.1;
    const segments = 32;

    // Geometry for the inner portal area
    const innerGeometry = new THREE.CircleGeometry(innerRadius, segments);

    // Base color materials (double-sided)
    const blueInnerMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff, side: THREE.DoubleSide });
    const orangeInnerMaterial = new THREE.MeshBasicMaterial({ color: 0xff7f00, side: THREE.DoubleSide });

    // Slightly offset shader layer to prevent Z-fighting (optional but recommended)
    const blueInner = new THREE.Group();
    const blueBase = new THREE.Mesh(innerGeometry, blueInnerMaterial);
    const blueOverlay = new THREE.Mesh(innerGeometry, blueShaderMaterial); // Use the original material
    blueOverlay.renderOrder = 1;
    blueOverlay.position.z = 0.001; // small offset to avoid flicker
    blueInner.add(blueBase);
    blueInner.add(blueOverlay);

    const orangeInner = new THREE.Group();
    const orangeBase = new THREE.Mesh(innerGeometry, orangeInnerMaterial);
    const orangeOverlay = new THREE.Mesh(innerGeometry, orangeShaderMaterial); // Use the original material
    orangeOverlay.renderOrder = 1;
    orangeOverlay.position.z = 0.001;
    orangeInner.add(orangeBase);
    orangeInner.add(orangeOverlay);

    // Geometry and materials for the borders
    const borderGeometry = new THREE.RingGeometry(innerRadius, outerRadius, segments);
    const blueBorderMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff, side: THREE.DoubleSide });
    const orangeBorderMaterial = new THREE.MeshBasicMaterial({ color: 0xffa500, side: THREE.DoubleSide });

    // Group for the full blue portal
    bluePortal = new THREE.Group();
    const blueBorder = new THREE.Mesh(borderGeometry, blueBorderMaterial);
    bluePortal.add(blueInner);
    bluePortal.add(blueBorder);
    bluePortal.scale.set(0.3, 0.5, 0.5);
    bluePortal.visible = false;
    scene.add(bluePortal);

    // Group for the full orange portal
    orangePortal = new THREE.Group();
    const orangeBorder = new THREE.Mesh(borderGeometry, orangeBorderMaterial);
    orangePortal.add(orangeInner);
    orangePortal.add(orangeBorder);
    orangePortal.scale.set(0.3, 0.5, 0.5);
    orangePortal.visible = false;
    scene.add(orangePortal);
}


function shootPortal(color) {
    if (!portalGunSounds[color + 'Shoot'] || !portalGunSounds[color + 'Open']) return; // Don't play if sounds aren't loaded

    // Play the shooting sound
    const shootSound = new THREE.Audio(listener);
    shootSound.setBuffer(portalGunSounds[color + 'Shoot']);
    shootSound.setVolume(0.5); // Adjust volume as needed
    shootSound.play();

    raycaster.setFromCamera({ x: 0, y: 0 }, camera); // center of screen
    const intersects = raycaster.intersectObjects(scene.children, true);

    if (intersects.length > 0) {
        const hit = intersects[0];
        if (hit.object === player || hit.object === portalGun) return;

        const portal = color === 'blue' ? bluePortal : orangePortal;
        const otherPortal = color === 'blue' ? orangePortal : bluePortal;
        const hitPoint = hit.point.clone();
        const distance = camera.position.distanceTo(hitPoint);
        const deploymentTime = Math.min(4.0, distance / 15); // Adjust divisor for speed

        // Align portal to surface normal
        const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
        const worldNormal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
        const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), worldNormal);
        const offset = 0.01;
        const offsetPosition = worldNormal.clone().multiplyScalar(offset);
        const finalPosition = hitPoint.clone().add(offsetPosition);

        // Prevent overlapping
        if (otherPortal.visible && finalPosition.distanceTo(otherPortal.position) < 1.5) return;

        // Prevent placing on the same surface facing the same direction as the other portal
        if (otherPortal.visible) {
            const otherNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(otherPortal.quaternion);
            const dot = worldNormal.dot(otherNormal);
            if (dot > 0.95 && finalPosition.distanceTo(otherPortal.position) < 2.0) return;
        }

        // Initialize portal placement and animation
        portal.position.copy(finalPosition);
        portal.quaternion.copy(quaternion);
        portal.visible = true;
        portal.scale.set(0.1, 0.1, 0.1); // Start small
        portal.userData.scaleTarget = new THREE.Vector3(0.3, 0.5, 0.5); // Target scale
        portal.userData.scaleSpeed = new THREE.Vector3().copy(portal.userData.scaleTarget).sub(portal.scale).divideScalar(deploymentTime);
        portal.userData.deploymentProgress = 0;
        portal.userData.isDeploying = true;
        portal.userData.openSoundPlayed = false; // Flag to play open sound once
        portal.userData.color = color;

        // Play the portal open sound with a slight delay based on the shoot sound duration
        if (portalGunSounds[color + 'Shoot']) {
            const shootSoundDuration = getAudioBufferDuration(portalGunSounds[color + 'Shoot']);
            setTimeout(() => {
                if (portal.visible && !portal.userData.openSoundPlayed) {
                    const openSound = new THREE.Audio(listener);
                    openSound.setBuffer(portalGunSounds[color + 'Open']);
                    openSound.setVolume(0.7);
                    openSound.play();
                    portal.userData.openSoundPlayed = true;
                }
            }, shootSoundDuration * 1000 * 0.9); // Play slightly before the end
        }
    }
}

// Helper function to get the duration of an AudioBuffer
function getAudioBufferDuration(buffer) {
    return buffer ? buffer.duration : 0;
}

function updatePortalMaterials() {
    if (bluePortal.visible && orangePortal.visible) {
        // Blue portal sees through to the orange portal
        if (bluePortal.children[0] && bluePortal.children[0].children[0]) {
            const blueInnerBaseMesh = bluePortal.children[0].children[0];
            blueInnerBaseMesh.material.map = orangeRenderTarget.texture;
            blueInnerBaseMesh.material.needsUpdate = true;
        }

        // Orange portal sees through to the blue portal
        if (orangePortal.children[0] && orangePortal.children[0].children[0]) {
            const orangeInnerBaseMesh = orangePortal.children[0].children[0];
            orangeInnerBaseMesh.material.map = blueRenderTarget.texture;
            orangeInnerBaseMesh.material.needsUpdate = true;
        }
    }
}





// In the animate() function, render portal cameras
function renderPortalViews() {
    // Render the blue portal's view to the blueRenderTarget
    bluePortalCamera.position.copy(bluePortal.position);
    bluePortalCamera.rotation.copy(bluePortal.rotation);
    renderer.setRenderTarget(blueRenderTarget);
    renderer.render(scene, bluePortalCamera);

    // Render the orange portal's view to the orangeRenderTarget
    orangePortalCamera.position.copy(orangePortal.position);
    orangePortalCamera.rotation.copy(orangePortal.rotation);
    renderer.setRenderTarget(orangeRenderTarget);
    renderer.render(scene, orangePortalCamera);

    // Reset the render target to the default framebuffer (for normal scene rendering)
    renderer.setRenderTarget(null);
}


let isPlayerInTransition = false;
const teleportCooldown = 100; // Increase cooldown to ensure there's a delay
const exitPortalOffset = 1; // Increase offset to ensure the player doesn't get sucked back
let lastTeleportTime = 0;
const halfPi = Math.PI; // Represents 180 degrees in radians

function teleportPlayerAdvanced(fromPortal, toPortal) {
    // Prevent teleportation if in transition or the cooldown is active
    if (isPlayerInTransition || !player || !player.userData.rigidBody || (Date.now() - lastTeleportTime < teleportCooldown)) return;
	

	// Play the portal enter sound
    const portalSound = new THREE.Audio(listener);
    portalSound.setBuffer(portalSounds['Portal']);
    portalSound.setVolume(0.5); // Adjust volume as needed
    portalSound.play();

    isPlayerInTransition = true;
    lastTeleportTime = Date.now();

    const playerBody = player.userData.rigidBody;
    const currentVelocity = new THREE.Vector3(playerBody.getLinearVelocity().x(), playerBody.getLinearVelocity().y(), playerBody.getLinearVelocity().z());

    // 1. Get player's world position and quaternion
    const playerWorldPosition = new THREE.Vector3();
    player.getWorldPosition(playerWorldPosition);
    const playerWorldQuaternion = new THREE.Quaternion();
    player.getWorldQuaternion(playerWorldQuaternion);

    // 2. Calculate the transform from the entering portal to the world
    const fromPortalWorldMatrix = new THREE.Matrix4().compose(fromPortal.position, fromPortal.quaternion, fromPortal.scale);
    const fromPortalWorldInverse = new THREE.Matrix4().copy(fromPortalWorldMatrix).invert();

    // 3. Transform the player's world position and quaternion into the local space of the entering portal
    const playerLocalPosition = playerWorldPosition.clone().applyMatrix4(fromPortalWorldInverse);
    const playerLocalQuaternion = playerWorldQuaternion.clone().premultiply(fromPortal.quaternion.clone().invert());

    // 4. Calculate the transform from the exiting portal to the world
    const toPortalWorldMatrix = new THREE.Matrix4().compose(toPortal.position, toPortal.quaternion, toPortal.scale);

    // 5. Transform the player's local position from the entering portal's space to the exiting portal's world space
    const newPlayerWorldPosition = playerLocalPosition.clone().applyMatrix4(toPortalWorldMatrix);

    // 6. Calculate the relative rotation between the portals
    const relativeRotation = new THREE.Quaternion().multiplyQuaternions(toPortal.quaternion, fromPortal.quaternion.clone().invert());

    // 7. Apply the relative rotation to the player's world quaternion
    let newPlayerWorldQuaternion = playerWorldQuaternion.clone().multiply(relativeRotation);

    // 8. Apply an additional 180-degree rotation around the Y-axis to correct yaw
    const rotationCorrection = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    newPlayerWorldQuaternion.multiply(rotationCorrection);

    // 9. Apply the relative rotation and reverse the velocity direction
    const newVelocity = currentVelocity.clone().applyQuaternion(relativeRotation).multiplyScalar(-1);

    // 10. Extract the Euler angles from the relative rotation (before the correction for yaw adjustment)
    const relativeEuler = new THREE.Euler().setFromQuaternion(relativeRotation, 'YXZ');

    // 11. Apply the change in yaw to the player's current yaw
    yaw += relativeEuler.y + Math.PI; // Add PI (180 degrees) to the yaw

    // 12. Set the new world transform for the player's physics body
    const newTransform = new Ammo.btTransform();
    newTransform.setIdentity();
    newTransform.setOrigin(new Ammo.btVector3(newPlayerWorldPosition.x, newPlayerWorldPosition.y, newPlayerWorldPosition.z));
    newTransform.setRotation(new Ammo.btQuaternion(newPlayerWorldQuaternion.x, newPlayerWorldQuaternion.y, newPlayerWorldQuaternion.z, newPlayerWorldQuaternion.w));
    playerBody.setWorldTransform(newTransform);
    playerBody.getMotionState().setWorldTransform(newTransform);

    // 13. Set the new velocity
    playerBody.setLinearVelocity(new Ammo.btVector3(newVelocity.x, newVelocity.y, newVelocity.z));
    playerBody.setAngularVelocity(new Ammo.btVector3(0, 0, 0)); // Reset angular velocity
    playerBody.activate();

    // 14. Update the Three.js mesh position and rotation directly
    player.position.copy(newPlayerWorldPosition);
    player.quaternion.copy(newPlayerWorldQuaternion);

    // Apply a small offset in the direction of the exit portal's normal to prevent immediate re-entry
    const exitNormalWorld = new THREE.Vector3(0, 0, 1).applyQuaternion(toPortal.quaternion).normalize();
    player.position.add(exitNormalWorld.multiplyScalar(exitPortalOffset));



    // Reset cooldown after the teleportation is complete
    setTimeout(() => {
        isPlayerInTransition = false;

    }, teleportCooldown);
}



function animate() {
    stats.begin();
    requestAnimationFrame(animate);
    const deltaTime = Math.min(clock.getDelta(), 0.05); // Cap delta time
    if (paused) {
        stats.end();
        return;
    }

	
	

    if (shadersLoaded) {
        // Update iTime uniformly for animation
        blueShaderMaterial.uniforms.iTime.value = clock.getElapsedTime() / 8;
        orangeShaderMaterial.uniforms.iTime.value = clock.getElapsedTime() / 8;
    }



	updatePortalMaterials();

function updatePortalCamera(fromPortal, toPortal, portalCamera) {
    if (!fromPortal.visible || !toPortal.visible) return;

    // Set the portal camera's position to the 'fromPortal's position
    portalCamera.position.copy(fromPortal.position);

    // Calculate the world position of the 'toPortal'
    const toPortalWorldPosition = new THREE.Vector3();
    toPortal.getWorldPosition(toPortalWorldPosition);

    // Make the 'portalCamera' look at the world position of the 'toPortal'
    portalCamera.lookAt(toPortalWorldPosition);

    // Correct for the relative orientation between the portals
    const fromPortalRotation = new THREE.Quaternion();
    fromPortal.getWorldQuaternion(fromPortalRotation);

    // Apply the rotation to the portal camera
    portalCamera.rotation.setFromQuaternion(fromPortalRotation);

    // Rotate the camera 180 degrees around the Y-axis to adjust the view
    portalCamera.rotateY(Math.PI);  // Rotates the camera 180 degrees (π radians)
}



    // Update portal camera views BEFORE rendering to the targets
    updatePortalCamera(bluePortal, orangePortal, orangePortalCamera);
    updatePortalCamera(orangePortal, bluePortal, bluePortalCamera);

    let originalBlueMap, originalOrangeMap;

if (bluePortal && bluePortal.children[0] && bluePortal.children[0].children[0]) {
    const blueInnerBaseMesh = bluePortal.children[0].children[0];
    originalBlueMap = blueInnerBaseMesh.material.map;
    blueInnerBaseMesh.material.map = null;
    blueInnerBaseMesh.material.color.set(0x0000b3); // Fallback color
    blueInnerBaseMesh.material.needsUpdate = true;
}

if (orangePortal && orangePortal.children[0] && orangePortal.children[0].children[0]) {
    const orangeInnerBaseMesh = orangePortal.children[0].children[0];
    originalOrangeMap = orangeInnerBaseMesh.material.map;
    orangeInnerBaseMesh.material.map = null;
    orangeInnerBaseMesh.material.color.set(0xcc8400); // Fallback color
    orangeInnerBaseMesh.material.needsUpdate = true;
}

if (bluePortal.visible && orangePortal.visible) {
    // Render to Orange Render Target (view through blue portal)
    renderer.setRenderTarget(orangeRenderTarget);
    renderer.render(scene, bluePortalCamera);

    // Render to Blue Render Target (view through orange portal)
    renderer.setRenderTarget(blueRenderTarget);
    renderer.render(scene, orangePortalCamera);

    // Reset Render Target
    renderer.setRenderTarget(null);

    // Update Portal Materials with Render Target Textures
    if (bluePortal.children[0] && bluePortal.children[0].children[0]) {
        const blueInnerBaseMesh = bluePortal.children[0].children[0];
        blueInnerBaseMesh.material.map = orangeRenderTarget.texture;
        blueInnerBaseMesh.material.color.set(0xffffff); // Default texture color
        blueInnerBaseMesh.material.needsUpdate = true;
    }

    if (orangePortal.children[0] && orangePortal.children[0].children[0]) {
        const orangeInnerBaseMesh = orangePortal.children[0].children[0];
        orangeInnerBaseMesh.material.map = blueRenderTarget.texture;
        orangeInnerBaseMesh.material.color.set(0xffffff); // Default texture color
        orangeInnerBaseMesh.material.needsUpdate = true;
    }
}



      const portalEnterDistance = 0.01;

const updatePortalScale = (portal, deltaTime) => {
    if (portal && portal.userData.isDeploying) {
        portal.scale.add(new THREE.Vector3().copy(portal.userData.scaleSpeed).multiplyScalar(deltaTime));
        portal.userData.deploymentProgress += deltaTime;

        // Ensure we don't overshoot the target scale
        if (portal.userData.deploymentProgress >= Math.min(2.0, camera.position.distanceTo(portal.position) / 15)) {
            portal.scale.copy(portal.userData.scaleTarget);
            portal.userData.isDeploying = false;
            portalsCreated++;

            // Play the portal open sound
            if (!portal.userData.openSoundPlayed && portal.userData.color && portalGunSounds[portal.userData.color + 'Open']) {
                const openSound = new THREE.Audio(listener);
                openSound.setBuffer(portalGunSounds[portal.userData.color + 'Open']);
                openSound.setVolume(0.5);
                openSound.play();
                portal.userData.openSoundPlayed = true;
            }

            // If both portals are created, update their materials
            if (portalsCreated === 2) {
                updatePortalMaterials();
            }
        }
    }
};


    updatePortalScale(bluePortal, deltaTime);
    updatePortalScale(orangePortal, deltaTime);
	

    if (bluePortal.visible && orangePortal.visible && player && player.userData.rigidBody) {
        const playerWorldPosition = new THREE.Vector3();
        player.getWorldPosition(playerWorldPosition);

const checkPortalEntry = (portal) => {
    if (!portal.visible) return false;

    const playerWorldPosition = new THREE.Vector3();
    player.getWorldPosition(playerWorldPosition);

    const portalNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(portal.quaternion).normalize();
    const playerToPortal = new THREE.Vector3().subVectors(portal.position, playerWorldPosition);
    const distanceAlongNormal = playerToPortal.dot(portalNormal);

    const lateralDistanceSquared = playerToPortal.clone().projectOnPlane(portalNormal).lengthSq();
    const portalRadiusSquared = 3 * 0.5 * 3 * 0.3; // Approximate

    const playerRadiusCheck = Math.max(player.userData.radius, player.userData.height / 2);
    const isCloseLateral = lateralDistanceSquared < (3 * 0.5 + playerRadiusCheck) * (3 * 0.3 + playerRadiusCheck);

    // Special handling for ground portals (normal close to (0, 1, 0))
    const upVector = new THREE.Vector3(0, 1, 0);
    const normalDotUp = Math.abs(portalNormal.dot(upVector));

    if (normalDotUp > 0.9) { // Portal is mostly horizontal
        const playerBottomY = playerWorldPosition.y - player.userData.height / 2;
        const portalTopY = portal.position.y + 0.5 * 0.5 * 3;
        const portalBottomY = portal.position.y - 0.5 * 0.5 * 3;
        const verticalOverlap = (playerBottomY >= portalBottomY && playerBottomY <= portalTopY);
        return isCloseLateral && verticalOverlap;
    } else {
        return distanceAlongNormal > -playerRadiusCheck && distanceAlongNormal < portalEnterDistance && isCloseLateral;
    }
};


        if (checkPortalEntry(bluePortal)) {
            teleportPlayerAdvanced(bluePortal, orangePortal);
        } else if (checkPortalEntry(orangePortal)) {
            teleportPlayerAdvanced(orangePortal, bluePortal);
        }
    }


    if (portalGun) {
        // Set the portal gun's scale
        portalGun.scale.set(1, 1, 1);

        // Define the offset relative to the camera's local axes
        const handOffset = new THREE.Vector3(0.5, -0.4, -0.5);

        // Create a Quaternion from the camera's rotation (yaw and pitch)
        const cameraRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));

        // Clone the hand offset and apply the camera's rotation to it
        const rotatedOffset = handOffset.clone().applyQuaternion(cameraRotation);

        // Set the portal gun's world position by adding the rotated offset to the camera's world position
        portalGun.position.copy(camera.position).add(rotatedOffset);

        // **Corrected Rotation:** Set the portal gun's quaternion to match the camera's quaternion
        portalGun.quaternion.copy(camera.quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)));
    }


    // Update physics world
    if (physicsWorld && player && player.userData.rigidBody) {
        const playerBody = player.userData.rigidBody;

        // --- Ground Check (Raycast) ---
        let isGrounded = false;
        const rayStart = new Ammo.btVector3();
        const rayEnd = new Ammo.btVector3();

        playerBody.getMotionState().getWorldTransform(transformAux);
        const pOrigin = transformAux.getOrigin();

        // Raycast downwards from slightly inside the player's bottom
        rayStart.setValue(pOrigin.x(), pOrigin.y() - player.userData.radius * 0.9, pOrigin.z());
        rayEnd.setValue(pOrigin.x(), pOrigin.y() - player.userData.height / 2 - 0.1, pOrigin.z()); // Raycast to the bottom

        const rayCallback = new Ammo.ClosestRayResultCallback(rayStart, rayEnd);
        physicsWorld.rayTest(rayStart, rayEnd, rayCallback);

        if (rayCallback.hasHit()) {
            const hitObject = Ammo.btRigidBody.prototype.upcast(rayCallback.get_m_collisionObject());
            if (hitObject && hitObject !== playerBody) { // Make sure it's not hitting itself
                isGrounded = true;
                isJumping = false; // Reset jumping flag when grounded
            }
        }
        Ammo.destroy(rayCallback); // Clean up Ammo object
        Ammo.destroy(rayStart);
        Ammo.destroy(rayEnd);


        // --- Player Input and Movement ---
        const moveDirection = new THREE.Vector3();
        if (keys['w']) moveDirection.z -= 1;
        if (keys['s']) moveDirection.z += 1;
        if (keys['a']) moveDirection.x -= 1;
        if (keys['d']) moveDirection.x += 1;

        // Apply camera yaw to movement direction
        moveDirection.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        moveDirection.normalize();

        const moveSpeed = keys['shift'] ? 10 : 5; // Adjusted speeds
        const currentVelocity = playerBody.getLinearVelocity();
        const desiredVelocity = new Ammo.btVector3(moveDirection.x * moveSpeed, currentVelocity.y(), moveDirection.z * moveSpeed);

        if (keys[' '] && isGrounded && !isJumping) {
            isJumping = true;
            const jumpStrength = 8; // Adjust jump force
            // Apply impulse directly upwards, overriding Y velocity for that instant
            desiredVelocity.setY(jumpStrength);
            playerBody.activate(); // Ensure body is active to receive impulse
        }

        playerBody.setLinearVelocity(desiredVelocity);
        playerBody.activate(); // Keep body active while moving

        // --- Step Physics World ---
        physicsWorld.stepSimulation(deltaTime, 10);

        // --- Update THREE.js Player Mesh from Physics Body ---
        const ms = playerBody.getMotionState();
        if (ms) {
            ms.getWorldTransform(transformAux);
            const p = transformAux.getOrigin();
            const q = transformAux.getRotation(); // Physics rotation (player capsule won't rotate visually usually)
            player.position.set(p.x(), p.y() - player.userData.height / 2, p.z()); // Adjust visual mesh to align with capsule bottom
            // player.quaternion.set(q.x(), q.y(), q.z(), q.w()); // Usually not needed for FPS player capsule

            playerPosition.set(p.x(), p.y(), p.z()); // Update playerPosition for camera logic
        }
    }

    // Update camera (first person)
    // Camera position should be at the "head" of the capsule.
    const cameraHeightOffset = player.userData.height * 0.4; // Adjust to eye level
    camera.position.set(
        playerPosition.x,
        playerPosition.y - cameraHeightOffset / 2,
        playerPosition.z
    );

    const camQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    camera.quaternion.copy(camQuat);

    // Update Sun position relative to player (simple follow)
    Sun.position.set(playerPosition.x - 15, playerPosition.y + 90, playerPosition.z - 30);
    Sun.target.position.copy(playerPosition);
    Sun.target.updateMatrixWorld(); // Important for directional light target

    renderer.render(scene, camera);
    stats.end();
}

