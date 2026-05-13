import { useEffect, useState } from 'react';
import { collection, getDocs, query, orderBy, doc, updateDoc, Timestamp, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { logAction } from '../lib/auditLog';

interface PendingItem {
  id: string;
  orderId?: string;
  merchantOrderNo?: string;
  userEmail?: string;
  userName?: string;
  amount?: number;
  invoiceNumber?: string;
  refundedAt?: Timestamp;
  status?: 'pending' | 'completed';
  note?: string;
  completedAt?: Timestamp;
}

export default function PendingAllowance() {
  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'completed' | 'all'>('pending');
  const [marking, setMarking] = useState<string | null>(null);

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    try {
      const q = query(collection(db, 'pendingAllowance'), orderBy('refundedAt', 'desc'));
      const snapshot = await getDocs(q);
      setItems(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PendingItem, 'id'>) })));
    } catch (e) {
      console.error('Load pendingAllowance error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkComplete = async (item: PendingItem) => {
    if (!confirm(`確定將訂單 ${item.merchantOrderNo} 的折讓單標記為已完成？\n紙本流程已完成、折讓單已收回。`)) return;
    setMarking(item.id);
    try {
      await updateDoc(doc(db, 'pendingAllowance', item.id), {
        status: 'completed',
        completedAt: serverTimestamp(),
      });
      await logAction({
        action: '完成折讓單',
        detail: `訂單 ${item.merchantOrderNo}（${item.userEmail}）：發票 ${item.invoiceNumber} 折讓完成`,
        targetType: 'invoice',
        targetId: item.invoiceNumber,
      });
      await loadItems();
    } catch (e) {
      console.error(e);
      alert('標記失敗：' + (e as Error).message);
    } finally {
      setMarking(null);
    }
  };

  const formatDate = (ts?: Timestamp) => {
    if (!ts || !ts.seconds) return '—';
    const d = new Date(ts.seconds * 1000);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  };

  const filtered = items.filter((i) => {
    if (statusFilter === 'all') return true;
    return (i.status || 'pending') === statusFilter;
  });

  const pendingCount = items.filter((i) => (i.status || 'pending') === 'pending').length;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">跨期待處理發票</h1>
      <p className="text-sm text-gray-600 mb-6 leading-relaxed">
        以下發票因退款時已經跨月（過了當期申報期），eCloudLife 無法直接作廢。請聯繫客戶填寫折讓證明單，完成紙本流程後再點「標記折讓完成」。
      </p>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setStatusFilter('pending')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${statusFilter === 'pending' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}
        >
          待處理（{pendingCount}）
        </button>
        <button
          onClick={() => setStatusFilter('completed')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${statusFilter === 'completed' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}
        >
          已完成
        </button>
        <button
          onClick={() => setStatusFilter('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${statusFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}
        >
          全部
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">載入中...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            {statusFilter === 'pending' ? '🎉 沒有待處理的折讓單' : '無紀錄'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
                <tr>
                  <th className="text-left p-3">訂單編號</th>
                  <th className="text-left p-3">學員</th>
                  <th className="text-right p-3">金額</th>
                  <th className="text-left p-3">發票號碼</th>
                  <th className="text-left p-3">退款日</th>
                  <th className="text-left p-3">狀態</th>
                  <th className="text-left p-3">備註</th>
                  <th className="text-right p-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((i) => {
                  const status = i.status || 'pending';
                  return (
                    <tr key={i.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="p-3 font-mono text-sm">{i.merchantOrderNo || '—'}</td>
                      <td className="p-3 text-sm">
                        <div className="font-medium">{i.userName || '—'}</div>
                        <div className="text-xs text-gray-500">{i.userEmail || ''}</div>
                      </td>
                      <td className="p-3 text-right font-bold">NT$ {(i.amount || 0).toLocaleString()}</td>
                      <td className="p-3 text-sm font-mono">{i.invoiceNumber || '—'}</td>
                      <td className="p-3 text-sm">{formatDate(i.refundedAt)}</td>
                      <td className="p-3">
                        {status === 'completed' ? (
                          <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded">已完成</span>
                        ) : (
                          <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded">待處理</span>
                        )}
                      </td>
                      <td className="p-3 text-sm text-gray-600">{i.note || '—'}</td>
                      <td className="p-3 text-right">
                        {status === 'pending' ? (
                          <button
                            onClick={() => handleMarkComplete(i)}
                            disabled={marking === i.id}
                            className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300"
                          >
                            {marking === i.id ? '處理中...' : '標記折讓完成'}
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">{formatDate(i.completedAt)}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-4 py-3 text-sm text-gray-600 border-t border-gray-100">
              共 <strong>{filtered.length}</strong> 筆
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
