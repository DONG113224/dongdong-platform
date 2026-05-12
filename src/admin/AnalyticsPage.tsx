import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface DayMetrics {
  date: string;
  PV: number;
  TOP: number;
  CV: number;
  ADC: number;
  BUY: number;
}

function formatRate(numerator: number, denominator: number): string {
  if (denominator === 0) return '0%';
  return (numerator / denominator * 100).toFixed(1) + '%';
}

function getTodayDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function getDateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthNAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

type ViewMode = 'day' | 'month';

export default function AnalyticsPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('day');

  // 日模式
  const [dateFrom, setDateFrom] = useState(getTodayDate());
  const [dateTo, setDateTo] = useState(getTodayDate());

  // 月模式
  const [monthFrom, setMonthFrom] = useState(getCurrentMonth());
  const [monthTo, setMonthTo] = useState(getCurrentMonth());

  const [activeLabel, setActiveLabel] = useState(getTodayDate());
  const [dailyData, setDailyData] = useState<DayMetrics[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    handleAnalyze();
  }, [viewMode]);

  const handleAnalyze = () => {
    if (viewMode === 'day') {
      setActiveLabel(dateFrom === dateTo ? dateFrom : `${dateFrom} ~ ${dateTo}`);
      loadDateRange(dateFrom, dateTo);
    } else {
      // 月模式：把月份轉成日期區間
      const fromStr = `${monthFrom}-01`;
      const toYear = parseInt(monthTo.split('-')[0]);
      const toMonth = parseInt(monthTo.split('-')[1]);
      const lastDay = new Date(toYear, toMonth, 0).getDate();
      const toStr = `${monthTo}-${String(lastDay).padStart(2, '0')}`;
      setActiveLabel(monthFrom === monthTo ? monthFrom : `${monthFrom} ~ ${monthTo}`);
      loadDateRange(fromStr, toStr);
    }
  };

  const loadDateRange = async (fromStr: string, toStr: string) => {
    setLoading(true);
    try {
      const from = new Date(fromStr);
      const to = new Date(toStr);
      const results: DayMetrics[] = [];

      if (viewMode === 'month') {
        // 月模式：按月彙總
        const current = new Date(from.getFullYear(), from.getMonth(), 1);
        const endMonth = new Date(to.getFullYear(), to.getMonth(), 1);
        while (current <= endMonth) {
          const y = current.getFullYear();
          const m = current.getMonth();
          const daysInMonth = new Date(y, m + 1, 0).getDate();
          let monthPV = 0, monthTOP = 0, monthCV = 0, monthADC = 0, monthBUY = 0;

          for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            try {
              const docRef = doc(db, 'analytics', dateStr);
              const snap = await getDoc(docRef);
              const data = snap.data() || {};
              monthPV += data.PV || 0;
              monthTOP += data.TOP || 0;
              monthCV += data.CV || 0;
              monthADC += data.ADC || 0;
              monthBUY += data.BUY || 0;
            } catch { /* ignore */ }
          }

          results.push({
            date: `${y}-${String(m + 1).padStart(2, '0')}`,
            PV: monthPV, TOP: monthTOP, CV: monthCV, ADC: monthADC, BUY: monthBUY,
          });
          current.setMonth(current.getMonth() + 1);
        }
      } else {
        // 日模式
        const current = new Date(from);
        while (current <= to) {
          const y = current.getFullYear();
          const m = String(current.getMonth() + 1).padStart(2, '0');
          const d = String(current.getDate()).padStart(2, '0');
          const dateStr = `${y}-${m}-${d}`;

          try {
            const docRef = doc(db, 'analytics', dateStr);
            const snap = await getDoc(docRef);
            const data = snap.data() || {};
            results.push({
              date: dateStr,
              PV: data.PV || 0, TOP: data.TOP || 0, CV: data.CV || 0,
              ADC: data.ADC || 0, BUY: data.BUY || 0,
            });
          } catch {
            results.push({ date: dateStr, PV: 0, TOP: 0, CV: 0, ADC: 0, BUY: 0 });
          }
          current.setDate(current.getDate() + 1);
        }
      }

      setDailyData(results);
    } catch (err) {
      console.error('Analytics load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const totalPV = dailyData.reduce((s, d) => s + d.PV, 0);
  const totalTOP = dailyData.reduce((s, d) => s + d.TOP, 0);
  const totalCV = dailyData.reduce((s, d) => s + d.CV, 0);
  const totalADC = dailyData.reduce((s, d) => s + d.ADC, 0);
  const totalBUY = dailyData.reduce((s, d) => s + d.BUY, 0);

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">數據分析</h2>

      {/* 顯示模式切換 */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setViewMode('day')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${viewMode === 'day' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
        >
          日顯示
        </button>
        <button
          onClick={() => setViewMode('month')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${viewMode === 'month' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
        >
          月顯示
        </button>
      </div>

      {/* 日期/月份選擇 */}
      <div className="bg-white rounded-xl p-4 mb-6 flex flex-wrap gap-4 items-center">
        {viewMode === 'day' ? (
          <>
            <span className="text-sm text-gray-600 font-medium">日期：</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border rounded-lg px-3 py-2" />
            <span className="text-gray-400">至</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="border rounded-lg px-3 py-2" />
          </>
        ) : (
          <>
            <span className="text-sm text-gray-600 font-medium">月份：</span>
            <input type="month" value={monthFrom} onChange={(e) => setMonthFrom(e.target.value)} className="border rounded-lg px-3 py-2" />
            <span className="text-gray-400">至</span>
            <input type="month" value={monthTo} onChange={(e) => setMonthTo(e.target.value)} className="border rounded-lg px-3 py-2" />
          </>
        )}
        <button onClick={handleAnalyze} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
          分析
        </button>
        {viewMode === 'day' && (
          <>
            <button onClick={() => { const t = getTodayDate(); setDateFrom(t); setDateTo(t); setActiveLabel(t); loadDateRange(t, t); }} className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">今天</button>
            <button onClick={() => { const f = getDateNDaysAgo(6); const t = getTodayDate(); setDateFrom(f); setDateTo(t); setActiveLabel(`${f} ~ ${t}`); loadDateRange(f, t); }} className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">近7天</button>
            <button onClick={() => { const f = getDateNDaysAgo(29); const t = getTodayDate(); setDateFrom(f); setDateTo(t); setActiveLabel(`${f} ~ ${t}`); loadDateRange(f, t); }} className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">近30天</button>
          </>
        )}
        {viewMode === 'month' && (
          <>
            <button onClick={() => { const m = getCurrentMonth(); setMonthFrom(m); setMonthTo(m); setActiveLabel(m); const f = `${m}-01`; const d = new Date(parseInt(m.split('-')[0]), parseInt(m.split('-')[1]), 0); const t = `${m}-${String(d.getDate()).padStart(2,'0')}`; loadDateRange(f, t); }} className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">本月</button>
            <button onClick={() => { const f = getMonthNAgo(2); const t = getCurrentMonth(); setMonthFrom(f); setMonthTo(t); setActiveLabel(`${f} ~ ${t}`); const fromStr = `${f}-01`; const d = new Date(parseInt(t.split('-')[0]), parseInt(t.split('-')[1]), 0); const toStr = `${t}-${String(d.getDate()).padStart(2,'0')}`; loadDateRange(fromStr, toStr); }} className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">近3個月</button>
          </>
        )}
      </div>

      {/* 統計數據卡片 */}
      <p className="text-sm text-gray-500 mb-3">統計區間：{activeLabel}</p>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {([
          { label: '瀏覽 (PV)', value: totalPV, color: 'text-blue-600' },
          { label: '首圖留存 (TOP)', value: totalTOP, color: 'text-cyan-600' },
          { label: '看完 (CV)', value: totalCV, color: 'text-green-600' },
          { label: '加入購物車 (ADC)', value: totalADC, color: 'text-orange-600' },
          { label: '購買 (BUY)', value: totalBUY, color: 'text-red-600' },
        ] as const).map((card) => (
          <div key={card.label} className="bg-white rounded-xl p-4 shadow-sm">
            <p className="text-gray-500 text-xs mb-1">{card.label}</p>
            <p className={`text-2xl font-bold ${card.color}`}>{loading ? '-' : card.value}</p>
          </div>
        ))}
      </div>

      {/* 轉換率 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {([
          { label: '首圖留存率', rate: formatRate(totalTOP, totalPV), sub: 'TOP / PV' },
          { label: '看完率', rate: formatRate(totalCV, totalPV), sub: 'CV / PV' },
          { label: '加車率', rate: formatRate(totalADC, totalPV), sub: 'ADC / PV' },
          { label: '購買率', rate: formatRate(totalBUY, totalPV), sub: 'BUY / PV' },
        ] as const).map((item) => (
          <div key={item.label} className="bg-white rounded-xl p-4 shadow-sm">
            <p className="text-gray-500 text-xs mb-1">{item.label}</p>
            <p className="text-xl font-bold text-gray-800">{loading ? '-' : item.rate}</p>
            <p className="text-gray-400 text-xs mt-1">{item.sub}</p>
          </div>
        ))}
      </div>

      {/* 明細表 */}
      <div className="bg-white rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3">{viewMode === 'day' ? '日期' : '月份'}</th>
                <th className="text-right px-4 py-3">PV</th>
                <th className="text-right px-4 py-3">TOP</th>
                <th className="text-right px-4 py-3">CV</th>
                <th className="text-right px-4 py-3">ADC</th>
                <th className="text-right px-4 py-3">BUY</th>
                <th className="text-right px-4 py-3">留存率</th>
                <th className="text-right px-4 py-3">看完率</th>
                <th className="text-right px-4 py-3">加車率</th>
                <th className="text-right px-4 py-3">購買率</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr><td colSpan={10} className="text-center py-8 text-gray-500">載入中...</td></tr>
              ) : dailyData.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-8 text-gray-500">無數據</td></tr>
              ) : (
                <>
                  {dailyData.map((day) => (
                    <tr key={day.date} className="hover:bg-gray-50">
                      <td className="px-4 py-3">{day.date}</td>
                      <td className="px-4 py-3 text-right">{day.PV}</td>
                      <td className="px-4 py-3 text-right">{day.TOP}</td>
                      <td className="px-4 py-3 text-right">{day.CV}</td>
                      <td className="px-4 py-3 text-right">{day.ADC}</td>
                      <td className="px-4 py-3 text-right">{day.BUY}</td>
                      <td className="px-4 py-3 text-right">{formatRate(day.TOP, day.PV)}</td>
                      <td className="px-4 py-3 text-right">{formatRate(day.CV, day.PV)}</td>
                      <td className="px-4 py-3 text-right">{formatRate(day.ADC, day.PV)}</td>
                      <td className="px-4 py-3 text-right">{formatRate(day.BUY, day.PV)}</td>
                    </tr>
                  ))}
                  {/* 合計列 */}
                  <tr className="bg-gray-50 font-bold">
                    <td className="px-4 py-3">合計</td>
                    <td className="px-4 py-3 text-right">{totalPV}</td>
                    <td className="px-4 py-3 text-right">{totalTOP}</td>
                    <td className="px-4 py-3 text-right">{totalCV}</td>
                    <td className="px-4 py-3 text-right">{totalADC}</td>
                    <td className="px-4 py-3 text-right">{totalBUY}</td>
                    <td className="px-4 py-3 text-right">{formatRate(totalTOP, totalPV)}</td>
                    <td className="px-4 py-3 text-right">{formatRate(totalCV, totalPV)}</td>
                    <td className="px-4 py-3 text-right">{formatRate(totalADC, totalPV)}</td>
                    <td className="px-4 py-3 text-right">{formatRate(totalBUY, totalPV)}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
