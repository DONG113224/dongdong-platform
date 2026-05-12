import { useEffect, useState } from 'react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../lib/firebase';
import api from '../lib/api';

interface BroadcastLog {
  id: string;
  message: string;
  sent: number;
  failed: number;
  totalTargets: number;
  createdAt: { toDate: () => Date };
}

export default function LineNotify() {
  const [message, setMessage] = useState('');
  const [lineUserCount, setLineUserCount] = useState(0);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);
  const [error, setError] = useState('');
  const [logs, setLogs] = useState<BroadcastLog[]>([]);

  useEffect(() => {
    loadLineUserCount();
    loadBroadcastLogs();
  }, []);

  const loadLineUserCount = async () => {
    if (!isFirebaseConfigured) return;
    try {
      const q = query(collection(db, 'users'), where('messagingLineId', '!=', ''));
      const snap = await getDocs(q);
      setLineUserCount(snap.size);
    } catch (err) {
      console.warn('無法載入 LINE 用戶數量', err);
    }
  };

  const loadBroadcastLogs = async () => {
    if (!isFirebaseConfigured) return;
    try {
      const q = query(collection(db, 'broadcastLogs'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as BroadcastLog)));
    } catch (err) {
      console.warn('無法載入群發紀錄', err);
    }
  };

  const handleSend = async () => {
    if (!message.trim()) {
      setError('請輸入通知內容');
      return;
    }

    setSending(true);
    setError('');
    setResult(null);

    try {
      const res = await api.post('/lineBroadcast', { message: message.trim() });
      setResult({ sent: res.data.sent, failed: res.data.failed });
      setMessage('');
      await loadBroadcastLogs();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : '發送失敗';
      setError(errorMsg);
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">LINE 通知</h2>

      <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-gray-600">可接收推播的用戶數：</span>
          <span className="text-lg font-bold text-green-600">{lineUserCount}</span>
          <span className="text-xs text-gray-400">（已加入 LINE 官方帳號好友）</span>
        </div>

        <label className="block text-sm font-medium text-gray-700 mb-2">
          通知內容
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="請輸入要發送的通知內容..."
          rows={5}
          className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
        />

        {message.trim() && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <p className="text-sm font-medium text-gray-500 mb-2">訊息預覽</p>
            <p className="whitespace-pre-wrap text-gray-800">{message.trim()}</p>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-4 p-3 bg-green-50 rounded-lg text-sm">
            <p className="text-green-700">
              發送完成：成功 <span className="font-bold">{result.sent}</span> 人，
              失敗 <span className="font-bold">{result.failed}</span> 人
            </p>
          </div>
        )}

        <button
          onClick={handleSend}
          disabled={sending || !message.trim()}
          className="mt-4 px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 font-medium"
        >
          {sending ? '發送中...' : `發送給所有用戶 (${lineUserCount} 人)`}
        </button>
      </div>

      {/* 群發紀錄 */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-bold">群發紀錄</h3>
        </div>
        {logs.length === 0 ? (
          <p className="text-center text-gray-500 py-8">尚無群發紀錄</p>
        ) : (
          <div className="divide-y">
            {logs.map((log) => (
              <div key={log.id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{log.message}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-gray-400">
                      {log.createdAt?.toDate?.().toLocaleString('zh-TW', {
                        year: 'numeric', month: '2-digit', day: '2-digit',
                        hour: '2-digit', minute: '2-digit',
                      }) || '-'}
                    </p>
                    <p className="text-xs mt-1">
                      <span className="text-green-600">成功 {log.sent}</span>
                      {log.failed > 0 && <span className="text-red-500 ml-2">失敗 {log.failed}</span>}
                      <span className="text-gray-400 ml-2">/ {log.totalTargets} 人</span>
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
