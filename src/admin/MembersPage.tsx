import { useEffect, useState } from 'react';
import { collection, getDocs, query, orderBy, Timestamp, doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface Course {
  id: string;
  title: string;
}

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
  const [courses, setCourses] = useState<Course[]>([]);
  const [grantingFor, setGrantingFor] = useState<Member | null>(null);
  const [grantBusy, setGrantBusy] = useState(false);

  useEffect(() => {
    loadMembers();
    loadCourses();
  }, []);

  const loadCourses = async () => {
    try {
      const snap = await getDocs(collection(db, 'courses'));
      const list: Course[] = snap.docs.map(d => ({ id: d.id, title: (d.data() as { title?: string }).title || d.id }));
      setCourses(list);
    } catch (e) {
      console.error('Load courses error:', e);
    }
  };

  const handleGrantCourse = async (courseId: string) => {
    if (!grantingFor) return;
    setGrantBusy(true);
    try {
      await updateDoc(doc(db, 'users', grantingFor.uid), { purchasedCourses: arrayUnion(courseId) });
      alert(`已贈送課程「${courses.find(c => c.id === courseId)?.title || courseId}」給 ${grantingFor.displayName || grantingFor.email}`);
      setGrantingFor(null);
      await loadMembers();
    } catch (e) {
      console.error(e);
      alert('贈送失敗：' + (e as Error).message);
    } finally {
      setGrantBusy(false);
    }
  };

  const handleRevokeCourse = async (member: Member, courseId: string) => {
    if (!confirm(`確定要移除 ${member.displayName || member.email} 的課程「${courses.find(c => c.id === courseId)?.title || courseId}」嗎？`)) return;
    try {
      await updateDoc(doc(db, 'users', member.uid), { purchasedCourses: arrayRemove(courseId) });
      await loadMembers();
    } catch (e) {
      alert('移除失敗：' + (e as Error).message);
    }
  };

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
                  <th className="text-center p-3">操作</th>
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
                    <td className="p-3 text-center">
                      <button
                        onClick={() => setGrantingFor(m)}
                        className="px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600"
                      >
                        贈送課程
                      </button>
                    </td>
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

      {/* 贈送課程 Modal */}
      {grantingFor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => !grantBusy && setGrantingFor(null)}>
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-2">贈送課程</h3>
            <p className="text-sm text-gray-600 mb-4">
              對象：<strong>{grantingFor.displayName || grantingFor.email}</strong>
            </p>
            {(grantingFor.purchasedCourses?.length || 0) > 0 && (
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-2">已擁有的課程（點 ✕ 移除）：</p>
                <div className="space-y-1">
                  {grantingFor.purchasedCourses!.map(cid => (
                    <div key={cid} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                      <span>{courses.find(c => c.id === cid)?.title || cid}</span>
                      <button onClick={() => handleRevokeCourse(grantingFor, cid)} className="text-red-500 hover:text-red-700 text-xs">✕ 移除</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <p className="text-xs text-gray-500 mb-2">選擇要贈送的課程：</p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {courses.length === 0 ? (
                <p className="text-sm text-gray-400">尚無課程資料</p>
              ) : (
                courses.map(c => {
                  const owned = grantingFor.purchasedCourses?.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      disabled={owned || grantBusy}
                      onClick={() => handleGrantCourse(c.id)}
                      className={`w-full text-left p-3 rounded border text-sm ${owned ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'hover:bg-blue-50 border-gray-200'}`}
                    >
                      {c.title} {owned && '（已擁有）'}
                    </button>
                  );
                })
              )}
            </div>
            <div className="flex justify-end mt-4">
              <button onClick={() => setGrantingFor(null)} disabled={grantBusy} className="px-4 py-2 text-sm bg-gray-100 rounded hover:bg-gray-200">
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
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
