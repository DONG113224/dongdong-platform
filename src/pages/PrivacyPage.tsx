import { Link } from 'react-router-dom';
import Footer from '../components/Footer';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#f5f1eb] flex flex-col">
      <div className="max-w-3xl mx-auto px-6 py-12 text-gray-700 text-sm leading-relaxed flex-1">
        <Link to="/" className="inline-block mb-6 px-5 py-2 rounded-full font-bold text-white bg-gradient-to-r from-[#667eea] to-[#764ba2] hover:opacity-90 transition-opacity">
          &larr; 回到首頁
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mb-4">隱私權及網站安全政策</h1>
        <p className="text-gray-500 mb-8">最後更新：2026 年 5 月</p>

        <section className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-3">一、隱私權保護政策的適用範圍</h2>
          <p>隱私權保護政策內容，包括本網站如何處理在您使用網站服務時收集到的個人識別資料。隱私權保護政策不適用於本網站以外的相關連結網站，也不適用於非本網站所委託或參與管理的人員。</p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-3">二、個人資料的蒐集、處理及利用方式</h2>
          <p>當您造訪本網站或使用本網站所提供之功能服務時，我們將視該服務功能性質，請您提供必要的個人資料，並在該特定目的範圍內處理及利用您的個人資料。</p>
          <p className="mt-2">本網站蒐集之個人資料項目可能包含：</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>會員註冊資訊（姓名、電子郵件、手機號碼）</li>
            <li>付款資料（由藍新金流加密處理，本公司不留存信用卡號）</li>
            <li>發票開立所需資訊（統一編號、抬頭、寄送地址）</li>
            <li>會員行為紀錄（觀看課程進度、加入社群、下載檔案等）</li>
            <li>IP 位址、瀏覽器版本、裝置資訊（用於改善服務體驗）</li>
          </ul>
          <p className="mt-2">您可以隨時向我們提出請求，以更正或刪除您的帳戶或本網站所蒐集的個人資料等隱私資訊。聯繫方式請見最下方聯繫管道。</p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-3">三、資料的對外提供</h2>
          <p>本公司不會將會員的個人資料任意販售、租賃、交換或揭露給第三方，除下列情形：</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>取得會員之同意</li>
            <li>金流交易處理之必要（藍新金流、發票服務商 eCloudLife）</li>
            <li>司法、警政機關依法定程序之要求</li>
            <li>保護本公司或其他會員之合法權益</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-3">四、Cookie 之使用</h2>
          <p>為了提供您更佳的使用體驗，本網站可能使用 Cookie 技術，協助我們了解使用者行為並提供個人化服務。您可自行於瀏覽器中設定是否允許 Cookie 的儲存，但若您拒絕 Cookie，部分功能可能無法正常運作。</p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-3">五、資料安全</h2>
          <p>本網站採用 HTTPS 加密傳輸，並依《個人資料保護法》規定建置必要之安全防護機制。會員密碼經單向雜湊加密儲存於 Firebase Authentication，本公司任何員工皆無法以明文方式取得會員密碼。</p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-3">六、隱私權政策之修訂</h2>
          <p>本政策如有任何修正，將隨時公告於網站上，恕不另行通知。如您繼續使用本網站，即視為同意本政策之修訂內容。</p>
        </section>

        <div className="mt-10 p-5 bg-gray-100 rounded-lg">
          <p className="font-bold text-gray-900 mb-2">如有任何疑問或資料異動需求，歡迎透過下列方式聯繫：</p>
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
