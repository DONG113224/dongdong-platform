import type { Chapter } from '../types';

interface CourseChapterListProps {
  chapters: Chapter[];
  currentChapterId?: string;
  onSelect: (chapter: Chapter) => void;
}

export default function CourseChapterList({ chapters, currentChapterId, onSelect }: CourseChapterListProps) {
  const sortedChapters = [...chapters].sort((a, b) => a.order - b.order);

  const formatDuration = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-white rounded-lg shadow">
      <h3 className="text-lg font-bold p-4 border-b">課程章節</h3>
      <ul className="divide-y">
        {sortedChapters.map((chapter, index) => (
          <li key={chapter.id}>
            <button
              onClick={() => onSelect(chapter)}
              className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-center gap-3 ${
                currentChapterId === chapter.id ? 'bg-blue-50 text-blue-600' : ''
              }`}
            >
              <span className="text-sm text-gray-400 w-6">{index + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{chapter.title}</p>
                <p className="text-sm text-gray-500">{formatDuration(chapter.duration)}</p>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
