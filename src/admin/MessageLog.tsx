import { useState } from 'react';
import api from '../lib/api';

interface LogEntry {
  id: string;
  type: 'email' | 'line';
  to: string;
  userId: string;
  subject: string;
  content: string;
  orderId: string;
  status: string;
  createdAt: string | null;
}

export default function MessageLog() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filter state
  const [searchText, setSearchText] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'email' | 'line'>('all');

  const limit = 50;

  const fetchLogs = async (p: number) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page: p, limit };
      if (searchText.trim()) params.search = searchText.trim();
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      if (typeFilter !== 'all') params.type = typeFilter;
      const res = await api.get('/getMessageLogs', { params });
      setLogs(res.data.logs);
      setTotal(res.data.total);
      setPage(p);
      setSearched(true);
    } catch {
      alert('載入訊息紀錄失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    fetchLogs(1);
  };

  const totalPages = Math.ceil(total / limit);

  const formatTime = (iso: string | null) => {
    if (!iso) return '-';
    const d = new Date(iso);
    return d.toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const stripHtml = (html: string) => {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">訊息紀錄</h2>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm mb-6 space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <input
            type="text"
            placeholder="搜尋收件者、內容..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="border rounded-lg px-4 py-2 flex-1 min-w-[200px]"
          />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as 'all' | 'email' | 'line')}
            className="border rounded-lg px-3 py-2"
          >
            <option value="all">全部類型</option>
            <option value="email">Email</option>
            <option value="line">LINE</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <span className="text-sm text-gray-600">日期：</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border rounded-lg px-3 py-2"
          />
          <span className="text-gray-400">至</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="border rounded-lg px-3 py-2"
          />
          <button
            onClick={handleSearch}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
          >
            查詢
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-gray-500">載入中...</p>
      ) : !searched ? (
        <div className="bg-white rounded-xl p-12 text-center shadow-sm">
          <p className="text-gray-500">點擊「查詢」載入訊息紀錄</p>
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center shadow-sm">
          <p className="text-gray-500">無訊息紀錄</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">時間</th>
                  <th className="px-4 py-3 font-medium">類型</th>
                  <th className="px-4 py-3 font-medium">收件者</th>
                  <th className="px-4 py-3 font-medium">主旨/內容</th>
                  <th className="px-4 py-3 font-medium">狀態</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                  >
                    <td className="px-4 py-3 whitespace-nowrap">{formatTime(log.createdAt)}</td>
                    <td className="px-4 py-3">
                      {log.type === 'email' ? (
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                          Email
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          LINE
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-[200px] truncate" title={log.to}>
                      {log.to}
                    </td>
                    <td className="px-4 py-3 max-w-[300px]">
                      {log.subject && log.subject !== 'LINE 訊息' && (
                        <span className="block text-gray-800 font-medium truncate">{log.subject}</span>
                      )}
                      <span className="block truncate text-gray-500">
                        {stripHtml(log.content || '').substring(0, 60)}
                        {stripHtml(log.content || '').length > 60 ? '...' : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        {log.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Expanded detail */}
            {expandedId && (() => {
              const log = logs.find((l) => l.id === expandedId);
              if (!log) return null;
              return (
                <div className="px-6 py-4 border-t bg-gray-50">
                  <div className="flex justify-between items-start mb-3">
                    <h4 className="font-bold text-gray-700">訊息詳情</h4>
                    <button onClick={() => setExpandedId(null)} className="text-gray-400 hover:text-gray-600">&times;</button>
                  </div>
                  <div className="grid grid-cols-[100px_1fr] gap-y-2 text-sm mb-3">
                    <span className="text-gray-500">類型</span>
                    <span>{log.type === 'email' ? 'Email' : 'LINE'}</span>
                    <span className="text-gray-500">收件者</span>
                    <span>{log.to}</span>
                    {log.subject && log.subject !== 'LINE 訊息' && (
                      <>
                        <span className="text-gray-500">主旨</span>
                        <span>{log.subject}</span>
                      </>
                    )}
                    <span className="text-gray-500">時間</span>
                    <span>{formatTime(log.createdAt)}</span>
                    {log.orderId && (
                      <>
                        <span className="text-gray-500">訂單編號</span>
                        <span className="font-mono text-xs">{log.orderId}</span>
                      </>
                    )}
                  </div>
                  <div className="bg-white border rounded-lg p-4 text-sm whitespace-pre-wrap break-words">
                    {stripHtml(log.content || '')}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-gray-500">
              共 {total} 筆，第 {page}/{totalPages} 頁
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => fetchLogs(page - 1)}
                disabled={page <= 1}
                className="px-4 py-2 border rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                上一頁
              </button>
              <button
                onClick={() => fetchLogs(page + 1)}
                disabled={page >= totalPages}
                className="px-4 py-2 border rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                下一頁
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
