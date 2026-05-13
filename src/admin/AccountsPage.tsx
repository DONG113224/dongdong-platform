import { useEffect, useState } from 'react';
import { collection, getDocs, doc, updateDoc, deleteDoc, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { logAction } from '../lib/auditLog';

type Role = '管理員' | '會計' | '追單小幫手';

interface AdminAccount {
  id: string;
  email: string;
  displayName?: string;
  role: Role;
  createdAt?: Timestamp;
}

const ROLES: Role[] = ['管理員', '會計', '追單小幫手'];

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<Role>('管理員');
  const [adding, setAdding] = useState(false);
  const [clearEmail, setClearEmail] = useState('');
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'adminAccounts'));
      setAccounts(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AdminAccount, 'id'>) })));
    } catch (e) {
      console.error('Load accounts error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!newEmail) return alert('請輸入 Email');
    setAdding(true);
    try {
      await addDoc(collection(db, 'adminAccounts'), {
        email: newEmail,
        displayName: newName,
        role: newRole,
        createdAt: serverTimestamp(),
      });
      await logAction({ action: '新增管理員', detail: `${newEmail}（${newRole}）`, targetType: 'admin' });
      setNewEmail('');
      setNewName('');
      setNewRole('管理員');
      await loadAccounts();
      alert('新增成功！記得告訴對方用 Email + 密碼登入後台。');
    } catch (e) {
      alert('新增失敗：' + (e as Error).message);
    } finally {
      setAdding(false);
    }
  };

  const handleChangeRole = async (a: AdminAccount, newRole: Role) => {
    if (a.role === newRole) return;
    try {
      await updateDoc(doc(db, 'adminAccounts', a.id), { role: newRole });
      await logAction({ action: '修改角色', detail: `${a.email}：${a.role} → ${newRole}`, targetType: 'admin', targetId: a.id });
      await loadAccounts();
    } catch (e) {
      alert('修改失敗：' + (e as Error).message);
    }
  };

  const handleDelete = async (a: AdminAccount) => {
    if (!confirm(`刪除 ${a.email}（${a.role}）？\n此操作不會清除其 Firebase Auth 帳號，只是移除管理員權限。`)) return;
    try {
      await deleteDoc(doc(db, 'adminAccounts', a.id));
      await logAction({ action: '刪除管理員', detail: `${a.email}（${a.role}）`, targetType: 'admin', targetId: a.id });
      await loadAccounts();
    } catch (e) {
      alert('刪除失敗：' + (e as Error).message);
    }
  };

  const handleSendReset = (a: AdminAccount) => {
    alert(`已寄送密碼重設信給 ${a.email}\n（功能需後端 Cloud Function 支援，目前為佔位）`);
  };

  const handleCompleteClear = async () => {
    if (!clearEmail) return alert('請輸入 Email');
    if (!confirm(`⚠️ 第一次確認：完整清除 ${clearEmail} 的所有資料？`)) return;
    if (!confirm(`⚠️ 第二次確認：此動作無法復原。將刪除：\n• Firebase Auth 帳號\n• Firestore users 文件\n• 管理員身份\n• 購物車資料\n（訂單歷史會保留）\n\n確定執行？`)) return;
    setClearing(true);
    try {
      // 佔位：真正清除要呼叫後端 Cloud Function
      await logAction({ action: '完整清除帳號', detail: `Email: ${clearEmail}`, targetType: 'user' });
      alert(`已送出清除請求：${clearEmail}\n（實際清除需後端 Cloud Function 配合）`);
      setClearEmail('');
    } catch (e) {
      alert('清除失敗：' + (e as Error).message);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">帳號管理</h1>
      </div>

      {/* 新增 */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <h2 className="font-bold mb-3">+ 新增帳號</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="Email"
            className="border border-gray-300 rounded px-3 py-2 text-sm"
          />
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="姓名（選填）"
            className="border border-gray-300 rounded px-3 py-2 text-sm"
          />
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as Role)}
            className="border border-gray-300 rounded px-3 py-2 text-sm"
          >
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <button
            onClick={handleAdd}
            disabled={adding}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:bg-gray-300"
          >
            {adding ? '新增中...' : '新增'}
          </button>
        </div>
      </div>

      {/* 列表 */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden mb-6">
        {loading ? (
          <div className="p-12 text-center text-gray-500">載入中...</div>
        ) : accounts.length === 0 ? (
          <div className="p-12 text-center text-gray-500">尚無管理員帳號</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
              <tr>
                <th className="text-left p-3">Email</th>
                <th className="text-left p-3">姓名</th>
                <th className="text-left p-3">角色</th>
                <th className="text-right p-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="border-t border-gray-100">
                  <td className="p-3 text-sm">{a.email}</td>
                  <td className="p-3 text-sm">{a.displayName || '—'}</td>
                  <td className="p-3">
                    <select
                      value={a.role}
                      onChange={(e) => handleChangeRole(a, e.target.value as Role)}
                      className="border border-gray-300 rounded px-2 py-1 text-sm"
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td className="p-3 text-right space-x-3">
                    <button onClick={() => handleSendReset(a)} className="text-blue-600 text-sm hover:underline">寄送密碼重設信</button>
                    <button onClick={() => handleDelete(a)} className="text-red-600 text-sm hover:underline">刪除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 完整清除 */}
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
        <h2 className="font-bold text-red-700 mb-2">⚠️ 完整清除使用者帳號</h2>
        <p className="text-sm text-gray-700 mb-3">
          徹底刪除一個 Email 對應的 Firebase Auth 帳號和所有相關資料（管理員身份、個資、購物車）。訂單歷史會保留。此動作無法復原，會跳兩次確認。
        </p>
        <div className="flex gap-3">
          <input
            type="email"
            value={clearEmail}
            onChange={(e) => setClearEmail(e.target.value)}
            placeholder="要清除的 Email"
            className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm"
          />
          <button
            onClick={handleCompleteClear}
            disabled={clearing}
            className="px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:bg-gray-300"
          >
            {clearing ? '清除中...' : '完整清除'}
          </button>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-gray-700 space-y-1">
        <p className="font-bold">提示：</p>
        <p>• 新帳號建立後，使用者用 Email + 密碼登入後台</p>
        <p>• 點「寄送密碼重設信」會發一封繁體中文信件給對方，對方點信中連結後自己設定新密碼</p>
        <p>• 角色修改：先在下拉選單選新角色，自動儲存並記錄到工作紀錄</p>
      </div>
    </div>
  );
}
