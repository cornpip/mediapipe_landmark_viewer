import { useEffect, useState, useRef, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Box, TextField, Button, Typography, Link } from '@mui/material';
import { Vector3 } from 'three';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Text } from '@react-three/drei';

type Landmark = {
    x: number;
    y: number;
    z: number;
};

// 🟢 메인 뷰어 컴포넌트
export default function FaceMeshViewer() {
    const [index, setIndex] = useState<number[]>([]);
    const [input, setInput] = useState('');
    const [isNumberView, setIsNumberView] = useState(false);
    const [landmarks, setLandmarks] = useState<Landmark[]>([]);
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    const controlsRef = useRef<OrbitControlsImpl | null>(null);
    const defaultCameraPos = useRef(new Vector3(0, 0, 0));
    const [activeButton, setActiveButton] = useState<'up' | 'down' | 'left' | 'right' | null>(null);

    // 얼굴 중심 계산
    const center = useMemo(() => {
        if (!landmarks.length) return new Vector3(0, 0, 0);

        // Vector3로 변환 후 reduce
        const sum = new Vector3(0, 0, 0);
        landmarks.forEach((p) => sum.add(new Vector3(p.x, p.y, p.z)));
        return sum.divideScalar(landmarks.length);
    }, [landmarks]);

    // 얼굴 bounding radius 계산
    const boundingRadius = useMemo(() => {
        if (!landmarks.length) return 1;
        let maxDist = 0;
        landmarks.forEach((p) => {
            const d = new Vector3(p.x, p.y, p.z).distanceTo(center);
            if (d > maxDist) maxDist = d;
        });
        return maxDist;
    }, [landmarks, center]);

    // Reset 버튼 클릭 시
    const resetView = () => {
        if (controlsRef.current) {
            controlsRef.current.object.position.copy(defaultCameraPos.current);
            controlsRef.current.target.copy(center);
            controlsRef.current.update();
        }
    };

    const numberView = () => {
        if (!isNumberView) {
            const numbers = Array.from({ length: 468 }, (_, i) => i);
            setIndex(numbers);
            setIsNumberView(true);
        } else {
            setIndex([]);
            setIsNumberView(false);
        }
    };

    const controlsTarget = useRef(center.clone()); // 👈 추가
    // 🟢 카메라 평행 이동 (각도 유지)
    const moveCameraUp = () => {
        if (!controlsRef.current) return;

        const cam = controlsRef.current.object;
        const target = controlsRef.current.target;

        const delta = new Vector3(0, 0.1, 0); // Y축 이동량
        cam.position.add(delta); // 카메라 이동
        target.add(delta); // 타겟도 동일하게 이동
        controlsRef.current.update();
    };

    const moveCameraDown = () => {
        if (!controlsRef.current) return;

        const cam = controlsRef.current.object;
        const target = controlsRef.current.target;

        const delta = new Vector3(0, -0.1, 0); // Y축 이동량
        cam.position.add(delta); // 카메라 이동
        target.add(delta); // 타겟도 동일하게 이동
        controlsRef.current.update();
    };

    const moveCameraLeft = () => {
        if (!controlsRef.current) return;

        const cam = controlsRef.current.object;
        const target = controlsRef.current.target;

        const delta = new Vector3(-0.1, 0, 0); // X축 이동량
        cam.position.add(delta); // 카메라 이동
        target.add(delta); // 타겟도 동일하게 이동
        controlsRef.current.update();
    };

    const moveCameraRight = () => {
        if (!controlsRef.current) return;

        const cam = controlsRef.current.object;
        const target = controlsRef.current.target;

        const delta = new Vector3(0.1, 0, 0); // X축 이동량
        cam.position.add(delta); // 카메라 이동
        target.add(delta); // 타겟도 동일하게 이동
        controlsRef.current.update();
    };

    // 🟢 랜드마크 점 컴포넌트
    function LandmarkPoints({ highlight, landmarks }: { highlight: number[]; landmarks: Landmark[] }) {
        return (
            <group scale={[1, -1, -1]}>
                {landmarks.map((p, i) => {
                    const isHighlighted = highlight.includes(i);
                    return (
                        <mesh
                            key={i}
                            position={[p.x, p.y, p.z]}
                            onClick={(e) => {
                                e.stopPropagation(); // OrbitControls 등 이벤트 버블 방지
                                setHoveredIndex(i); // 클릭된 번호 저장
                            }}
                        >
                            <sphereGeometry args={[0.01, 16, 16]} /> {/* 👈 원래 사이즈 유지 */}
                            <meshStandardMaterial color={isHighlighted ? 'red' : 'blue'} emissive={isHighlighted ? 'red' : 'black'} />
                            {isHighlighted && (
                                <>
                                    {/* 전면 숫자 */}
                                    <Text
                                        position={[0, 0, -0.01]} // 구 반지름만큼 앞으로
                                        fontSize={0.01}
                                        color="white"
                                        anchorX="center"
                                        anchorY="middle"
                                        scale={[1, -1, -1]}
                                    >
                                        {i.toString()}
                                    </Text>

                                    {/* 후면 숫자 */}
                                    <Text
                                        position={[0, 0, 0.01]} // 구 반대편
                                        fontSize={0.01}
                                        color="white"
                                        anchorX="center"
                                        anchorY="middle"
                                        scale={[-1, -1, 1]}
                                    >
                                        {i.toString()}
                                    </Text>
                                </>
                            )}
                        </mesh>
                    );
                })}
            </group>
        );
    }

    useEffect(() => {
        if (landmarks.length === 0) return;

        let mounted = true;

        const applyCamera = () => {
            if (!mounted) return;

            if (!controlsRef.current) {
                requestAnimationFrame(applyCamera); // ref 생길 때까지 반복
                return;
            }

            const fov = 30;
            const scale = 1.5;
            const distance = boundingRadius / Math.tan((fov * Math.PI) / 180 / 2) / scale;

            defaultCameraPos.current = new Vector3(center.x, center.y, center.z + distance);

            controlsRef.current.object.position.copy(defaultCameraPos.current);
            controlsRef.current.target.set(center.x, center.y, center.z);
            controlsRef.current.update();
        };

        applyCamera();

        return () => {
            mounted = false;
        };
    }, [landmarks, boundingRadius, center]);

    // 키보드 이벤트
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
                return;
            }

            switch (e.key) {
                case 'ArrowUp':
                    moveCameraUp();
                    setActiveButton('up');
                    break;
                case 'ArrowDown':
                    moveCameraDown();
                    setActiveButton('down');
                    break;
                case 'ArrowLeft':
                    moveCameraLeft();
                    setActiveButton('left');
                    break;
                case 'ArrowRight':
                    moveCameraRight();
                    setActiveButton('right');
                    break;
            }
        };

        const handleKeyUp = () => {
            setActiveButton(null); // 키 뗐을 때 눌림 효과 해제
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    // landmarks 불러오기
    useEffect(() => {
        fetch('/mediapipe_landmark_viewer/landmarks.json')
            .then((res) => res.json())
            .then((data: Landmark[]) => {
                const offsetY = -0.6; // 위로 올릴 거리
                const shifted = data.map((p) => ({ ...p, y: p.y + offsetY }));
                setLandmarks(shifted);
            });
    }, []);

    return (
        <Box
            sx={{
                display: 'flex',
                flexDirection: 'column',
                height: '100vh',
                width: '100vw',
            }}
        >
            {/* UI-2 */}
            <Box
                sx={{
                    position: 'absolute',
                    top: 10,
                    left: 30,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1,
                    justifyContent: 'center',

                    zIndex: 20,
                }}
            >
                <Link href="https://github.com/cornpip" target="_blank" rel="noopener noreferrer" underline="hover">
                    <Typography variant="body1" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                        @cornpip
                    </Typography>
                </Link>
            </Box>

            {/* UI */}
            <Box
                sx={{
                    position: 'absolute',
                    top: 30,
                    left: 30,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1,
                    paddingTop: 5,
                    justifyContent: 'center',
                    alignItems: 'start',
                    zIndex: 10,
                    pointerEvents: 'none',
                }}
            >
                <TextField
                    label="ex) 10, 130, 312, ...(0~467)"
                    variant="outlined"
                    size="medium"
                    sx={{
                        width: 800,
                        pointerEvents: 'auto',
                    }}
                    value={input}
                    onChange={(e) => {
                        const value = e.target.value;
                        setInput(value);

                        const indices = value
                            .split(',') // ,로 분리
                            .map((s) => s.trim()) // 공백 제거
                            .filter((s) => s !== '') // 빈 문자열 제거
                            .map(Number) // 숫자로 변환
                            .filter((n) => !isNaN(n)); // 숫자만 남기기

                        setIndex(indices); // 배열로 저장
                    }}
                />
                <Box
                    sx={{
                        display: 'flex',
                        gap: 1,
                        pointerEvents: 'auto',
                    }}
                >
                    <Button
                        variant="outlined"
                        color="primary"
                        onClick={resetView}
                        sx={{ pointerEvents: 'auto' }}
                    >
                        Reset Camera View
                    </Button>
                    <Button
                        variant="outlined"
                        color={isNumberView ? 'secondary' : 'primary'}
                        onClick={numberView}
                        sx={{ pointerEvents: 'auto' }}
                    >
                        {isNumberView ? 'cancel number view' : 'show number View'}
                    </Button>
                </Box>
                <Box
                    sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1,
                        pointerEvents: 'auto',
                    }}
                >
                    <Box
                        sx={{
                            display: 'grid',
                            gridTemplateColumns: '50px 50px 50px',
                            gridTemplateRows: '50px 50px 50px',
                            gap: 1,
                            pointerEvents: 'auto',
                        }}
                    >
                        {/* 위 */}
                        <Box />
                        <Button variant={activeButton === 'up' ? 'contained' : 'outlined'} sx={{ transition: 'none', pointerEvents: 'auto' }} onClick={moveCameraUp}>
                            ↑
                        </Button>
                        <Box />

                        {/* 좌, 가운데, 우 */}
                        <Button variant={activeButton === 'left' ? 'contained' : 'outlined'} sx={{ transition: 'none', pointerEvents: 'auto' }} onClick={moveCameraLeft}>
                            ←
                        </Button>
                        <Box />
                        <Button variant={activeButton === 'right' ? 'contained' : 'outlined'} sx={{ transition: 'none', pointerEvents: 'auto' }} onClick={moveCameraRight}>
                            →
                        </Button>

                        {/* 아래 */}
                        <Box />
                        <Button variant={activeButton === 'down' ? 'contained' : 'outlined'} sx={{ transition: 'none', pointerEvents: 'auto' }} onClick={moveCameraDown}>
                            ↓
                        </Button>
                        <Box />
                    </Box>
                    <Typography>
                        Clicked LandMark Number:{' '}
                        <Box component="span" fontWeight="bold" color="red" fontSize="1.2rem">
                            {hoveredIndex}
                        </Box>
                    </Typography>
                </Box>
            </Box>

            {/* 3D Canvas */}
            <Box
                sx={{
                    flex: 1,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                }}
            >
                <Canvas camera={{ position: [0, 0, 1.5] }}>
                    <ambientLight intensity={0.5} />
                    <directionalLight position={[0, 1, 2]} intensity={1} />
                    <OrbitControls ref={controlsRef} target={controlsTarget.current} />
                    <LandmarkPoints highlight={index} landmarks={landmarks} />
                </Canvas>
            </Box>
        </Box>
    );
}
