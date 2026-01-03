import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader';

// === CONFIGURATION ===
const ROVER_MODEL_OFFSET = { x: -Math.PI / 2, y: -Math.PI / 2, z: -Math.PI / 2 }; 

const MoonRoverPortfolio = () => {
  const containerRef = useRef(null);
  const musicPlayerRef = useRef(null);
  const engineSoundRef = useRef(null);
  const requestRef = useRef(null);
  
  // State
  const [loading, setLoading] = useState(true); 
  const [roverLoaded, setRoverLoaded] = useState(false); 
  const [terrainLoaded, setTerrainLoaded] = useState(false);
  const [started, setStarted] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  
  // Refs
  const nameLettersRef = useRef([]);
  const rocksRef = useRef([]);
  const roverGroupRef = useRef(null);
  const sceneRef = useRef(null);
  const introGroupRef = useRef(null); 
  const gameAssetsGroupRef = useRef(null); // Ref for objects that spawn later
  const startedRef = useRef(false);
  const audioEnabledRef = useRef(false);
  
  // Controls
  const roverYawRef = useRef(0); 

  // Store height data for HIGH PERFORMANCE lookup
  const heightMapDataRef = useRef(null);

  // --- Reset Logic ---
  const resetLetters = () => {
    if (!nameLettersRef.current) return;
    nameLettersRef.current.forEach(letter => {
      const original = letter.userData.originalPosition;
      letter.position.set(original.x, original.y, original.z);
      letter.rotation.set(0, 0, 0); 
      letter.userData.velocity.set(0, 0, 0);
      letter.userData.angularVelocity.set(0, 0, 0);
    });
  };

  useEffect(() => {
    if (!containerRef.current) return;

    // --- Audio Context ---
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const playCollisionSound = (frequency = 440) => {
      if (!audioEnabledRef.current || audioContext.state === 'suspended') return;
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);
    };

    // --- Scene Setup ---
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    
    scene.background = new THREE.Color(0x1a0b2e); 
    scene.fog = new THREE.Fog(0x1a0b2e, 20, 100);

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(8, 8, 8);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);

    // --- Global Lighting ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.3);
    scene.add(hemi);

    // ==========================================
    // 1. INTRO SETUP (CLEANER UI)
    // ==========================================
    const introGroup = new THREE.Group();
    introGroupRef.current = introGroup;
    scene.add(introGroup);

    // Removed GridHelper and CircleGeometry to fix "Clunky" look
    // Only keeping the spotlight to light up the rover
    const introSpot = new THREE.SpotLight(0xffaaee, 5);
    introSpot.position.set(5, 10, 5);
    introSpot.angle = Math.PI / 6;
    introSpot.penumbra = 1;
    introSpot.castShadow = true;
    introGroup.add(introSpot);

    // ==========================================
    // 2. GAME ASSETS SETUP (HIDDEN INITIALLY)
    // ==========================================
    // We create a group for rocks, letters, and platforms
    const gameAssetsGroup = new THREE.Group();
    gameAssetsGroup.visible = false; // <--- HIDDEN UNTIL START
    gameAssetsGroupRef.current = gameAssetsGroup;
    scene.add(gameAssetsGroup);
    
    // Sun
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
    sunLight.position.set(50, 100, 50);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.left = -200;
    sunLight.shadow.camera.right = 200;
    sunLight.shadow.camera.top = 200;
    sunLight.shadow.camera.bottom = -200;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight); // Sun is always visible

    const sun = new THREE.Mesh(new THREE.SphereGeometry(15, 32, 32), new THREE.MeshBasicMaterial({ color: 0xffffee, fog: false }));
    sun.position.set(100, 100, 100);
    scene.add(sun);

    const sunGlow = new THREE.Mesh(new THREE.SphereGeometry(20, 32, 32), new THREE.MeshBasicMaterial({ color: 0xffffaa, transparent: true, opacity: 0.2 }));
    sunGlow.position.set(100, 100, 100);
    scene.add(sunGlow);

    // --- REAL HEIGHTMAP TERRAIN ---
    const textureLoader = new THREE.TextureLoader();
    const moonTexture = textureLoader.load('/music/models/moon_texture.jpg');
    moonTexture.wrapS = THREE.RepeatWrapping;
    moonTexture.wrapT = THREE.RepeatWrapping;
    moonTexture.repeat.set(1, 1);

    const groundGeometry = new THREE.PlaneGeometry(400, 400, 200, 200); 
    const groundMaterial = new THREE.MeshStandardMaterial({ 
        map: moonTexture,
        color: 0x666666,
        roughness: 0.9, 
        metalness: 0.1,
    });

    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI/2; 
    ground.receiveShadow = true;
    scene.add(ground); // Ground is visible in intro (looks better than void)

    // === OPTIMIZATION: LOAD DATA ONCE ===
    const fileLoader = new THREE.FileLoader();
    fileLoader.setResponseType('arraybuffer');
    fileLoader.load(
        '/music/models/Moon_Craters_Height Map_4033x4033.raw',
        (data) => {
            const heightData = new Uint16Array(data);
            const vertices = groundGeometry.attributes.position;
            const rawWidth = 4033;
            const rawHeight = 4033;

            heightMapDataRef.current = { data: heightData, width: rawWidth, height: rawHeight };

            for (let i = 0; i < vertices.count; i++) {
                const x = vertices.getX(i);
                const u = (x + 200) / 400; 
                const v = (vertices.getY(i) + 200) / 400; 
                const px = Math.floor(u * (rawWidth - 1));
                const py = Math.floor((1 - v) * (rawHeight - 1));
                const index = py * rawWidth + px;
                
                if (index >= 0 && index < heightData.length) {
                    const rawValue = heightData[index];
                    const worldHeight = (rawValue / 65535) * 25 - 5; 
                    vertices.setZ(i, worldHeight);
                }
            }
            groundGeometry.computeVertexNormals();
            groundGeometry.attributes.position.needsUpdate = true;
            groundGeometry.computeBoundingSphere();
            groundGeometry.computeBoundingBox();

            // Snap letters (if loaded)
            if (nameLettersRef.current.length > 0) {
                nameLettersRef.current.forEach(letter => {
                    const lx = letter.position.x;
                    const lz = letter.position.z;
                    const u = Math.max(0, Math.min(1, (lx + 200) / 400));
                    const v = Math.max(0, Math.min(1, (lz + 200) / 400));
                    const px = Math.floor(u * (rawWidth - 1));
                    const py = Math.floor(v * (rawHeight - 1)); 
                    const idx = py * rawWidth + px;

                    if (idx >= 0 && idx < heightData.length) {
                        const rawValue = heightData[idx];
                        const groundY = (rawValue / 65535) * 25 - 5;
                        letter.position.y = groundY + 0.2; 
                        letter.userData.originalPosition.y = groundY + 0.2;
                    }
                });
            }
            setTerrainLoaded(true);
        }
    );

    // === HIGH PERFORMANCE LOOKUP FUNCTIONS ===
    const getTerrainHeight = (worldX, worldZ) => {
        if (!heightMapDataRef.current) return 0;
        const { data, width, height } = heightMapDataRef.current;
        const u = Math.max(0, Math.min(1, (worldX + 200) / 400));
        const v = Math.max(0, Math.min(1, (worldZ + 200) / 400));
        const px = Math.floor(u * (width - 1));
        const py = Math.floor(v * (height - 1));
        const index = py * width + px;
        if (index >= 0 && index < data.length) {
             const rawValue = data[index];
             return (rawValue / 65535) * 25 - 5;
        }
        return 0;
    };

    const getTerrainNormal = (worldX, worldZ) => {
        const offset = 1.0; 
        const hL = getTerrainHeight(worldX - offset, worldZ);
        const hR = getTerrainHeight(worldX + offset, worldZ);
        const hD = getTerrainHeight(worldX, worldZ - offset);
        const hU = getTerrainHeight(worldX, worldZ + offset);
        const normal = new THREE.Vector3(hL - hR, 2.0 * offset, hD - hU);
        normal.normalize();
        return normal;
    };

    const starGeometry = new THREE.BufferGeometry();
    const starVertices = [];
    for (let i = 0; i < 5000; i++) {
      starVertices.push((Math.random() - 0.5) * 600, Math.random() * 200 + 50, (Math.random() - 0.5) * 600);
    }
    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
    const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.3, transparent: true, opacity: 0.9 });
    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars); // Stars visible always

    // --- ROVER (Game) ---
    const roverGroup = new THREE.Group();
    roverGroupRef.current = roverGroup; 
    roverGroup.visible = false; // Hide Main Rover Initially
    scene.add(roverGroup);

    const loader = new FBXLoader();
    loader.load(
        '/music/models/moon_rover_color.fbx', 
        (object) => {
            const finalScale = 0.00375;
            object.scale.set(finalScale, finalScale, finalScale); 

            object.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            object.rotation.set(ROVER_MODEL_OFFSET.x, ROVER_MODEL_OFFSET.y, ROVER_MODEL_OFFSET.z);
            
            // Intro Rover (Visible initially)
            const introRover = object.clone();
            introRover.position.set(0, 0.5, 0); 
            introGroup.add(introRover);

            // Game Rover (Hidden initially)
            roverGroup.add(object);
            setRoverLoaded(true);
        }
    );

    // --- Letters ---
    const sharedBlockGeometry = new THREE.BoxGeometry(0.45, 0.45, 1.0);
    const sharedBlockMaterial = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.7, metalness: 0.3 });
    const createNameLetter = (letter, x, z) => {
      const letterGroup = new THREE.Group();
      const letterPatterns = {
          'M': [[0,0],[0,1],[0,2],[0,3],[0,4], [1,1], [2,2], [3,1], [4,0],[4,1],[4,2],[4,3],[4,4]],
          'O': [[1,0],[2,0],[3,0], [0,1],[0,2],[0,3], [4,1],[4,2],[4,3], [1,4],[2,4],[3,4]],
          'S': [[1,0],[2,0],[3,0], [0,1], [1,2],[2,2],[3,2], [4,3], [1,4],[2,4],[3,4]],
          'L': [[0,0],[0,1],[0,2],[0,3],[0,4], [1,4],[2,4],[3,4],[4,4]],
          'U': [[0,0],[0,1],[0,2],[0,3], [4,0],[4,1],[4,2],[4,3], [1,4],[2,4],[3,4]],
          'V': [[0,0],[0,1],[0,2], [1,3], [2,4], [3,3], [4,0],[4,1],[4,2]],
          'A': [[2,0], [1,1],[3,1], [0,2],[4,2], [0,3],[1,3],[2,3],[3,3],[4,3], [0,4],[4,4]],
          'N': [[0,0],[0,1],[0,2],[0,3],[0,4], [1,1], [2,2], [3,3], [4,0],[4,1],[4,2],[4,3],[4,4]],
      };
      
      const pattern = letterPatterns[letter] || [[2,2]];
      const spacing = 0.48;

      pattern.forEach(([px, py]) => {
        const block = new THREE.Mesh(sharedBlockGeometry, sharedBlockMaterial);
        block.position.set(px * spacing, (4 - py) * spacing, 0); 
        block.castShadow = true; block.receiveShadow = true;
        letterGroup.add(block);
      });

      const box = new THREE.Box3().setFromObject(letterGroup);
      const center = new THREE.Vector3();
      box.getCenter(center);

      letterGroup.children.forEach(child => {
          child.position.x -= center.x;
          child.position.y -= box.min.y; 
          child.position.z -= center.z;
      });

      letterGroup.position.set(x, 0, z);
      letterGroup.rotation.set(0, 0, 0);

      letterGroup.userData = { 
          type: 'nameLetter', letter, 
          velocity: new THREE.Vector3(0,0,0), 
          angularVelocity: new THREE.Vector3(0,0,0), 
          mass: 5, radius: 2.5, 
          originalPosition: { x, y: 0, z } 
      };
      return letterGroup;
    };

    const nameLetters = [];
    const name = "MOSS LOUVAN";
    const startX = -(name.length * 4.0) / 2;
    for (let i = 0; i < name.length; i++) {
      if (name[i] !== ' ') {
        const letter = createNameLetter(name[i], startX + i * 4.0, 15);
        // ADD TO GAME ASSETS GROUP
        gameAssetsGroup.add(letter); 
        nameLetters.push(letter);
      }
    }
    nameLettersRef.current = nameLetters;

    // --- Platforms ---
    const createPlatform = (x, z, label, link) => {
      const platformGroup = new THREE.Group();
      const platformGeometry = new THREE.CylinderGeometry(4, 4, 0.3, 32);
      const platformMaterial = new THREE.MeshStandardMaterial({ color: 0xff9a3d, roughness: 0.3, metalness: 0.5 });
      const platform = new THREE.Mesh(platformGeometry, platformMaterial);
      platform.castShadow = true; platformGroup.add(platform);
      const rimGeometry = new THREE.TorusGeometry(4, 0.15, 16, 32);
      const rimMaterial = new THREE.MeshStandardMaterial({ color: 0x6dd5ed, emissive: 0x6dd5ed, emissiveIntensity: 0.8 });
      const rim = new THREE.Mesh(rimGeometry, rimMaterial);
      rim.rotation.x = Math.PI / 2; rim.position.y = 0.15; platformGroup.add(rim);
      const textGroup = new THREE.Group();
      const blockGeometry = new THREE.BoxGeometry(0.8, 0.8, 0.8);
      const blockMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.3 });
      const labelStartX = -(label.length * 1) / 2;
      for (let i = 0; i < label.length; i++) {
        const block = new THREE.Mesh(blockGeometry, blockMaterial.clone());
        block.position.x = labelStartX + i * 1; block.position.y = 2; block.userData = { letter: label[i] };
        textGroup.add(block);
      }
      platformGroup.add(textGroup); platformGroup.position.set(x, 0.15, z); platformGroup.userData = { type: 'platform', label, link };
      return platformGroup;
    };
    // ADD TO GAME ASSETS GROUP
    gameAssetsGroup.add(createPlatform(-15, -20, 'LINKEDIN', 'https://linkedin.com'));
    gameAssetsGroup.add(createPlatform(15, -20, 'GITHUB', 'https://github.com'));
    gameAssetsGroup.add(createPlatform(0, -35, 'CONTACT', '#contact'));

    // --- Rocks ---
    const sharedRockMaterial = new THREE.MeshStandardMaterial({ color: 0x7a7a7a, roughness: 1, metalness: 0 });
    const rockList = [];
    const createRock = (x, z, size) => {
      const rockGeometry = new THREE.DodecahedronGeometry(size, 0);
      const rock = new THREE.Mesh(rockGeometry, sharedRockMaterial);
      const initialY = getTerrainHeight(x, z) + size / 2; 
      rock.position.set(x, initialY, z);
      rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      rock.castShadow = true; rock.receiveShadow = true;
      rock.userData = { type: 'rock', radius: size, velocity: new THREE.Vector3(0,0,0), angularVelocity: new THREE.Vector3(0,0,0), mass: size * 2 };
      return rock;
    };
    for (let i = 0; i < 50; i++) {
      const size = Math.random() * 1.5 + 0.3;
      const rock = createRock((Math.random() - 0.5) * 120, (Math.random() - 0.5) * 120, size);
      // ADD TO GAME ASSETS GROUP
      gameAssetsGroup.add(rock); 
      rockList.push(rock);
    }
    rocksRef.current = rockList;

    // --- Controls ---
    const keys = {};
    const roverSpeed = 0.15;
    const rotationSpeed = 0.03;
    const handleKeyDown = (e) => { keys[e.key.toLowerCase()] = true; };
    const handleKeyUp = (e) => { keys[e.key.toLowerCase()] = false; };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    let mouseDown = false;
    let mouseX = 0;
    const handleMouseDown = (e) => { if (e.button === 2) mouseDown = true; };
    const handleMouseUp = () => { mouseDown = false; };
    const handleMouseMove = (e) => { if (mouseDown) { mouseX = e.movementX; } };
    const handleContextMenu = (e) => e.preventDefault();
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('contextmenu', handleContextMenu);


    // === FAST PHYSICS LOGIC ===
    const alignObjectToTerrain = (object, yOffset) => {
        const targetHeight = getTerrainHeight(object.position.x, object.position.z) + yOffset;
        
        if (object.userData.type === 'rock' || object.userData.type === 'nameLetter') {
            if(object.position.y < targetHeight) object.position.y = targetHeight;
        } else {
            object.position.y = targetHeight;
        }

        const normal = getTerrainNormal(object.position.x, object.position.z);
        const up = new THREE.Vector3(0, 1, 0);
        const targetOrientation = new THREE.Quaternion().setFromUnitVectors(up, normal);
        
        if (object === roverGroupRef.current) {
            const yawQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), roverYawRef.current);
            const finalQuaternion = targetOrientation.multiply(yawQuaternion);
            object.quaternion.slerp(finalQuaternion, 0.15);
        }
    };

    const handleObjectPhysics = (objects) => {
        if (!roverGroupRef.current) return;
        objects.forEach(obj => {
            const dist = roverGroupRef.current.position.distanceTo(obj.position);
            const radius = obj.userData.radius || 1;
            
            if (dist < radius + 2.0) {
                const pushDir = new THREE.Vector3().subVectors(obj.position, roverGroupRef.current.position).normalize();
                pushDir.y = 0.5; 
                const force = 0.2 / (obj.userData.mass || 1); 
                obj.userData.velocity.add(pushDir.multiplyScalar(force));
                obj.userData.angularVelocity.set((Math.random()-0.5)*0.1, (Math.random()-0.5)*0.1, (Math.random()-0.5)*0.1);
                if (obj.userData.velocity.length() > 0.05) playCollisionSound(200 + Math.random() * 100);
            }

            obj.position.add(obj.userData.velocity);
            obj.rotation.x += obj.userData.angularVelocity.x;
            obj.rotation.y += obj.userData.angularVelocity.y;
            obj.rotation.z += obj.userData.angularVelocity.z;
            obj.userData.velocity.y -= 0.01; 
            obj.userData.velocity.multiplyScalar(0.95); 
            obj.userData.angularVelocity.multiplyScalar(0.95);
            
            alignObjectToTerrain(obj, 0); 
        });
    }

    // --- ANIMATION LOOP ---
    let time = 0;
    
    const animate = () => {
      requestRef.current = requestAnimationFrame(animate);
      time += 0.01;

      if (!startedRef.current) {
        // INTRO ANIMATION
        if (introGroupRef.current) {
            introGroupRef.current.rotation.y = Math.sin(time * 0.2) * 0.1;
        }
        camera.position.x = Math.sin(time * 0.1) * 8;
        camera.position.z = Math.cos(time * 0.1) * 8;
        camera.position.y = 6;
        camera.lookAt(0, 0, 0);
      } else {
        // GAME LOOP
        const rGroup = roverGroupRef.current;
        
        if (rGroup && heightMapDataRef.current) { 
            let isMoving = false;
            
            if (keys['a'] || keys['arrowleft']) { roverYawRef.current += rotationSpeed; }
            if (keys['d'] || keys['arrowright']) { roverYawRef.current -= rotationSpeed; }
            
            const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), roverYawRef.current);
            
            if (keys['s'] || keys['arrowup']) {
                rGroup.position.add(forward.multiplyScalar(roverSpeed));
                isMoving = true;
            }
            if (keys['w'] || keys['arrowdown']) {
                rGroup.position.sub(forward.multiplyScalar(roverSpeed));
                isMoving = true;
            }

            alignObjectToTerrain(rGroup, 1.5);

            if (engineSoundRef.current) {
                engineSoundRef.current.volume = isMoving ? 0.5 : 0;
            }

            handleObjectPhysics(nameLettersRef.current);
            handleObjectPhysics(rocksRef.current);

            // Camera Follow
            const cameraOffset = new THREE.Vector3(0, 12, 20);
            cameraOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), roverYawRef.current);
            
            camera.position.lerp(rGroup.position.clone().add(cameraOffset), 0.1);
            camera.lookAt(rGroup.position);

            if (mouseDown) { 
                camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), -mouseX * 0.003); 
                camera.lookAt(rGroup.position);
                mouseX = 0; 
            }
        }

        scene.children.forEach(child => {
            if (child.userData.type === 'platform') {
            child.children.forEach(mesh => { if (mesh.type === 'Mesh' && mesh.geometry.type === 'TorusGeometry') { mesh.material.emissiveIntensity = 0.5 + Math.sin(time * 2) * 0.3; } });
            child.children.forEach(group => { if (group.type === 'Group') { group.children.forEach((block, i) => { block.position.y = 2 + Math.sin(time * 2 + i * 0.3) * 0.2; }); } });
            }
        });
      }

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    setTimeout(() => setLoading(false), 2000);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('contextmenu', handleContextMenu);
      
      if (requestRef.current) cancelAnimationFrame(requestRef.current);

      if (musicPlayerRef.current) { musicPlayerRef.current.pause(); musicPlayerRef.current = null; }
      if (engineSoundRef.current) { engineSoundRef.current.pause(); engineSoundRef.current = null; }
      
      if (sceneRef.current) {
        sceneRef.current.traverse((object) => {
          if (object.geometry) object.geometry.dispose();
          if (object.material) {
            if (Array.isArray(object.material)) object.material.forEach(m => m.dispose());
            else object.material.dispose();
          }
          if (object.type === 'Mesh' && object.material.map) object.material.map.dispose();
        });
      }
      if (containerRef.current && renderer.domElement) containerRef.current.removeChild(renderer.domElement);
      renderer.dispose();
      audioContext.close();
    };
  }, []); 

  const handleStart = () => {
    startedRef.current = true;
    audioEnabledRef.current = true;
    
    setStarted(true);
    setAudioEnabled(true);
    
    if (sceneRef.current) {
        sceneRef.current.background = new THREE.Color(0x050505);
        sceneRef.current.fog = new THREE.Fog(0x050505, 40, 250);
    }
    
    // Switch Visibility Logic
    if (introGroupRef.current) introGroupRef.current.visible = false;
    if (gameAssetsGroupRef.current) gameAssetsGroupRef.current.visible = true;
    if (roverGroupRef.current) roverGroupRef.current.visible = true;

    const music = new Audio('/music/background.mp3'); music.loop = true; music.volume = 0.4;
    music.play().catch(e => console.log('Music blocked:', e));
    musicPlayerRef.current = music; 

    const engine = new Audio('/music/insidecarnoise.mp3'); engine.loop = true; engine.volume = 0; 
    engine.play().catch(e => console.log('Engine blocked:', e));
    engineSoundRef.current = engine;
  };

  const isReady = roverLoaded && terrainLoaded;

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-purple-900 via-indigo-900 to-black z-50">
          <div className="text-white text-xl animate-pulse font-mono">LOADING ASSETS...</div>
        </div>
      )}

      {!started && !loading && (
        <div className="absolute inset-0 pointer-events-none z-40 flex items-center justify-center">
             <div className="relative transform translate-x-24 -translate-y-12">
                 {isReady ? (
                    <div className="pointer-events-auto cursor-pointer group" onClick={handleStart}>
                        <style>{`@import url('https://fonts.googleapis.com/css2?family=Amatic+SC:wght@700&display=swap');`}</style>
                        <h1 className="text-white text-6xl tracking-widest drop-shadow-[0_5px_5px_rgba(255,0,255,0.5)]" style={{ fontFamily: "'Amatic SC', cursive", transform: 'rotate(-5deg)' }}>
                            CLICK TO <br/> START
                        </h1>
                        <svg className="absolute -bottom-8 -left-8 w-12 h-12 text-white animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{transform: 'rotate(90deg)'}}>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                        </svg>
                        <div className="absolute top-10 -right-10 text-white animate-pulse">
                            <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                        </div>
                    </div>
                 ) : (
                    <div className="text-white text-3xl font-mono animate-pulse">
                        {!roverLoaded ? "ROVER LOADING..." : "TERRAIN LOADING..."}
                    </div>
                 )}
             </div>
        </div>
      )}

      <div ref={containerRef} className="w-full h-full bg-gradient-to-b from-purple-900 to-black" />

      {started && !loading && (
        <>
          <div className="absolute bottom-8 left-8 bg-black bg-opacity-70 backdrop-blur-md text-white p-6 rounded-xl border-2 border-red-500 shadow-lg shadow-red-500/50">
            <p className="text-sm font-bold mb-3 text-red-500">🎮 CONTROLS</p>
            <p className="text-xs mb-1">WASD / Arrow Keys - Move Rover</p>
            <p className="text-xs mb-1">Right Click + Drag - Rotate Camera</p>
            <p className="text-xs text-red-400 mb-3">💥 Push the letters AND ROCKS!</p>
            <button onClick={resetLetters} className="w-full mt-2 px-4 py-2 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 rounded-lg text-xs font-bold transition-all duration-300 transform hover:scale-105">🔄 RESET LETTERS</button>
          </div>

          <div className="absolute top-8 right-8">
            <button onClick={() => setShowMenu(v => !v)} aria-label="menu" className="w-14 h-14 bg-gradient-to-br from-red-500 to-red-700 rounded-xl flex flex-col items-center justify-center gap-1.5 hover:from-red-600 hover:to-red-800 transition-all duration-300 shadow-lg shadow-red-500/50 transform hover:scale-110">
              <div className="w-7 h-0.5 bg-white rounded-full"></div>
              <div className="w-7 h-0.5 bg-white rounded-full"></div>
              <div className="w-7 h-0.5 bg-white rounded-full"></div>
            </button>
            {showMenu && (
              <div className="mt-2 w-48 bg-black bg-opacity-80 text-white rounded-lg border border-red-600 p-3 shadow-lg">
                <a href="https://www.linkedin.com/in/moss-louvan-4614682a4" target="_blank" rel="noreferrer" className="block py-1 text-sm hover:text-red-300">LinkedIn</a>
                <a href="https://github.com" target="_blank" rel="noreferrer" className="block py-1 text-sm hover:text-red-300">GitHub</a>
                <a href="#contact" className="block py-1 text-sm hover:text-red-300">Contact</a>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default MoonRoverPortfolio;