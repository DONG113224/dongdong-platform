import { Link } from 'react-router-dom';
import Footer from '../components/Footer';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#f5f1eb] flex flex-col">
      <div className="max-w-3xl mx-auto px-6 py-12 text-gray-700 text-sm leading-relaxed flex-1">
        <Link to="/" className="inline-block mb-6 px-5 py-2 rounded-full font-bold text-white bg-gradient-to-r from-[#667eea] to-[#764ba2] hover:opacity-90 transition-opacity">
          &larr; 回到首頁
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mb-4">服務條款</h1>
        <p className="text-gray-500 mb-8">最後更新：2026 年 5 月</p>

        <section className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-3">一、服務提供者</h2>
          <p>本網站（dongdong-tw.com）由「千合鈺有限公司」（統一編號：83434376，地址：新北市汐止區汐萬路2段337號，以下稱「本公司」）營運，提供蝦皮電商相關線上課程及相關加值服務。</p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-3">二、會員註冊與帳號</h2>
          <p>使用者透過 Email、LINE、Google 或 Facebook 登入即視為註冊成為本網站會員。會員應確保所提供資料正確完整，並對自身帳號之活動負責。本公司有權於發現帳號被盜用、惡意使用或違反條款時，暫停或終止會員資格。</p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-3">三、課程內容與授權</h2>
          <p>本網站所有課程影片、文件、提示詞、模板（以下統稱「課程內容」）著作權皆屬本公司或原創作者所有，受《著作權法》保護。</p>
          <p className="mt-2">會員購買課程後，僅取得個人非商業用途之觀看授權，<strong className="text-red-700">不得</strong>進行下列行為：</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>錄製、下載、翻拍、截錄課程影片</li>
            <li>分享帳號、登入連結予非購買者使用</li>
            <li>將課程內容公開傳輸、二次散布、上傳至其他平台</li>
            <li>修改、改作、衍生或商業利用課程內容</li>
          </ul>
          <p className="mt-2 text-red-700">違反前述任一條款者，本公司得逕行終止會員資格、停止課程觀看權限，並保留法律追訴權。</p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-3">四、付款方式與發票</h2>
          <p>本網站之金流由<strong>藍新金流</strong>處理，支援信用卡、ATM 轉帳兩種付款方式：</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li><strong>信用卡</strong>：付款成功後立即開通課程。</li>
            <li><strong>ATM 轉帳</strong>：本公司收到藍新付款確認通知後，最遲於隔日完成課程開通。</li>
          </ul>
          <p className="mt-2">付款成功後將自動開立電子發票，並寄送至會員註冊 Email。發票相關規範遵循《統一發票使用辦法》。</p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-3">五、退費機制</h2>
          <p>退費相關規定詳見「<Link to="/refund-policy" className="text-blue-600 hover:underline">退費政策</Link>」。</p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-3">六、加值資源（LINE 社群 / 課程檔案）</h2>
          <p>本網站每堂課程下方可能提供「LINE 學員社群」、「下載檔案」等加值資源。</p>
          <p className="mt-2"><strong className="text-red-700">會員一旦加入 LINE 社群、或下載任一檔案，即視同放棄七天無條件退費權益。</strong></p>
          <p className="mt-2">本機制透過系統紀錄會員操作行為，會員於使用加值資源前，系統將跳出二次確認視窗。</p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-3">七、服務變更與終止</h2>
          <p>本公司保留隨時修改、暫停或終止部分或全部服務之權利，並於合理範圍內公告通知。</p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-3">八、免責聲明</h2>
          <p>本網站所載之經營心法、實戰案例、收益資料皆為本公司過往真實經驗分享，<strong>不構成任何收益保證</strong>。會員之實際經營成效因個人投入時間、選品、市場條件等因素而異，本公司不對任何特定收益結果負責。</p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-3">九、法律準據與管轄</h2>
          <p>本條款之解釋、適用與相關爭議，皆以中華民國法律為準據法。如有訴訟必要，雙方合意以臺灣士林地方法院為第一審管轄法院。</p>
        </section>

        <div className="mt-10 p-5 bg-gray-100 rounded-lg">
          <p className="font-bold text-gray-900 mb-2">如有任何疑問，歡迎透過下列方式聯繫：</p>
          <p><strong>抬頭：</strong>千合鈺有限公司</p>
          <p><strong>統一編號：</strong>83434376</p>
          <p><strong>地址：</strong>新北市汐止區汐萬路2段337號</p>
          <p><strong>客服 Email：</strong><a href="mailto:d0970019725@gmail.com" className="text-blue-600 hover:underline">d0970019725@gmail.com</a></p>
        </div>
      </div>
      <Footer />
    </div>
  );
}
