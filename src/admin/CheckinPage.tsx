import { useEffect, useState } from 'react';
import { collection, getDocs, query, where, doc, updateDoc, Timestamp, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { logAction } from '../lib/auditLog';

interface CourseSession {
  id: string;
  title: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  capacity?: number;
}

interface Attendee {
  orderId: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  userPhone?: string;
  checkedIn?: boolean;
  checkedInAt?: Timestamp;
}

export default function CheckinPage() {
  const [courses, setCourses] = useState<CourseSession[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<string>('');
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);

  useEffect(() => {
    loadCourses();
  }, []);

  useEffect(() => {
    if (selectedCourse) loadAttendees(selectedCourse);
  }, [selectedCourse]);

  const loadCourses = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'courses'));
      setCourses(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CourseSession, 'id'>) })));
    } catch (e) {
      console.error(e);
    }
  };

  const loadAttendees = async (courseId: string) => {
    setLoading(true);
    try {
      const q = query(
        collection(db, 'orders'),
        where('courseId', '==', courseId),
        where('status', '==', 'paid')
      );
      const snapshot = await getDocs(q);
      const list: Attendee[] = [];
      for (const d of snapshot.docs) {
        const data = d.data();
        // 抓 user 資訊
        let userName = '', userEmail = '', userPhone = '';
        try {
          const userSnap = await getDocs(query(collection(db, 'users'), where('uid', '==', data.userId)));
          if (!userSnap.empty) {
            const u = userSnap.docs[0].data();
            userName = u.displayName || '';
            userEmail = u.email || '';
            userPhone = u.phone || '';
          }
        } catch {/* ignore */}
        list.push({
          orderId: d.id,
          userId: data.userId,
          userName,
          userEmail: userEmail || data.userEmail,
          userPhone,
          checkedIn: !!data.checkedIn,
          checkedInAt: data.checkedInAt,
        });
      }
      setAttendees(list);
    } catch (e) {
      console.error('Load attendees error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckin = async (a: Attendee) => {
    setChecking(a.orderId);
    try {
      await updateDoc(doc(db, 'orders', a.orderId), {
        checkedIn: true,
        checkedInAt: serverTimestamp(),
      });
      await logAction({
        action: '手動報到',
        detail: `學員 ${a.userName || a.userEmail}（訂單 ${a.orderId}）`,
        targetType: 'order',
        targetId: a.orderId,
      });
      await loadAttendees(selectedCourse);
    } catch (e) {
      alert('報到失敗：' + (e as Error).message);
    } finally {
      setChecking(null);
    }
  };

  const course = courses.find((c) => c.id === selectedCourse);
  const checkedInCount = attendees.filter((a) => a.checkedIn).length;
  const notCheckedInCount = attendees.length - checkedInCount;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">報到管理</h1>

      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <label className="block text-sm font-medium mb-2">選擇課程</label>
        <select
          value={selectedCourse}
          onChange={(e) => setSelectedCourse(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2"
        >
          <option value="">請選擇課程</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        {course && (
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm text-gray-700">
            {course.date && <div>日期：<strong>{course.date}</strong></div>}
            {course.startTime && <div>時間：<strong>{course.startTime}{course.endTime ? `-${course.endTime}` : ''}</strong></div>}
            {course.location && <div>地點：<strong>{course.location}</strong></div>}
            {course.capacity != null && <div>人數上限：<strong>{course.capacity} 人</strong></div>}
          </div>
        )}
      </div>

      {selectedCourse && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow-sm p-4 text-center">
              <div className="text-3xl font-bold text-blue-600">{attendees.length}</div>
              <div className="text-sm text-gray-600 mt-1">已報名</div>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-4 text-center">
              <div className="text-3xl font-bold text-green-600">{checkedInCount}</div>
              <div className="text-sm text-gray-600 mt-1">已報到</div>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-4 text-center">
              <div className="text-3xl font-bold text-red-500">{notCheckedInCount}</div>
              <div className="text-sm text-gray-600 mt-1">未報到</div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
              <h2 className="font-bold">學員列表</h2>
              <button onClick={() => loadAttendees(selectedCourse)} className="text-sm text-blue-600 hover:underline">重新整理</button>
            </div>
            {loading ? (
              <div className="p-12 text-center text-gray-500">載入中...</div>
            ) : attendees.length === 0 ? (
              <div className="p-12 text-center text-gray-500">尚無已付款學員</div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
                  <tr>
                    <th className="text-left p-3">姓名</th>
                    <th className="text-left p-3">Email</th>
                    <th className="text-left p-3">電話</th>
                    <th className="text-left p-3">報到狀態</th>
                    <th className="text-right p-3">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {attendees.map((a) => (
                    <tr key={a.orderId} className="border-t border-gray-100">
                      <td className="p-3 text-sm font-medium">{a.userName || '—'}</td>
                      <td className="p-3 text-sm">{a.userEmail || '—'}</td>
                      <td className="p-3 text-sm">{a.userPhone || '—'}</td>
                      <td className="p-3 text-sm">
                        {a.checkedIn ? (
                          <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded">已報到</span>
                        ) : (
                          <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">未報到</span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        {a.checkedIn ? (
                          <span className="text-xs text-gray-400">—</span>
                        ) : (
                          <button
                            onClick={() => handleCheckin(a)}
                            disabled={checking === a.orderId}
                            className="text-blue-600 text-sm hover:underline disabled:text-gray-300"
                          >
                            {checking === a.orderId ? '處理中...' : '手動報到'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
