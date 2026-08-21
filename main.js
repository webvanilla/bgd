import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xFFFFFF);

// -------------------------------------------------
// Global state for the "danger" animation
// -------------------------------------------------
let cabinetModel = null; // will hold the GLTF root once loaded
let dangerMode = false;
let dangerStart = 0;
const dangerDuration = 3000; // ms the cabinet flies across the screen
let cabinetStartX = 0;
let cabinetStartY = 0;
let cabinetTargetX = 0;
let returnMode = false;
let returnStart = 0;
let cabinetOriginalRotationY = 0;
let cabinetTargetRotationY = 0; // target rotation during danger (randomized)
let cabinetOriginalPos = new THREE.Vector3(); // store the initial position of the cabinet

// -------------------------------------------------
// Overlay handling for drawer documents
// -------------------------------------------------
// The HTML contains a hidden <div id="overlay"> that will host the
// document content when a drawer is opened. We fetch the corresponding
// HTML fragment (drawerX.html) and inject it into the overlay.
// The overlay can be closed via a button inside each fragment.

const overlay = document.getElementById('overlay');
// Global close‑button handler (delegated). This works for any drawer document.
overlay.addEventListener('click', (event) => {
    if (!event.target.matches('.close-doc')) return;
    event.stopPropagation();
    hideOverlay();
    if (cameraFocusDrawer) {
        const state = drawerStates[cameraFocusDrawer.name];
        if (state) state.open = false;
        const anotherOpen = drawers.find(d => drawerStates[d.name].open);
        cameraFocusDrawer = anotherOpen || null;
    }
});

// Holds the name of a drawer whose document should appear once the drawer
// animation reaches its open position.
let pendingDocumentName = null;

// Mapping from drawer object names (as defined in the GLTF model) to the
// HTML file that holds the information to display.
const drawerDocs = {
    D1_8: 'drawer1.html',
    D2_11: 'drawer2.html',
    D3_13: 'drawer3.html'
};

/** Load a document fragment and show it in the overlay. */
function showDrawerDocument(drawerName) {
    const file = drawerDocs[drawerName];
    if (!file) return;
    fetch(file)
        .then(res => res.text())
        .then(html => {
        overlay.innerHTML = html;
        // Make the overlay a flex container and trigger CSS transition
        overlay.style.display = 'flex';
        requestAnimationFrame(() => {
            overlay.classList.add('visible');
        });
        // When the typewriter animation finishes, remove the blinking cursor.
        overlay.querySelectorAll('.typewriter').forEach(el => {
            el.addEventListener('animationend', () => {
                el.classList.add('finished');
            }, { once: true });
        });
        // Attach close handler – the button inside the fragment has class "close-doc"
        const closeBtn = overlay.querySelector('.close-doc');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                hideOverlay();
                // Close the drawer associated with this document
                const state = drawerStates[drawerName];
                if (state) state.open = false;
                // Update camera focus after closing
                const anotherOpen = drawers.find(d => drawerStates[d.name].open);
                cameraFocusDrawer = anotherOpen || null;
            });
        }
        })
        .catch(err => console.error('Failed to load drawer document', err));
}

/** Hide the overlay and clear its contents. */
function hideOverlay() {
    // Hide with transition – remove the class first then after the transition
    // finishes reset display and content.
    overlay.classList.remove('visible');
    // Wait for the CSS transition duration (0.4s) before fully hiding.
    setTimeout(() => {
        overlay.style.display = 'none';
        overlay.innerHTML = '';
    }, 400);
}

const camera = new THREE.PerspectiveCamera(
    30,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);

const ambientLight = new THREE.AmbientLight(0xffffff, 2);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 3);
directionalLight.position.set(5, 5, 5);
scene.add(directionalLight);

const renderer = new THREE.WebGLRenderer({
    antialias: true
});

renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// -------------------------------------------------
// Danger & Return button handling
// -------------------------------------------------
/** Attach click listeners for danger and return buttons once the cabinet model is loaded. */
function attachDangerListener() {
    const dangerBtn = document.getElementById('dangerBtn');
    if (dangerBtn) {
        dangerBtn.addEventListener('click', startDanger);
    }
    const returnBtn = document.getElementById('returnBtn');
    if (returnBtn) {
        returnBtn.addEventListener('click', startReturn);
    }
}

/** Compatibility alias – some older code may call this name. */
function attachButtonListeners() {
    attachDangerListener();
}

/** Start the cabinet "danger" animation. */
function startDanger() {
    if (dangerMode || !cabinetModel) {
        return;
    }
    // Reset cabinet to its original position and orientation before starting a new danger run
    cabinetModel.position.copy(cabinetOriginalPos);
    cabinetModel.rotation.y = cabinetOriginalRotationY;
    // Record the starting X/Y positions (now equal to original)
    cabinetStartX = cabinetOriginalPos.x;
    cabinetStartY = cabinetOriginalPos.y;
    // Determine a random target rotation between 220° and 360° for this run
    const minDeg = 220;
    const maxDeg = 360;
    const randomDeg = Math.random() * (maxDeg - minDeg) + minDeg;
    cabinetTargetRotationY = cabinetOriginalRotationY + THREE.MathUtils.degToRad(randomDeg);
    // Show the return button for the user to restore safety later
    const returnBtn = document.getElementById('returnBtn');
    if (returnBtn) returnBtn.style.display = 'block';
    dangerMode = true;
    dangerStart = performance.now();
}

/** Start the return‑to‑safety animation. */
function startReturn() {
    if (!cabinetModel) return;
    // Stop any ongoing danger animation
    dangerMode = false;
    // Reset any shake rotation
    cabinetModel.rotation.z = 0;
    cabinetModel.rotation.y = 0;
    returnMode = true;
    returnStart = performance.now();
}


// -------------------------
// Camera
// -------------------------

const normalCameraPosition = new THREE.Vector3(0, 1, 5);

const drawerCameraPosition = new THREE.Vector3(
    0,
    2.5,
    1.5
);

camera.position.copy(normalCameraPosition);

const cameraTarget = new THREE.Vector3(0, 1, 0);
const normalCameraTarget = new THREE.Vector3(0, 1, 0);


// Which drawer the camera is currently focusing on
let cameraFocusDrawer = null;


// -------------------------
// Drawers
// -------------------------

let drawer1;
let drawer2;
let drawer3;

const drawers = [];
const drawerStates = {};


// -------------------------
// Raycaster
// -------------------------

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();


// -------------------------
// Click handler
// -------------------------

/**
 * Handle click/tap events on the canvas.
 * This function works for both mouse clicks and touch taps.
 */
function handleOnClick(event) {
    // Normalize touch events to have clientX/Y like mouse events.
    if (event.touches && event.touches.length) {
        event = event.touches[0];
    }

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObjects(drawers, true);

    if (intersects.length === 0) return;

    let clickedObject = intersects[0].object;

    // Find the drawer that contains the clicked object
    let drawer = clickedObject;
    while (drawer && !drawers.includes(drawer)) {
        drawer = drawer.parent;
    }
    if (!drawer) return;

    const state = drawerStates[drawer.name];
    // Toggle drawer open state
    state.open = !state.open;
    if (state.open) {
        cameraFocusDrawer = drawer;
        pendingDocumentName = drawer.name;
    } else {
        hideOverlay();
        const anotherOpenDrawer = drawers.find(d => drawerStates[d.name].open);
        cameraFocusDrawer = anotherOpenDrawer || null;
    }
}


// -------------------------
// Load model
// -------------------------

const loader = new GLTFLoader();

loader.load(
    'filing_cabinet/scene.gltf',

    function (gltf) {

        const model = gltf.scene;

        model.rotation.y = -Math.PI / 2;

        drawer1 = model.getObjectByName('D1_8');
        drawer2 = model.getObjectByName('D2_11');
        drawer3 = model.getObjectByName('D3_13');

        drawers.push(
            drawer1,
            drawer2,
            drawer3
        );

        drawers.forEach((drawer) => {

            drawerStates[drawer.name] = {

                open: false,

                closedX: drawer.position.x,

                openX: drawer.position.x + 0.5
            };

        });

        scene.add(model);
        // Store reference for danger animation and remember its original orientation and position
        cabinetModel = model;
        cabinetOriginalRotationY = model.rotation.y;
        cabinetOriginalPos.copy(model.position);
        // Now that the model is present in the scene, attach the button listeners
        attachButtonListeners();
        // Hide the skeleton loader – the model is ready
        const loaderEl = document.getElementById('skeletonLoader');
        if (loaderEl) {
          loaderEl.style.display = 'none';
        }
    },

    undefined,

    function (error) {
        console.error(error);
    }
);


// -------------------------
// Animation
// -------------------------

function animate() {

    // -------------------------
    // Drawer animation
    // -------------------------

    drawers.forEach((drawer) => {
        const state = drawerStates[drawer.name];
        const targetX = state.open ? state.openX : state.closedX;
        drawer.position.x = THREE.MathUtils.lerp(drawer.position.x, targetX, 0.08);
        // If a document is pending for this drawer and the drawer is essentially open,
        // trigger the document display. The 0.02 tolerance works with the current lerp speed.
        if (pendingDocumentName === drawer.name && Math.abs(drawer.position.x - state.openX) < 0.02) {
            showDrawerDocument(drawer.name);
            pendingDocumentName = null;
        }
    });


    // -------------------------
    // Camera animation
    // -------------------------

    if (cameraFocusDrawer) {

        // Move camera
        camera.position.lerp(
            drawerCameraPosition,
            0.05
        );


        // Find drawer's position in the world
        const drawerWorldPosition =
            new THREE.Vector3();

        cameraFocusDrawer.getWorldPosition(
            drawerWorldPosition
        );


        // Move camera's target toward drawer
        cameraTarget.lerp(
            drawerWorldPosition,
            0.08
        );


        camera.lookAt(cameraTarget);

    } else {

        // Return camera to normal position
        camera.position.lerp(
            normalCameraPosition,
            0.05
        );


        // Return camera target
        cameraTarget.lerp(
            normalCameraTarget,
            0.08
        );


        camera.lookAt(cameraTarget);
    }


    // -------------------------
    // Danger (cabinet flying) animation
    // -------------------------
    // Danger (cabinet moving) animation – keep cabinet visible, oscillate in X and Y
    if (dangerMode && cabinetModel) {
        const elapsed = performance.now() - dangerStart;
        const progress = Math.min(elapsed / dangerDuration, 1);
        if (progress < 1) {
            const t = elapsed * 0.001; // seconds for sinusoidal motion
            // Horizontal sinusoidal motion around start X
            cabinetModel.position.x = cabinetStartX + Math.sin(t * 2) * 2; // ±2 units
            // Vertical sinusoidal motion around start Y
            cabinetModel.position.y = cabinetStartY + Math.sin(t * 3) * 1; // ±1 unit
            // Gentle shake rotation on Z axis
            cabinetModel.rotation.z = Math.sin(t * 5) * 0.08;
            // Spin around Y axis to a random target rotation between 220° and 360°
            cabinetModel.rotation.y = cabinetOriginalRotationY + progress * (cabinetTargetRotationY - cabinetOriginalRotationY);
        } else {
            // End of danger animation – keep the cabinet at the random final rotation
            dangerMode = false;
            cabinetModel.rotation.z = 0;
            cabinetModel.rotation.y = cabinetTargetRotationY;
        }
    }

    // Return to safety – smoothly move cabinet back to its original start position
    if (returnMode && cabinetModel) {
        const elapsed = performance.now() - returnStart;
        // Lerp position and rotation back over 1 second for a smooth reset
        const t = Math.min(elapsed / 1000, 1);
        cabinetModel.position.x = THREE.MathUtils.lerp(cabinetModel.position.x, cabinetStartX, t);
        cabinetModel.position.y = THREE.MathUtils.lerp(cabinetModel.position.y, cabinetStartY, t);
        cabinetModel.rotation.y = THREE.MathUtils.lerp(cabinetModel.rotation.y, cabinetOriginalRotationY, t);
        if (t >= 1) {
            returnMode = false;
            // Ensure final exact values
            cabinetModel.rotation.y = cabinetOriginalRotationY;
            // Hide the return button once back to safety
            const returnBtn = document.getElementById('returnBtn');
            if (returnBtn) returnBtn.style.display = 'none';
        }
    }

    renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);


// -------------------------
// Events
// -------------------------

// Use a unified pointer event that works for mouse, touch, and pen inputs.
// Additionally listen for the legacy touchend event on older browsers.
window.addEventListener('pointerdown', handleOnClick);
window.addEventListener('touchend', function (e) {
    // Touch events may fire after a pointerdown, but we add this for
    // compatibility with browsers that don't fully support Pointer Events.
    e.preventDefault();
    handleOnClick(e);
}, { passive: false });


// -------------------------
// Resize
// -------------------------

window.addEventListener(
    'resize',
    () => {

        camera.aspect =
            window.innerWidth /
            window.innerHeight;

        camera.updateProjectionMatrix();

        renderer.setSize(
            window.innerWidth,
            window.innerHeight
        );
    }
);