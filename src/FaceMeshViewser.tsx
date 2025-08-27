import { useEffect, useState, useRef, useMemo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Box, TextField, Button } from '@mui/material';
import { Vector3 } from 'three';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

type Landmark = {
    x: number;
    y: number;
    z: number;
};

// 🟢 랜드마크 점 컴포넌트
function LandmarkPoints({ highlight, landmarks }: { highlight: number | null; landmarks: Landmark[] }) {
    return (
        <group scale={[1, -1, -1]}>
            {' '}
            {/* y축 뒤집힘 보정 */}
            {landmarks.map((p, i) => (
                <mesh key={i} position={[p.x, p.y, p.z]}>
                    <sphereGeometry args={[0.01, 8, 8]} />
                    <meshStandardMaterial color={highlight === i ? 'red' : 'blue'} emissive={highlight === i ? 'red' : 'black'} />
                </mesh>
            ))}
        </group>
    );
}

// 🟢 메인 뷰어 컴포넌트
export default function FaceMeshViewer() {
    const [index, setIndex] = useState<number | null>(null);
    const [input, setInput] = useState('');
    const [landmarks, setLandmarks] = useState<Landmark[]>([]);
    const controlsRef = useRef<OrbitControlsImpl>(null);
    const defaultCameraPos = useRef(new Vector3(0, 0, 1.5));

    const targetPosition = useRef<Vector3 | null>(null);
    const targetLookAt = useRef<Vector3 | null>(null);

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
        setIndex(null);
        if (controlsRef.current) {
            controlsRef.current.object.position.copy(defaultCameraPos.current);
            controlsRef.current.target.copy(center);
            controlsRef.current.update();
        }
    };

    function CameraAnimator({ controlsRef, targetPosition, targetLookAt }: any) {
        useFrame(() => {
            if (!controlsRef.current || !targetPosition.current || !targetLookAt.current) return;

            const cam = controlsRef.current.object;
            const target = controlsRef.current.target;

            // 카메라 위치 lerp
            cam.position.lerp(targetPosition.current, 0.1);
            target.lerp(targetLookAt.current, 0.1);

            controlsRef.current.update();

            // 목표 근처 도달하면 refs 초기화 → 이후 자유롭게 회전/줌
            if (cam.position.distanceTo(targetPosition.current) < 0.01) {
                targetPosition.current = null;
                targetLookAt.current = null;
            }
        });

        return null;
    }

    // highlight 선택 시 카메라 한 번만 이동
    useEffect(() => {
        if (index !== null && landmarks[index]) {
            // LandmarkPoints와 같은 축 보정
            // const scaleFix = new Vector3(1, -1, -1);

            // const target = new Vector3(landmarks[index].x * scaleFix.x, landmarks[index].y * scaleFix.y, landmarks[index].z * scaleFix.z);

            // const offset = new Vector3(0, 0, 0.5).multiply(scaleFix);

            // targetPosition.current = target.clone().add(offset);
            // targetLookAt.current = target.clone();
        }
    }, [index, landmarks]);

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
            const scale = 1;
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

    // landmarks 불러오기
    useEffect(() => {
        fetch('/landmarks.json')
            .then((res) => res.json())
            .then((data: Landmark[]) => {
                const offsetY = -0.7; // 위로 올릴 거리
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
            {/* UI */}
            <Box
                sx={{
                    display: 'flex',
                    gap: 2,
                    p: 2,
                    justifyContent: 'center',
                    alignItems: 'center',
                }}
            >
                <TextField label="Point Index" variant="outlined" size="small" value={input} onChange={(e) => setInput(e.target.value)} />
                <Button variant="contained" onClick={() => setIndex(Number(input))}>
                    Highlight
                </Button>
                <Button variant="outlined" color="secondary" onClick={resetView}>
                    Reset
                </Button>
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
                    <OrbitControls ref={controlsRef} target={new Vector3(center.x, center.y + 0.1, center.z)} />
                    <LandmarkPoints highlight={index} landmarks={landmarks} />
                    <CameraAnimator controlsRef={controlsRef} targetPosition={targetPosition} targetLookAt={targetLookAt} />
                </Canvas>
            </Box>
        </Box>
    );
}
