import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import VideoPlayer from '../components/VideoPlayer';
import CourseChapterList from '../components/CourseChapterList';
import type { Course, Chapter, Order, PromptItem } from '../types';
import TopBar from '../components/TopBar';

export default function CoursePage() {
  const { courseId } = useParams<{ courseId: string }>();
  const { firebaseUser, userData, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [course, setCourse] = useState<Course | null>(null);
  const [currentChapter, setCurrentChapter] = useState<Chapter | null>(null);
  const [signedUrl, setSignedUrl] = useState('');
  const [videoError, setVideoError] = useState(false);
  const [videoLoading, setVideoLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<Order | null>(null);

  // 不退費使用區狀態
  const [showWaiveModal, setShowWaiveModal] = useState(false);
  const [waiving, setWaiving] = useState(false);
  const [applyingGroup, setApplyingGroup] = useState(false);

  // 超時保護
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (loading) setLoading(false);
    }, 5000);
    return () => clearTimeout(timeout);
  }, [loading]);

  useEffect(() => {
    if (authLoading) return;

    if (!firebaseUser) {
      navigate('/');
      return;
    }

    if (!userData) return;

    if (courseId && (!userData.purchasedCourses || !userData.purchasedCourses.includes(courseId))) {
      navigate('/');
      return;
    }

    loadCourse();
    loadOrder();
  }, [courseId, firebaseUser, userData, authLoading]);

  const loadCourse = async () => {
    if (!courseId) return;

    const courseRef = doc(db, 'courses', courseId);
    const courseSnap = await getDoc(courseRef);

    if (!courseSnap.exists()) {
      navigate('/');
      return;
    }

    const courseData = { id: courseSnap.id, ...courseSnap.data() } as Course;
    setCourse(courseData);

    const sortedChapters = [...courseData.chapters].sort((a, b) => a.order - b.order);
    if (sortedChapters.length > 0) {
      selectChapter(sortedChapters[0]);
    }

    setLoading(false);
  };

  const loadOrder = async () => {
    if (!courseId || !firebaseUser) return;
    const ordersQuery = query(
      collection(db, 'orders'),
      where('userId', '==', firebaseUser.uid),
      where('courseId', '==', courseId),
      where('status', '==', 'paid')
    );
    const snap = await getDocs(ordersQuery);
    if (!snap.empty) {
      setOrder({ id: snap.docs[0].id, ...snap.docs[0].data() } as Order);
    }
  };

  const selectChapter = async (chapter: Chapter) => {
    setCurrentChapter(chapter);
    setVideoError(false);
    setSignedUrl('');

    // demo 影片不呼叫 API
    if (chapter.bunnyVideoId.startsWith('demo-')) {
      return;
    }

    setVideoLoading(true);
    try {
      const response = await api.get(`/courseAccess/${courseId}?videoId=${chapter.bunnyVideoId}`);
      const { token, libraryId, expires } = response.data;
      setSignedUrl(
        `https://iframe.mediadelivery.net/embed/${libraryId}/${chapter.bunnyVideoId}?token=${token}&expires=${expires}`
      );
      setVideoError(false);
    } catch (err) {
      console.error('影片載入失敗:', err);
      setSignedUrl('');
      setVideoError(true);
    } finally {
      setVideoLoading(false);
    }
  };

  const handleWaiveRefund = async () => {
    if (!order) return;
    setWaiving(true);
    try {
      await api.post('/waiveRefund', { orderId: order.id });
      setOrder({ ...order, refundWaived: true });
      setShowWaiveModal(false);
    } catch {
      alert('操作失敗，請稍後再試');
    } finally {
      setWaiving(false);
    }
  };

  const handleApplyLineGroup = async () => {
    if (!order) return;
    setApplyingGroup(true);
    try {
      const res = await api.post('/applyLineGroup', { orderId: order.id });
      setOrder({ ...order, lineGroupStatus: 'applying' });
      if (res.data.lineGroupUrl) {
        window.open(res.data.lineGroupUrl, '_blank');
      }
    } catch {
      alert('操作失敗，請稍後再試');
    } finally {
      setApplyingGroup(false);
    }
  };

  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);

  const handleNoRefundAction = (action: () => void) => {
    if (order?.refundWaived) {
      action();
    } else {
      setShowWaiveModal(true);
    }
  };

  const handleDownloadFile = async (fileId: string) => {
    if (!order) return;
    setDownloadingFileId(fileId);
    try {
      const res = await api.post('/getDownloadUrl', { orderId: order.id, fileId });
      window.open(res.data.url, '_blank');
    } catch {
      alert('下載失敗，請稍後再試');
    } finally {
      setDownloadingFileId(null);
    }
  };

  const hasNoRefundResources = course?.noRefundResources &&
    (course.noRefundResources.lineGroupUrl || (course.noRefundResources.downloadFiles && course.noRefundResources.downloadFiles.length > 0));

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">載入中...</p>
      </div>
    );
  }

  if (!course) return null;

  return (
    <div className="min-h-screen bg-gray-100">
      <TopBar title="課程播放" />

      <div className="flex flex-col lg:flex-row max-w-7xl mx-auto p-6 gap-6">
        {/* Video Player */}
        <div className="flex-1">
          {currentChapter && signedUrl ? (
            <VideoPlayer signedUrl={signedUrl} title={currentChapter.title} />
          ) : currentChapter ? (
            <div className="aspect-video bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg flex flex-col items-center justify-center text-white">
              {videoLoading ? (
                <>
                  <div className="text-4xl mb-4 animate-spin">&#8635;</div>
                  <p className="text-xl font-bold mb-2">{currentChapter.title}</p>
                  <p className="text-gray-400 text-sm">影片載入中...</p>
                </>
              ) : videoError ? (
                <>
                  <p className="text-xl font-bold mb-2">{currentChapter.title}</p>
                  <p className="text-gray-400 text-sm mb-4">影片載入失敗，請重試</p>
                  <button
                    onClick={() => selectChapter(currentChapter)}
                    className="px-6 py-2 bg-white text-gray-800 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                  >
                    重新載入
                  </button>
                </>
              ) : (
                <>
                  <div className="text-6xl mb-4">&#9654;</div>
                  <p className="text-xl font-bold mb-2">{currentChapter.title}</p>
                  <p className="text-gray-400 text-sm">課程影片準備中，敬請期待</p>
                </>
              )}
            </div>
          ) : (
            <div className="aspect-video bg-gray-300 rounded-lg flex items-center justify-center">
              <p className="text-gray-500">選擇章節開始播放</p>
            </div>
          )}
          {currentChapter && (
            <div className="mt-4">
              <h2 className="text-2xl font-bold">{currentChapter.title}</h2>
            </div>
          )}
        </div>

        {/* Chapter List */}
        <div className="w-full lg:w-80 shrink-0">
          <CourseChapterList
            chapters={course.chapters}
            currentChapterId={currentChapter?.id}
            onSelect={selectChapter}
          />
        </div>
      </div>

      {/* 常用提示詞專區 */}
      {course.prompts && course.prompts.length > 0 && (
        <div className="max-w-7xl mx-auto px-6 pb-6">
          <PromptSection prompts={course.prompts} />
        </div>
      )}

      {/* 不退費使用區（放在章節列表下方） */}
      {hasNoRefundResources && order && (
        <div className="max-w-7xl mx-auto px-6 pb-6">
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="bg-orange-50 border-b border-orange-200 px-6 py-4">
                <h3 className="text-lg font-bold text-orange-800">不退費使用區</h3>
                {!order.refundWaived && (
                  <p className="text-sm text-orange-600 mt-1">
                    本區塊的資料一旦下載、或加入群組，就視同放棄退費資格
                  </p>
                )}
                {order.refundWaived && (
                  <p className="text-sm text-green-600 mt-1">
                    {order.refundWaivedReason || '您已放棄退費權益'}，以下資源已解鎖
                  </p>
                )}
              </div>

              <div className="p-6 space-y-4">
                {/* LINE 匿名社群 */}
                {course.noRefundResources!.lineGroupUrl && (
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[#06C755] rounded-full flex items-center justify-center shrink-0">
                        <span className="text-white font-bold text-sm">L</span>
                      </div>
                      <div>
                        <p className="font-medium">加入匿名 LINE 社群</p>
                        <p className="text-sm text-gray-500">與其他學員交流互動</p>
                      </div>
                    </div>
                    <div>
                      {!order.refundWaived ? (
                        <button
                          onClick={() => handleNoRefundAction(() => {})}
                          className="px-4 py-2 bg-gray-200 text-gray-500 rounded-lg text-sm cursor-pointer hover:bg-gray-300"
                        >
                          需放棄退費
                        </button>
                      ) : order.lineGroupStatus === 'joined' ? (
                        <span className="px-4 py-2 bg-green-100 text-green-700 rounded-lg text-sm font-medium">
                          已加入社群
                        </span>
                      ) : order.lineGroupStatus === 'applying' ? (
                        <button
                          onClick={() => {
                            if (course.noRefundResources?.lineGroupUrl) {
                              window.open(course.noRefundResources.lineGroupUrl, '_blank');
                            }
                          }}
                          className="px-4 py-2 bg-[#06C755] text-white rounded-lg text-sm font-medium hover:bg-[#05b04d]"
                        >
                          點此加入社群
                        </button>
                      ) : (
                        <button
                          onClick={handleApplyLineGroup}
                          disabled={applyingGroup}
                          className="px-4 py-2 bg-[#06C755] text-white rounded-lg text-sm font-medium hover:bg-[#05b04d] disabled:opacity-50"
                        >
                          {applyingGroup ? '處理中...' : '申請加入'}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* 檔案下載區 */}
                {course.noRefundResources!.downloadFiles && course.noRefundResources!.downloadFiles.length > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b">
                      <p className="font-medium">檔案下載區</p>
                    </div>
                    <div className="divide-y">
                      {/* 根目錄檔案 */}
                      {course.noRefundResources!.downloadFiles.filter((f) => !f.folderId).map((file) => (
                        <FileDownloadRow key={file.id} file={file} order={order} onDownload={handleDownloadFile} onNoRefund={() => handleNoRefundAction(() => {})} downloadingFileId={downloadingFileId} />
                      ))}
                      {/* 資料夾（可展開/收合） */}
                      {(course.noRefundResources!.downloadFolders || []).map((folder) => {
                        const folderFiles = course.noRefundResources!.downloadFiles.filter((f) => f.folderId === folder.id);
                        if (folderFiles.length === 0) return null;
                        return (
                          <FolderSection key={folder.id} folder={folder} files={folderFiles} order={order} onDownload={handleDownloadFile} onNoRefund={() => handleNoRefundAction(() => {})} downloadingFileId={downloadingFileId} />
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
          </div>
        </div>
      )}

      {/* 放棄退費確認彈窗 */}
      {showWaiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-red-600 mb-3">確認放棄退費權益</h3>
            <div className="bg-red-50 rounded-lg p-4 mb-4">
              <p className="text-sm text-red-700 leading-relaxed">
                您即將放棄七天內無條件退費的權益。一旦確認：
              </p>
              <ul className="text-sm text-red-700 mt-2 space-y-1 list-disc list-inside">
                <li>將無法再申請退費</li>
                <li>可以使用不退費使用區的所有資源</li>
              </ul>
            </div>
            <p className="text-sm text-gray-500 mb-6">此操作無法撤銷，請確認後再點擊。</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowWaiveModal(false)}
                className="flex-1 px-4 py-3 border rounded-lg font-medium hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleWaiveRefund}
                disabled={waiving}
                className="flex-1 px-4 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {waiving ? '處理中...' : '確認放棄退費'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FileDownloadRow({ file, order, onDownload, onNoRefund, downloadingFileId, indent }: {
  file: { id: string; name: string; note?: string; size: number };
  order: { refundWaived?: boolean };
  onDownload: (fileId: string) => void;
  onNoRefund: () => void;
  downloadingFileId: string | null;
  indent?: boolean;
}) {
  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };
  return (
    <div className={`flex items-center justify-between ${indent ? 'pl-10 pr-4' : 'px-4'} py-3 border-b border-gray-100 last:border-0`}>
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span className="text-gray-400 text-xl shrink-0">📄</span>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{file.name}</p>
          {file.note && <p className="text-xs text-gray-500">{file.note}</p>}
          <p className="text-xs text-gray-400">{formatSize(file.size)}</p>
        </div>
      </div>
      {!order.refundWaived ? (
        <button onClick={onNoRefund} className="px-3 py-1.5 bg-gray-200 text-gray-500 rounded-lg text-sm cursor-pointer hover:bg-gray-300 shrink-0">
          需放棄退費
        </button>
      ) : (
        <button
          onClick={() => onDownload(file.id)}
          disabled={downloadingFileId === file.id}
          className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 shrink-0"
        >
          {downloadingFileId === file.id ? '產生連結...' : '下載'}
        </button>
      )}
    </div>
  );
}

function FolderSection({ folder, files, order, onDownload, onNoRefund, downloadingFileId }: {
  folder: { id: string; name: string };
  files: { id: string; name: string; note?: string; size: number }[];
  order: { refundWaived?: boolean };
  onDownload: (fileId: string) => void;
  onNoRefund: () => void;
  downloadingFileId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };
  return (
    <div className="border-b last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 flex items-center gap-3 bg-amber-50 hover:bg-amber-100 transition-colors text-left"
      >
        <span className={`text-gray-400 text-sm transition-transform ${open ? 'rotate-90' : ''}`}>&#9654;</span>
        <span className="text-lg">📁</span>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-bold">{folder.name}</span>
          <span className="text-xs text-gray-400 ml-2">
            {files.length} 個檔案，{formatSize(files.reduce((s, f) => s + f.size, 0))}
          </span>
        </div>
      </button>
      {open && files.map((file) => (
        <FileDownloadRow key={file.id} file={file} order={order} onDownload={onDownload} onNoRefund={onNoRefund} downloadingFileId={downloadingFileId} indent />
      ))}
    </div>
  );
}

function PromptSection({ prompts }: { prompts: PromptItem[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const sorted = [...prompts].sort((a, b) => a.order - b.order);

  const handleCopy = async (content: string, id: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // fallback
      const textarea = document.createElement('textarea');
      textarea.value = content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="bg-purple-50 border-b border-purple-200 px-6 py-4">
        <h3 className="text-lg font-bold text-purple-800">常用提示詞</h3>
        <p className="text-sm text-purple-600 mt-1">點擊展開後可一鍵複製，直接貼入 Claude Code 使用</p>
      </div>
      <div className="divide-y">
        {sorted.map((prompt) => {
          const isOpen = openId === prompt.id;
          const isCopied = copiedId === prompt.id;
          return (
            <div key={prompt.id}>
              <button
                onClick={() => setOpenId(isOpen ? null : prompt.id)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="text-purple-500 text-lg">{'</>'}</span>
                  <span className="font-medium">{prompt.title}</span>
                </div>
                <span className={`text-gray-400 text-sm transition-transform ${isOpen ? 'rotate-180' : ''}`}>&#9660;</span>
              </button>
              {isOpen && (
                <div className="px-6 pb-4">
                  <div className="bg-gray-900 rounded-lg p-4 relative group">
                    <button
                      onClick={() => handleCopy(prompt.content, prompt.id)}
                      className={`absolute top-3 right-3 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        isCopied
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
                      }`}
                    >
                      {isCopied ? '已複製!' : '複製'}
                    </button>
                    <pre className="text-gray-100 text-sm whitespace-pre-wrap break-words leading-relaxed pr-16 font-mono">{prompt.content}</pre>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
