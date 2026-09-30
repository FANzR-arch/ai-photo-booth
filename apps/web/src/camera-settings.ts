const key = 'snap-camera-device';
export function selectedCamera(): string {
    try { return localStorage.getItem(key) || ''; } catch { return ''; }
}
export function saveCamera(deviceId: string) { localStorage.setItem(key, deviceId); }
export function cameraConstraints(deviceId = selectedCamera()): MediaStreamConstraints {
    return { video: { ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' }), width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false };
}
export function cameraFailure(name: string): string {
    const messages: Record<string, string> = {
        NotAllowedError: '请允许浏览器使用摄像头，再重新连接。',
        NotFoundError: '没有找到摄像头，请检查 USB 连接。',
        OverconstrainedError: '已选摄像头不可用。请接回原设备，或让管理员重新选择摄像头。',
        NotReadableError: '摄像头被占用或无法读取，请关闭会议、相机等软件后重试。',
    };
    return messages[name] || '摄像头未能开启，请检查设备连接和浏览器权限后重试。';
}
