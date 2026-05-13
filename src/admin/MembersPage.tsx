import { useEffect, useState } from 'react';
import { collection, getDocs, query, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface Member {
  uid: string;
  displayName?: string;
  email?: string;
  phone?: string;
  lineId?: string | null;
  profileCompleted?: boolean;
  purchasedCourses?: string[];
  createdAt?: Timestamp | { seconds: number; nanoseconds: number };
}

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadMembers();
  }, []);

  const loadMembers = async () => {
    try {
      const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<Member, 'uid'>) }));
      setMembers(list);
    } catch (e) {
      console.error('Load members error:', e);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (ts: Member['createdAt']) => {
    if (!ts) return '—';
    const seconds = 'seconds' in ts ? ts.seconds : (ts as Timestamp).seconds;
    if (!seconds) return '—';
    const d = new Date(seconds * 1000);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const filtered = members.filter((m) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (m.displayName || '').toLowerCase().includes(q) ||
      (m.email || '').toLowerCase().includes(q) ||
      (m.phone || '').includes(q)
    );
  });

  const totalMembers = members.length;
  const completedProfile = members.filter((m) => m.profileCompleted).length;
  const lineLinked = members.filter((m) => m.lineId).length;
  const purchased = members.filter((m) => (m.purchasedCourses?.length || 0) > 0).length;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">會員管理</h1>

      {/* 統計卡 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="總會員數" value={totalMembers} color="text-blue-600" />
        <StatCard label="已完成資料" value={completedProfile} color="text-green-600" />
        <StatCard label="LINE 已綁定" value={lineLinked} color="text-emerald-600" />
        <StatCard label="已購買課程" value={purchased} color="text-purple-600" />
      </div>

      {/* 搜尋 */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜尋：姓名、Email、電話..."
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* 列表 */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">載入中...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            {members.length === 0 ? '尚無會員' : '無符合條件的會員'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
                <tr>
                  <th className="text-left p-3">姓名</th>
                  <th className="text-left p-3">Email</th>
                  <th className="text-left p-3">電話</th>
                  <th className="text-center p-3">LINE</th>
                  <th className="text-center p-3">資料</th>
                  <th className="text-center p-3">已購課程</th>
                  <th className="text-left p-3">註冊時間</th>
                  <th className="text-left p-3">UID</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.uid} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="p-3 font-medium">{m.displayName || '—'}</td>
                    <td className="p-3 text-sm">{m.email || '—'}</td>
                    <td className="p-3 text-sm">{m.phone || '—'}</td>
                    <td className="p-3 text-center">
                      {m.lineId ? <span className="text-green-600">✓</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="p-3 text-center">
                      {m.profileCompleted ? (
                        <span className="inline-block px-2 py-1 text-xs bg-green-100 text-green-700 rounded">完整</span>
                      ) : (
                        <span className="inline-block px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded">未完成</span>
                      )}
                    </td>
                    <td className="p-3 text-center font-bold">{m.purchasedCourses?.length || 0}</td>
                    <td className="p-3 text-sm text-gray-600">{formatDate(m.createdAt)}</td>
                    <td className="p-3 text-xs font-mono text-gray-400">{m.uid.slice(0, 10)}...</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-3 text-sm text-gray-600 border-t border-gray-100">
              共 <strong>{filtered.length}</strong> 位會員
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-lg shadow-sm p-4">
      <div className="text-sm text-gray-600 mb-1">{label}</div>
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
