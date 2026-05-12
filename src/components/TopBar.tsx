import { useNavigate } from 'react-router-dom';

export default function TopBar({ title }: { title?: string }) {
  const navigate = useNavigate();

  return (
    <header className="bg-white shadow-sm px-6 py-3 flex items-center gap-4 sticky top-0 z-20">
      <button
        onClick={() => navigate('/')}
        className="text-gray-500 hover:text-gray-800 text-sm font-medium flex items-center gap-1"
      >
        <span>←</span>
        <span>首頁</span>
      </button>
      {title && (
        <>
          <span className="text-gray-300">|</span>
          <h1 className="text-lg font-bold">{title}</h1>
        </>
      )}
    </header>
  );
}
