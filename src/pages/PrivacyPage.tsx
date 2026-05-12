import { Link } from 'react-router-dom';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#f5f1eb]">
      <div className="max-w-2xl mx-auto px-6 py-12 text-gray-600 text-sm leading-relaxed">
        <Link to="/" className="inline-block mb-6 px-5 py-2 rounded-full font-bold text-white bg-gradient-to-r from-[#667eea] to-[#764ba2] hover:opacity-90 transition-opacity">
          &larr; 回到首頁
        </Link>
        <h2 className="text-lg font-bold text-gray-800 mb-4">隱私權及網站安全政策</h2>

        <h3 className="font-bold text-gray-700 mt-6 mb-2">一、隱私權保護政策的適用範圍</h3>
        <p>隱私權保護政策內容，包括本網站如何處理在您使用網站服務時收集到的個人識別資料。隱私權保護政策不適用於本網站以外的相關連結網站，也不適用於非本網站所委託或參與管理的人員。</p>

        <h3 className="font-bold text-gray-700 mt-6 mb-2">二、個人資料的蒐集、處理及利用方式</h3>
        <p>當您造訪本網站或使用本網站所提供之功能服務時，我們將視該服務功能性質，請您提供必要的個人資料，並在該特定目的範圍內處理及利用您的個人資料。</p>
        <p className="mt-2">您可以隨時向我們提出請求，以更正或刪除您的帳戶或本網站所蒐集的個人資料等隱私資訊。聯繫方式請見最下方聯繫管道。</p>

        <h3 className="font-bold text-gray-700 mt-6 mb-2">三、Cookie 之使用</h3>
        <p>為了提供您更佳的使用體驗，本網站可能使用 Cookie 技術，協助我們了解使用者行為並提供個人化服務。您可自行於瀏覽器中設定是否允許 Cookie 的儲存。</p>

        <h3 className="font-bold text-gray-700 mt-6 mb-2">四、隱私權政策之修訂</h3>
        <p>本政策如有任何修正，將隨時公告於網站上，恕不另行通知。如您繼續使用本網站，即視為同意本政策之修訂內容。</p>

        <div className="mt-8 p-4 bg-gray-100 rounded-lg">
          <p>如有任何疑問或需求，歡迎透過客服與我們聯繫：</p>
          <p className="mt-2"><strong>抬頭：</strong>九十度工作室　<strong>統一編號：</strong>81190775</p>
        </div>
      </div>
    </div>
  );
}
