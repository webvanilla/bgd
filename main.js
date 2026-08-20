import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xFFFFFF);

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

function handleOnClick(event) {

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

    // Toggle drawer
    state.open = !state.open;

    if (state.open) {
        // Open this drawer – defer showing the document until the drawer finishes opening
        cameraFocusDrawer = drawer;
        pendingDocumentName = drawer.name;
    } else {
        // Close drawer: hide overlay (if any) and possibly focus another open drawer
        hideOverlay();
        const anotherOpenDrawer = drawers.find(
            d => drawerStates[d.name].open
        );
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


    renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);


// -------------------------
// Events
// -------------------------

window.addEventListener(
    'click',
    handleOnClick
);


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