import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { logAction } from '../lib/auditLog';

interface CourseOption {
  id: string;
  title: string;
}

export default function CourseNotify() {
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [lineMessage, setLineMessage] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailContent, setEmailContent] = useState('');
  const [audience, setAudience] = useState<'paid' | 'checkedIn'>('paid');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadCourses();
  }, []);

  const loadCourses = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'courses'));
      setCourses(snapshot.docs.map((d) => ({ id: d.id, title: (d.data() as { title?: string }).title || d.id })));
    } catch (e) {
      console.error(e);
    }
  };

  const canSend = selectedCourse && lineMessage && (!sendEmail || (emailSubject && emailContent));

  const handleSend = async () => {
    if (!canSend) return;
    if (!confirm(`確定發送推播給該課程「${audience === 'paid' ? '已付款' : '已報到'}」學員？\n包含管道：LINE${sendEmail ? ' + Email' : ''}`)) return;
    setSending(true);
    try {
      // 佔位：真正發送要呼叫 Cloud Function 批次推送
      const courseTitle = courses.find((c) => c.id === selectedCourse)?.title || selectedCourse;
      await logAction({
        action: '課中推播',
        detail: `課程「${courseTitle}」對象=${audience === 'paid' ? '已付款學員' : '已報到學員'}：${lineMessage.slice(0, 80)}${lineMessage.length > 80 ? '...' : ''}`,
        targetType: 'course',
        targetId: selectedCourse,
      });
      alert('推播已送出！\n（實際 LINE / Email 發送需後端 Cloud Function 配合）');
      setLineMessage('');
      setEmailSubject('');
      setEmailContent('');
    } catch (e) {
      alert('送出失敗：' + (e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">課中推播</h1>
      <p className="text-sm text-gray-600 mb-6">針對特定課程的學員，透過 LINE + Email 發送訊息</p>

      <div className="bg-white rounded-lg shadow-sm p-6 space-y-5 max-w-4xl">
        <div>
          <label className="block text-sm font-medium mb-2">選擇課程 *</label>
          <select
            value={selectedCourse}
            onChange={(e) => setSelectedCourse(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
          >
            <option value="">請選擇課程</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">對象</label>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" checked={audience === 'paid'} onChange={() => setAudience('paid')} />
              已付款學員（全部報名者）
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={audience === 'checkedIn'} onChange={() => setAudience('checkedIn')} />
              已報到學員（實體課專用）
            </label>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">LINE 訊息內容 *</label>
          <textarea
            value={lineMessage}
            onChange={(e) => setLineMessage(e.target.value)}
            placeholder="輸入要透過 LINE 發送的訊息..."
            rows={5}
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
          />
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium mb-3">
            <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
            同時發送 Email
          </label>
          {sendEmail && (
            <div className="pl-6 space-y-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Email 主旨</label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="例：課程重要通知"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Email 內容</label>
                <textarea
                  value={emailContent}
                  onChange={(e) => setEmailContent(e.target.value)}
                  placeholder="輸入 Email 內容..."
                  rows={5}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
          )}
        </div>

        <button
          onClick={handleSend}
          disabled={!canSend || sending}
          className="px-6 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400"
        >
          {sending ? '發送中...' : '發送推播'}
        </button>
      </div>
    </div>
  );
}
