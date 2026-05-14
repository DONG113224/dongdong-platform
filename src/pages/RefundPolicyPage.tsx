import { Link } from 'react-router-dom';
import Footer from '../components/Footer';

export default function RefundPolicyPage() {
  return (
    <div className="min-h-screen bg-[#f5f1eb] flex flex-col">
      <div className="max-w-3xl mx-auto px-6 py-12 text-gray-700 text-sm leading-relaxed flex-1">
        <Link to="/" className="inline-block mb-6 px-5 py-2 rounded-full font-bold text-white bg-gradient-to-r from-[#667eea] to-[#764ba2] hover:opacity-90 transition-opacity">
          &larr; 回到首頁
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mb-4">退費政策</h1>
        <p className="text-gray-500 mb-8">最後更新：2026 年 5 月</p>

        <section className="mb-8 p-5 bg-green-50 border-l-4 border-green-500 rounded">
          <h2 className="text-lg font-bold text-green-800 mb-2">✓ 7 天無條件退費保障</h2>
          <p>付款成功後 7 天內，若不滿意課程內容，可依本政策提出全額退費申請。</p>
          <p className="mt-2 font-bold">前提：未加入 LINE 社群、未下載任何課程檔案。</p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-3">一、退費期限</h2>
          <p>自會員「完成付款日」起算 <strong>7 個自然日</strong>內，例如 5/1 付款 → 5/7 前皆可申請退費。</p>
          <p className="mt-2">超過 7 天後，課程已視同消化完畢，恕無法退費（依《消費者保護法》第十九條，數位內容服務一經提供，得不適用 7 日鑑賞期，本公司基於信任機制主動提供此保障）。</p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-3">二、退費方式</h2>

          <div className="mb-4 p-4 bg-blue-50 rounded">
            <h3 className="font-bold text-blue-900 mb-2">💳 信用卡付款</h3>
            <p>原路退回至原刷卡銀行帳戶，由銀行處理 <strong>3 ~ 7 個工作天</strong>入帳，實際時間依各家銀行作業而定。</p>
          </div>

          <div className="mb-4 p-4 bg-yellow-50 rounded">
            <h3 className="font-bold text-yellow-900 mb-2">🏦 ATM 轉帳付款</h3>
            <p>因藍新金流不支援 ATM 自動退款，須由本公司手動匯款。會員須提供以下資訊：</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>銀行代碼與分行名稱</li>
              <li>帳號（與訂購人同一人）</li>
              <li>戶名（與訂購人姓名一致）</li>
            </ul>
            <p className="mt-2">資訊核對無誤後，本公司將於 <strong>3 個工作天內</strong>完成手動匯款。</p>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-3">三、發票處理</h2>
          <p>退款完成後，本公司將依退費狀況處理電子發票：</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li><strong>當期作廢：</strong>退款與開立發票在同一個會計月度內，發票直接作廢。</li>
            <li><strong>跨會計月度：</strong>例如 4 月開立發票、5 月退款，依《統一發票使用辦法》規定，需由會員額外簽署「銷貨退回、進貨退出或折讓證明單」，本公司收回原發票後始能完成銷帳作業。</li>
          </ul>
          <p className="mt-2 text-orange-700">⚠️ 跨會計月度的退款流程較長，請會員配合補簽折讓單，本公司會於完成紙本程序後立即退款。</p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-3">四、放棄退費資格的情境</h2>
          <p>下列情境之一發生，即<strong className="text-red-700">視同自願放棄 7 天無條件退費權益</strong>，恕無法再申請退費：</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>已加入課程指定之 LINE 社群</li>
            <li>已下載任一份「課程加值包」檔案</li>
            <li>已透過課程提供之 AI 提示詞、模板、報表進行商業使用</li>
          </ul>
          <p className="mt-2">本機制透過系統自動偵測會員行為，並於使用前跳出「確認放棄退費權益」之二次確認視窗。會員點擊「確認」即代表知悉並同意放棄退費權益。</p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-3">五、申請退費流程</h2>
          <ol className="list-decimal pl-6 space-y-2">
            <li>登入 dongdong-tw.com，進入「<Link to="/member" className="text-blue-600 hover:underline">會員中心 → 訂單記錄</Link>」</li>
            <li>找到欲退費之訂單，點擊「申請退費」</li>
            <li>填寫退費表單（ATM 退款須填寫銀行帳戶資訊）</li>
            <li>系統收到申請後，本公司於 1 ~ 3 個工作天內處理</li>
            <li>處理完成後將寄送 Email 通知，並進行實際匯款 / 信用卡退刷作業</li>
          </ol>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-3">六、特殊情況</h2>
          <p>下列情況本公司保留是否退費之判斷權：</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>會員違反「服務條款」第三條關於課程著作權之規定</li>
            <li>會員惡意申請退費後再次購買、或循環使用退費機制</li>
            <li>因不可抗力因素（系統故障、金流異常等）導致雙重扣款，將立即無條件退費</li>
          </ul>
        </section>

        <div className="mt-10 p-5 bg-gray-100 rounded-lg">
          <p className="font-bold text-gray-900 mb-2">退費相關疑問，請聯繫：</p>
          <p><strong>千合鈺有限公司</strong>　統編：83434376</p>
          <p><strong>客服 Email：</strong><a href="mailto:d0970019725@gmail.com" className="text-blue-600 hover:underline">d0970019725@gmail.com</a></p>
          <p className="mt-2 text-xs text-gray-500">客服時間：週一至週五 10:00 ~ 18:00（國定假日除外）</p>
        </div>
      </div>
      <Footer />
    </div>
  );
}
