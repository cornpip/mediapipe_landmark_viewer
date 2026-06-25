import React, { useCallback, useEffect, useLayoutEffect, useState, useRef, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Billboard, Text } from '@react-three/drei';
import {
    Box, TextField, Button, Typography, Link,
    ThemeProvider, createTheme, CssBaseline, Slider,
} from '@mui/material';
import { Vector3 } from 'three';
import * as THREE from 'three';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

// ─── Constants (outside component — no re-declaration on render) ──────────────
const FACE_COUNT         = 468;
const DEFAULT_POINT_SIZE = 0.006;
const DEFAULT_TEXT_SIZE  = 0.01;

// Scratch objects — reused across calls to avoid allocation in hot paths
const _m = new THREE.Matrix4();
const _c = new THREE.Color();

// ─── Color Sets ───────────────────────────────────────────────────────────────
const COLOR_SETS = [
    {
        name: 'Rose',
        dark:  { face: '#993355', iris: '#662299', faceHl: '#ff2266', irisHl: '#cc33ff' },
        light: { face: '#882244', iris: '#551188', faceHl: '#ee1155', irisHl: '#aa22ee' },
    },
    {
        name: 'Ocean',
        dark:  { face: '#1a66cc', iris: '#118899', faceHl: '#33aaff', irisHl: '#11ffee' },
        light: { face: '#1155bb', iris: '#0d7788', faceHl: '#1188ff', irisHl: '#00ccbb' },
    },
    {
        name: 'Forest',
        dark:  { face: '#228844', iris: '#887722', faceHl: '#33ff66', irisHl: '#ffee22' },
        light: { face: '#1a7033', iris: '#776611', faceHl: '#22ee55', irisHl: '#ddcc11' },
    },
];

type Landmark = { x: number; y: number; z: number };

// ─── LandmarkPoints ───────────────────────────────────────────────────────────
// Defined OUTSIDE FaceMeshViewer so React treats it as a stable component type.
// If defined inside, every parent re-render produces a new function reference →
// React unmounts/remounts all 478 Three.js objects on every state change.
interface LandmarkPointsProps {
    highlightSet: Set<number>;
    landmarks: Landmark[];
    showIris: boolean;
    darkMode: boolean;
    pointSize: number;
    textSize: number;
    hoverIndex: number | null;
    setHoverIndex: (i: number | null) => void;
    setHoveredIndex: (i: number | null) => void;
    faceColor: string;
    irisColor: string;
    faceHl: string;
    irisHl: string;
}

const LandmarkPoints = React.memo(function LandmarkPoints({
    highlightSet,
    landmarks,
    showIris,
    darkMode,
    pointSize,
    textSize,
    hoverIndex,
    setHoverIndex,
    setHoveredIndex,
    faceColor,
    irisColor,
    faceHl,
    irisHl,
}: LandmarkPointsProps) {
    const faceMeshRef = useRef<THREE.InstancedMesh>(null);
    const irisMeshRef = useRef<THREE.InstancedMesh>(null);

    const faceLandmarks = useMemo(() => landmarks.slice(0, FACE_COUNT), [landmarks]);
    const irisLandmarks = useMemo(() => landmarks.slice(FACE_COUNT), [landmarks]);

    // Two geometries — recreated only when pointSize changes, disposed when replaced.
    // Slider drag: previously recreated 478 geometries; now just 2.
    const faceGeo = useMemo(() => new THREE.SphereGeometry(pointSize, 16, 16), [pointSize]);
    const irisGeo = useMemo(() => new THREE.SphereGeometry(pointSize * 1.2, 16, 16), [pointSize]);
    useEffect(() => () => { faceGeo.dispose(); }, [faceGeo]);
    useEffect(() => () => { irisGeo.dispose(); }, [irisGeo]);

    const labelColor   = 'white';
    const labelOutline = darkMode ? '#1a1a1a' : '#222222';

    // ── Instance matrices (world positions) ──────────────────────────────────
    // Landmarks are in image space [x, y, z] with y-down.
    // We apply the flip directly ([x, -y, -z]) instead of a group scale,
    // so Billboard labels can share the same world coordinates without extra conversion.
    useEffect(() => {
        const mesh = faceMeshRef.current;
        if (!mesh) return;
        faceLandmarks.forEach((p, i) => {
            _m.setPosition(p.x, -p.y, -p.z);
            mesh.setMatrixAt(i, _m);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.boundingSphere = null; // force recompute on next raycast with updated positions
    }, [faceLandmarks]);

    useEffect(() => {
        const mesh = irisMeshRef.current;
        if (!mesh) return;
        irisLandmarks.forEach((p, i) => {
            _m.setPosition(p.x, -p.y, -p.z);
            mesh.setMatrixAt(i, _m);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.boundingSphere = null;
    }, [irisLandmarks, showIris]); // showIris re-triggers after iris mesh mounts

    // ── Instance colors ──────────────────────────────────────────────────────
    // useLayoutEffect: runs synchronously before browser paint → no black-flash on first frame
    // O(1) per point via Set.has — was O(n) with Array.includes
    useLayoutEffect(() => {
        const mesh = faceMeshRef.current;
        if (!mesh) return;
        faceLandmarks.forEach((_, i) => {
            _c.set(highlightSet.has(i) ? faceHl : faceColor);
            if (hoverIndex === i && !highlightSet.has(i)) _c.multiplyScalar(1.5);
            mesh.setColorAt(i, _c);
        });
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }, [faceLandmarks, highlightSet, hoverIndex, faceColor, faceHl]);

    useLayoutEffect(() => {
        const mesh = irisMeshRef.current;
        if (!mesh) return;
        irisLandmarks.forEach((_, i) => {
            const gi = FACE_COUNT + i;
            _c.set(highlightSet.has(gi) ? irisHl : irisColor);
            if (hoverIndex === gi && !highlightSet.has(gi)) _c.multiplyScalar(1.5);
            mesh.setColorAt(i, _c);
        });
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }, [irisLandmarks, highlightSet, hoverIndex, irisColor, irisHl, showIris]);

    // ── Event handlers — stable with useCallback ─────────────────────────────
    const onFaceClick = useCallback((e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        if (e.instanceId !== undefined) setHoveredIndex(e.instanceId);
    }, [setHoveredIndex]);

    const onFaceOver = useCallback((e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        if (e.instanceId !== undefined) {
            setHoverIndex(e.instanceId);
            document.body.style.cursor = 'pointer';
        }
    }, [setHoverIndex]);

    const onFaceOut = useCallback(() => {
        setHoverIndex(null);
        document.body.style.cursor = 'default';
    }, [setHoverIndex]);

    const onIrisClick = useCallback((e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        if (e.instanceId !== undefined) setHoveredIndex(FACE_COUNT + e.instanceId);
    }, [setHoveredIndex]);

    const onIrisOver = useCallback((e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        if (e.instanceId !== undefined) {
            setHoverIndex(FACE_COUNT + e.instanceId);
            document.body.style.cursor = 'pointer';
        }
    }, [setHoverIndex]);

    const onIrisOut = useCallback(() => {
        setHoverIndex(null);
        document.body.style.cursor = 'default';
    }, [setHoverIndex]);

    const visibleLandmarks = showIris ? landmarks : faceLandmarks;

    return (
        <>
            {/* Face: 468 instances → 1 draw call (was 468) */}
            <instancedMesh
                ref={faceMeshRef}
                args={[undefined, undefined, FACE_COUNT]}
                geometry={faceGeo}
                frustumCulled={false}
                onClick={onFaceClick}
                onPointerOver={onFaceOver}
                onPointerOut={onFaceOut}
            >
                <meshBasicMaterial />
            </instancedMesh>

            {/* Iris: 10 instances → 1 draw call (was 10) */}
            {showIris && irisLandmarks.length > 0 && (
                <instancedMesh
                    ref={irisMeshRef}
                    args={[undefined, undefined, irisLandmarks.length]}
                    geometry={irisGeo}
                    frustumCulled={false}
                    onClick={onIrisClick}
                    onPointerOver={onIrisOver}
                    onPointerOut={onIrisOut}
                >
                    <meshBasicMaterial />
                </instancedMesh>
            )}

            {/* Labels: Billboard in world space — only rendered for highlighted/hovered */}
            {visibleLandmarks.map((p, i) => {
                if (!highlightSet.has(i) && hoverIndex !== i) return null;
                return (
                    <Billboard key={`label-${i}`} position={[p.x, -p.y, -p.z]}>
                        <Text
                            position={[0, 0, pointSize * 3]}
                            fontSize={textSize}
                            color={labelColor}
                            outlineColor={labelOutline}
                            outlineWidth={textSize * 0.15}
                            anchorX="center"
                            anchorY="middle"
                            renderOrder={10}
                            material-depthTest={false}
                        >
                            {i.toString()}
                        </Text>
                    </Billboard>
                );
            })}
        </>
    );
});

// ─── FaceMeshViewer ───────────────────────────────────────────────────────────
export default function FaceMeshViewer() {
    const [darkMode, setDarkMode] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
    const theme = useMemo(() => createTheme({ palette: { mode: darkMode ? 'dark' : 'light' } }), [darkMode]);
    const [colorSetIndex, setColorSetIndex] = useState(1);
    const activeColors = useMemo(() => {
        const set = COLOR_SETS[colorSetIndex];
        return darkMode ? set.dark : set.light;
    }, [colorSetIndex, darkMode]);

    const DEFAULT_INPUT = '0, 17, 37, 39, 40, 61, 84, 91, 146, 181, 185, 267, 269, 270, 291, 314, 321, 375, 405, 409';
    const [textfieldIndices, setTextfieldIndices] = useState<number[]>(() =>
        DEFAULT_INPUT.split(',').map((s) => Number(s.trim()))
    );
    const [input, setInput] = useState(DEFAULT_INPUT);
    const [isNumberView, setIsNumberView] = useState(false);
    const [showIris, setShowIris] = useState(true);
    const [pointSize, setPointSize] = useState(DEFAULT_POINT_SIZE);
    const [textSize,  setTextSize]  = useState(DEFAULT_TEXT_SIZE);
    const [hoverIndex, setHoverIndex] = useState<number | null>(null);
    const [landmarks, setLandmarks] = useState<Landmark[]>([]);
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    const controlsRef = useRef<OrbitControlsImpl | null>(null);
    const defaultCameraPos = useRef(new Vector3(0, 0, 0));
    const [activeButton, setActiveButton] = useState<'up' | 'down' | 'left' | 'right' | null>(null);

    // number view가 켜지면 전체 인덱스, 꺼지면 textfield 인덱스만 — textfield 효과 보존
    const index = useMemo(() => {
        if (!isNumberView) return textfieldIndices;
        const total = showIris ? landmarks.length : FACE_COUNT;
        return Array.from({ length: total }, (_, i) => i);
    }, [isNumberView, showIris, landmarks, textfieldIndices]);

    const highlightSet = useMemo(() => new Set(index), [index]);

    const center = useMemo(() => {
        const face = landmarks.slice(0, FACE_COUNT);
        if (!face.length) return new Vector3(0, 0, 0);
        const sum = new Vector3(0, 0, 0);
        face.forEach((p) => sum.add(new Vector3(p.x, p.y, p.z)));
        return sum.divideScalar(face.length);
    }, [landmarks]);

    // Avoid 478 temporary Vector3 allocations per bounding radius calculation
    const boundingRadius = useMemo(() => {
        if (!landmarks.length) return 1;
        const { x: cx, y: cy, z: cz } = center;
        let maxSq = 0;
        landmarks.forEach(({ x, y, z }) => {
            const d = (x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2;
            if (d > maxSq) maxSq = d;
        });
        return Math.sqrt(maxSq);
    }, [landmarks, center]);

    const controlsTarget = useRef(center.clone());
    const defaultCameraTarget = useRef(new Vector3());

    const resetView = () => {
        if (!controlsRef.current) return;
        controlsRef.current.object.position.copy(defaultCameraPos.current);
        controlsRef.current.target.copy(defaultCameraTarget.current);
        controlsRef.current.update();
    };

    const numberView = () => {
        setIsNumberView((prev) => !prev);
    };

    const toggleIris = () => {
        setShowIris((prev) => !prev);
    };

    // Single consolidated move function — replaces four separate move functions
    const moveCamera = useCallback((dx: number, dy: number) => {
        if (!controlsRef.current) return;
        const delta = new Vector3(dx, dy, 0);
        controlsRef.current.object.position.add(delta);
        controlsRef.current.target.add(delta);
        controlsRef.current.update();
    }, []);

    useEffect(() => {
        if (landmarks.length === 0) return;
        let mounted = true;
        const applyCamera = () => {
            if (!mounted) return;
            if (!controlsRef.current) { requestAnimationFrame(applyCamera); return; }
            const fov = 30, scale = 1.5, offsetX = -0, offsetY = 0;
            const distance = boundingRadius / Math.tan((fov * Math.PI) / 180 / 2) / scale;
            const tx = center.x + offsetX, ty = center.y + offsetY;
            defaultCameraPos.current = new Vector3(tx, ty, center.z + distance);
            defaultCameraTarget.current.set(tx, ty, center.z);
            controlsRef.current.object.position.copy(defaultCameraPos.current);
            controlsRef.current.target.copy(defaultCameraTarget.current);
            controlsRef.current.update();
        };
        applyCamera();
        return () => { mounted = false; };
    }, [landmarks, boundingRadius, center]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement;
            if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
            const d = 0.1;
            switch (e.key) {
                case 'ArrowUp':    moveCamera(0,  d); setActiveButton('up');    break;
                case 'ArrowDown':  moveCamera(0, -d); setActiveButton('down');  break;
                case 'ArrowLeft':  moveCamera(-d, 0); setActiveButton('left');  break;
                case 'ArrowRight': moveCamera( d, 0); setActiveButton('right'); break;
            }
        };
        const handleKeyUp = () => setActiveButton(null);
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [moveCamera]);

    useEffect(() => {
        fetch('/mediapipe_landmark_viewer/landmarks.json')
            .then((r) => r.json())
            .then((data: Landmark[]) => setLandmarks(data.map((p) => ({ ...p, y: p.y - 0.6 }))));
    }, []);

    return (
        <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>

            {/* Author */}
            <Box sx={{ position: 'absolute', top: 10, left: 30, zIndex: 20 }}>
                <Link href="https://github.com/cornpip" target="_blank" rel="noopener noreferrer" underline="hover">
                    <Typography variant="body1" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                        @cornpip
                    </Typography>
                </Link>
            </Box>

            {/* Controls UI */}
            <Box sx={{
                position: 'absolute', top: 30, left: 30,
                display: 'flex', flexDirection: 'column', gap: 1,
                paddingTop: 5, justifyContent: 'center', alignItems: 'start',
                zIndex: 10, pointerEvents: 'none',
            }}>
                <TextField
                    label={`ex) 10, 130, 312, ...(0~${(showIris ? landmarks.length : FACE_COUNT) - 1})`}
                    variant="outlined"
                    size="medium"
                    sx={{ width: 800, pointerEvents: 'auto' }}
                    value={input}
                    onChange={(e) => {
                        const value = e.target.value;
                        setInput(value);
                        const indices = value.split(',').map((s) => s.trim()).filter(Boolean)
                            .map(Number).filter((n) => !isNaN(n));
                        setTextfieldIndices(indices);
                    }}
                />
                <Box sx={{ display: 'flex', gap: 1, pointerEvents: 'auto', alignItems: 'center' }}>
                    <Button variant="outlined" color="primary" onClick={resetView}>
                        Reset Camera View
                    </Button>
                    <Button variant="outlined" color={isNumberView ? 'secondary' : 'primary'} onClick={numberView}>
                        {isNumberView ? 'cancel number view' : 'show number View'}
                    </Button>
                    <Button variant={showIris ? 'contained' : 'outlined'} color="info" onClick={toggleIris}>
                        {showIris ? 'iris ON' : 'iris OFF'}
                    </Button>
                    <Button variant="outlined" color="inherit" onClick={() => setDarkMode((p) => !p)}>
                        {darkMode ? 'Light' : 'Dark'}
                    </Button>
                    <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 1, py: 0.75 }}>
                        {COLOR_SETS.map((set, i) => (
                            <Box
                                key={i}
                                title={set.name}
                                onClick={() => setColorSetIndex(i)}
                                sx={{
                                    width: 20, height: 20, borderRadius: '50%',
                                    backgroundColor: darkMode ? set.dark.face : set.light.face,
                                    boxShadow: colorSetIndex === i
                                        ? `0 0 0 2px ${darkMode ? '#fff' : '#333'}`
                                        : 'none',
                                    cursor: 'pointer',
                                    '&:hover': { opacity: 0.75 },
                                }}
                            />
                        ))}
                    </Box>
                </Box>

                <Box sx={{ width: 300, pointerEvents: 'auto', px: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Typography variant="caption" color="text.secondary">Point Size</Typography>
                        <Button size="small" variant="text" color="inherit"
                            sx={{ minWidth: 0, px: 0.5, py: 0, fontSize: '0.7rem', opacity: 0.6 }}
                            onClick={() => setPointSize(DEFAULT_POINT_SIZE)}>reset</Button>
                    </Box>
                    <Slider min={0.001} max={0.015} step={0.0005} value={pointSize}
                        onChange={(_, v) => setPointSize(v as number)} size="small" />
                </Box>

                <Box sx={{ width: 300, pointerEvents: 'auto', px: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Typography variant="caption" color="text.secondary">Text Size</Typography>
                        <Button size="small" variant="text" color="inherit"
                            sx={{ minWidth: 0, px: 0.5, py: 0, fontSize: '0.7rem', opacity: 0.6 }}
                            onClick={() => setTextSize(DEFAULT_TEXT_SIZE)}>reset</Button>
                    </Box>
                    <Slider min={0.003} max={0.02} step={0.0005} value={textSize}
                        onChange={(_, v) => setTextSize(v as number)} size="small" />
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, pointerEvents: 'auto' }}>
                    <Box sx={{
                        display: 'grid',
                        gridTemplateColumns: '50px 50px 50px',
                        gridTemplateRows: '50px 50px 50px',
                        gap: 1,
                    }}>
                        <Box />
                        <Button variant={activeButton === 'up'    ? 'contained' : 'outlined'} sx={{ transition: 'none' }} onClick={() => moveCamera(0,  0.1)}>↑</Button>
                        <Box />
                        <Button variant={activeButton === 'left'  ? 'contained' : 'outlined'} sx={{ transition: 'none' }} onClick={() => moveCamera(-0.1, 0)}>←</Button>
                        <Box />
                        <Button variant={activeButton === 'right' ? 'contained' : 'outlined'} sx={{ transition: 'none' }} onClick={() => moveCamera( 0.1, 0)}>→</Button>
                        <Box />
                        <Button variant={activeButton === 'down'  ? 'contained' : 'outlined'} sx={{ transition: 'none' }} onClick={() => moveCamera(0, -0.1)}>↓</Button>
                        <Box />
                    </Box>
                    <Typography>
                        Last Clicked #{' '}
                        <Box component="span" fontWeight="bold" color="red" fontSize="1.2rem">
                            {hoveredIndex}
                        </Box>
                    </Typography>
                </Box>
            </Box>

            {/* 3D Canvas */}
            <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <Canvas camera={{ position: [0, 0, 1.5] }}>
                    <color attach="background" args={[darkMode ? '#1a1a2e' : '#e8e8e8']} />
                    <ambientLight intensity={0.5} />
                    <directionalLight position={[0, 1, 2]} intensity={1} />
                    <OrbitControls ref={controlsRef} target={controlsTarget.current} />
                    <LandmarkPoints
                        highlightSet={highlightSet}
                        landmarks={landmarks}
                        showIris={showIris}
                        darkMode={darkMode}
                        pointSize={pointSize}
                        textSize={textSize}
                        hoverIndex={hoverIndex}
                        setHoverIndex={setHoverIndex}
                        setHoveredIndex={setHoveredIndex}
                        faceColor={activeColors.face}
                        irisColor={activeColors.iris}
                        faceHl={activeColors.faceHl}
                        irisHl={activeColors.irisHl}
                    />
                </Canvas>
            </Box>
        </Box>
        </ThemeProvider>
    );
}
