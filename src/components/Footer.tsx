import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="bg-[#1a1a1a] text-gray-300 py-10 px-6 text-sm">
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {/* 公司資訊 */}
          <div>
            <h3 className="text-white font-bold mb-3">公司資訊</h3>
            <p className="leading-relaxed">
              <span className="block font-medium text-white">千合鈺有限公司</span>
              統一編號：83434376<br />
              地址：新北市汐止區汐萬路2段337號<br />
              客服信箱：<a href="mailto:d0970019725@gmail.com" className="hover:text-white underline">d0970019725@gmail.com</a>
            </p>
          </div>

          {/* 法律 */}
          <div>
            <h3 className="text-white font-bold mb-3">使用條款</h3>
            <ul className="space-y-2">
              <li><Link to="/terms" className="hover:text-white">服務條款</Link></li>
              <li><Link to="/privacy" className="hover:text-white">隱私權政策</Link></li>
              <li><Link to="/refund-policy" className="hover:text-white">退費政策</Link></li>
            </ul>
          </div>

          {/* 客服 */}
          <div>
            <h3 className="text-white font-bold mb-3">學員服務</h3>
            <ul className="space-y-2">
              <li><Link to="/member" className="hover:text-white">會員中心</Link></li>
              <li>客服時間：週一至週五 10:00-18:00</li>
              <li>付款方式：信用卡 / ATM 轉帳</li>
              <li>發票：電子發票（藍新金流開立）</li>
            </ul>
          </div>
        </div>

        <div className="pt-6 border-t border-gray-800 text-center text-gray-500 text-xs">
          <p>© {new Date().getFullYear()} 千合鈺有限公司 版權所有．本網站所有課程內容受著作權法保護，未經授權禁止重製、散布、公開傳輸</p>
        </div>
      </div>
    </footer>
  );
}
