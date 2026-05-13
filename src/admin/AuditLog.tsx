import { useEffect, useState } from 'react';
import { collection, getDocs, query, orderBy, limit, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface LogEntry {
  id: string;
  timestamp?: Timestamp;
  actorEmail?: string;
  actorUid?: string;
  action?: string;
  detail?: string;
  targetType?: string;
  targetId?: string;
}

const ACTION_COLORS: Record<string, string> = {
  '發送 LINE 訊息': 'text-blue-600',
  '管理員取消訂單': 'text-orange-600',
  '管理員折價': 'text-yellow-600',
  '更改訂單課程': 'text-purple-600',
  '作廢發票': 'text-red-600',
  '執行退款': 'text-red-700',
  '免單': 'text-pink-600',
  '寄送 Email': 'text-blue-500',
  '新增管理員': 'text-green-600',
  '刪除管理員': 'text-red-600',
  '修改角色': 'text-indigo-600',
};

export default function AuditLog() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState<string>('all');
  const [filterActor, setFilterActor] = useState<string>('');

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    try {
      const q = query(collection(db, 'auditLog'), orderBy('timestamp', 'desc'), limit(500));
      const snapshot = await getDocs(q);
      setLogs(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<LogEntry, 'id'>) })));
    } catch (e) {
      console.error('Load audit logs error:', e);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (ts?: Timestamp) => {
    if (!ts || !ts.seconds) return '—';
    const d = new Date(ts.seconds * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const uniqueActions = Array.from(new Set(logs.map((l) => l.action || '').filter(Boolean)));

  const filtered = logs.filter((l) => {
    if (filterAction !== 'all' && l.action !== filterAction) return false;
    if (filterActor && !(l.actorEmail || '').toLowerCase().includes(filterActor.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">工作紀錄</h1>
      <p className="text-sm text-gray-500 mb-4">記錄管理員所有關鍵操作，最多保留最近 500 筆</p>

      <div className="bg-white rounded-lg shadow-sm p-4 mb-4 flex flex-wrap gap-3 items-center">
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="all">全部動作</option>
          {uniqueActions.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <input
          type="text"
          value={filterActor}
          onChange={(e) => setFilterActor(e.target.value)}
          placeholder="搜尋操作者 Email"
          className="flex-1 min-w-[200px] border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <button
          onClick={loadLogs}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          重新整理
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">載入中...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            {logs.length === 0 ? '尚無工作紀錄' : '無符合條件的紀錄'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
                <tr>
                  <th className="text-left p-3 w-44">時間</th>
                  <th className="text-left p-3 w-56">操作者</th>
                  <th className="text-left p-3 w-40">動作</th>
                  <th className="text-left p-3">詳情</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => (
                  <tr key={l.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="p-3 text-sm font-mono text-gray-600">{formatTime(l.timestamp)}</td>
                    <td className="p-3 text-sm">{l.actorEmail || '系統'}</td>
                    <td className={`p-3 text-sm font-medium ${ACTION_COLORS[l.action || ''] || 'text-gray-700'}`}>
                      {l.action || '—'}
                    </td>
                    <td className="p-3 text-sm text-gray-700">{l.detail || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-3 text-sm text-gray-600 border-t border-gray-100">
              共 <strong>{filtered.length}</strong> 筆紀錄
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
