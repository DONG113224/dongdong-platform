import { useEffect, useRef, useState } from 'react';
import { collection, getDocs, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { logAction } from '../lib/auditLog';

interface CourseOption {
  id: string;
  title: string;
}

interface ScanResult {
  time: string;
  status: 'success' | 'duplicate' | 'not-found' | 'wrong-course' | 'error';
  message: string;
  userName?: string;
}

export default function CheckinScan() {
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [manualOrderId, setManualOrderId] = useState('');
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<ScanResult[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    loadCourses();
    return () => stopCamera();
  }, []);

  const loadCourses = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'courses'));
      setCourses(snapshot.docs.map((d) => ({ id: d.id, title: (d.data() as { title?: string }).title || d.id })));
    } catch (e) {
      console.error(e);
    }
  };

  const startCamera = async () => {
    if (!selectedCourse) return alert('請先選擇課程');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setScanning(true);
      alert('相機已開啟。\n注意：QR Code 自動解碼需引入 jsQR 套件，目前先用「手動輸入訂單編號」方式測試。');
    } catch (e) {
      alert('無法開啟相機：' + (e as Error).message);
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  };

  const processCheckin = async (orderId: string) => {
    if (!selectedCourse) return alert('請先選擇課程');
    if (!orderId.trim()) return;
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    try {
      const orderRef = doc(db, 'orders', orderId.trim());
      const orderSnap = await getDoc(orderRef);
      if (!orderSnap.exists()) {
        setResults((prev) => [{ time, status: 'not-found', message: `找不到訂單 ${orderId}` }, ...prev]);
        return;
      }
      const data = orderSnap.data();
      if (data.courseId !== selectedCourse) {
        setResults((prev) => [{ time, status: 'wrong-course', message: `訂單課程不符：${data.courseTitle}` }, ...prev]);
        return;
      }
      if (data.status !== 'paid') {
        setResults((prev) => [{ time, status: 'error', message: `訂單尚未付款：${orderId}` }, ...prev]);
        return;
      }
      if (data.checkedIn) {
        setResults((prev) => [{ time, status: 'duplicate', message: '重複報到', userName: data.userEmail }, ...prev]);
        return;
      }

      // 抓 userName
      let userName = data.userEmail || '';
      try {
        const userSnap = await getDoc(doc(db, 'users', data.userId));
        if (userSnap.exists()) userName = userSnap.data().displayName || userName;
      } catch {/* ignore */}

      await updateDoc(orderRef, { checkedIn: true, checkedInAt: serverTimestamp() });
      await logAction({
        action: 'QR 報到',
        detail: `學員 ${userName}（訂單 ${orderId}）`,
        targetType: 'order',
        targetId: orderId,
      });
      setResults((prev) => [{ time, status: 'success', message: '報到成功 ✓', userName }, ...prev]);
      setManualOrderId('');
    } catch (e) {
      setResults((prev) => [{ time, status: 'error', message: (e as Error).message }, ...prev]);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    processCheckin(manualOrderId);
  };

  const colorOf = (s: ScanResult['status']) => ({
    success: 'bg-green-50 border-green-300 text-green-800',
    duplicate: 'bg-yellow-50 border-yellow-300 text-yellow-800',
    'not-found': 'bg-red-50 border-red-300 text-red-800',
    'wrong-course': 'bg-orange-50 border-orange-300 text-orange-800',
    error: 'bg-red-50 border-red-300 text-red-800',
  }[s]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">報到掃描</h1>

      <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
        <label className="block text-sm font-medium mb-2">選擇課程</label>
        <select
          value={selectedCourse}
          onChange={(e) => setSelectedCourse(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2"
        >
          <option value="">請選擇課程</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="bg-white rounded-lg shadow-sm p-4">
          <h2 className="font-bold mb-3">📷 QR 掃描</h2>
          <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden mb-3">
            <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
            {!scanning && (
              <div className="absolute inset-0 flex items-center justify-center text-white text-sm">未啟動</div>
            )}
          </div>
          <div className="flex gap-2">
            {!scanning ? (
              <button onClick={startCamera} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">開啟相機</button>
            ) : (
              <button onClick={stopCamera} className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg text-sm hover:bg-gray-700">關閉相機</button>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-2">註：QR 自動解碼需安裝 jsQR 套件後完成</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-4">
          <h2 className="font-bold mb-3">⌨ 手動輸入訂單編號</h2>
          <form onSubmit={handleManualSubmit} className="space-y-3">
            <input
              type="text"
              value={manualOrderId}
              onChange={(e) => setManualOrderId(e.target.value)}
              placeholder="貼上訂單編號"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono text-sm"
            />
            <button
              type="submit"
              disabled={!selectedCourse || !manualOrderId}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:bg-gray-300"
            >
              確認報到
            </button>
          </form>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
          <h2 className="font-bold">報到紀錄</h2>
          <button onClick={() => setResults([])} className="text-sm text-gray-500 hover:underline">清空</button>
        </div>
        {results.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">尚無紀錄</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {results.map((r, i) => (
              <li key={i} className={`p-3 text-sm border-l-4 ${colorOf(r.status)}`}>
                <span className="font-mono text-xs mr-3">{r.time}</span>
                {r.userName && <strong className="mr-2">{r.userName}</strong>}
                {r.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
