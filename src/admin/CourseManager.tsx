import { useEffect, useState, useRef } from 'react';
import { collection, getDocs, doc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import type { Course, Chapter, DownloadFile, DownloadFolder, PromptItem } from '../types';

export default function CourseManager() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Course | null>(null);
  const [isNew, setIsNew] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState(0);
  const [thumbnail, setThumbnail] = useState('');
  const [isPublished, setIsPublished] = useState(true);
  const [chapters, setChapters] = useState<Chapter[]>([]);

  // 提示詞
  const [prompts, setPrompts] = useState<PromptItem[]>([]);

  // 不退費使用區
  const [lineGroupUrl, setLineGroupUrl] = useState('');
  const [downloadFiles, setDownloadFiles] = useState<DownloadFile[]>([]);
  const [downloadFolders, setDownloadFolders] = useState<DownloadFolder[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState<Map<string, number>>(new Map());
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [dragFileId, setDragFileId] = useState<string | null>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileListRef = useRef<HTMLDivElement>(null);
  const scrollIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    loadCourses();
  }, []);

  const loadCourses = async () => {
    const snapshot = await getDocs(collection(db, 'courses'));
    setCourses(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Course)));
    setLoading(false);
  };

  const openEditor = (course?: Course) => {
    if (course) {
      setIsNew(false);
      setEditing(course);
      setTitle(course.title);
      setDescription(course.description);
      setPrice(course.price);
      setThumbnail(course.thumbnail);
      setIsPublished(course.isPublished);
      setChapters([...course.chapters]);
      setPrompts(course.prompts ? [...course.prompts] : []);
      setLineGroupUrl(course.noRefundResources?.lineGroupUrl || '');
      setDownloadFiles(course.noRefundResources?.downloadFiles ? [...course.noRefundResources.downloadFiles] : []);
      setDownloadFolders(course.noRefundResources?.downloadFolders ? [...course.noRefundResources.downloadFolders] : []);
    } else {
      setIsNew(true);
      setEditing(null);
      setTitle('');
      setDescription('');
      setPrice(0);
      setThumbnail('');
      setIsPublished(true);
      setChapters([]);
      setPrompts([]);
      setLineGroupUrl('');
      setDownloadFiles([]);
      setDownloadFolders([]);
    }
  };

  const closeEditor = () => {
    setEditing(null);
    setIsNew(false);
  };

  const addChapter = () => {
    setChapters([
      ...chapters,
      {
        id: crypto.randomUUID(),
        title: '',
        bunnyVideoId: '',
        order: chapters.length + 1,
        duration: 0,
      },
    ]);
  };

  const updateChapter = (index: number, field: keyof Chapter, value: string | number) => {
    const updated = [...chapters];
    (updated[index] as unknown as Record<string, unknown>)[field] = value;
    setChapters(updated);
  };

  const removeChapter = (index: number) => {
    const updated = chapters.filter((_, i) => i !== index);
    setChapters(updated.map((ch, i) => ({ ...ch, order: i + 1 })));
  };

  const moveChapter = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= chapters.length) return;
    const updated = [...chapters];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    setChapters(updated.map((ch, i) => ({ ...ch, order: i + 1 })));
  };

  const removeDownloadFile = (fileId: string) => {
    const file = downloadFiles.find((f) => f.id === fileId);
    if (!file) return;
    if (!confirm(`確定要刪除檔案「${file.name}」嗎？`)) return;
    setDownloadFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  const addFolder = () => {
    const name = prompt('請輸入資料夾名稱');
    if (!name?.trim()) return;
    setDownloadFolders((prev) => [...prev, { id: crypto.randomUUID(), name: name.trim() }]);
  };

  const removeFolder = (folderId: string) => {
    const folder = downloadFolders.find((f) => f.id === folderId);
    if (!folder) return;
    const filesInFolder = downloadFiles.filter((f) => f.folderId === folderId);
    const msg = filesInFolder.length > 0
      ? `確定要刪除資料夾「${folder.name}」和裡面的 ${filesInFolder.length} 個檔案嗎？`
      : `確定要刪除資料夾「${folder.name}」嗎？`;
    if (!confirm(msg)) return;
    setDownloadFolders((prev) => prev.filter((f) => f.id !== folderId));
    setDownloadFiles((prev) => prev.filter((f) => f.folderId !== folderId));
  };

  const toggleFolder = (folderId: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const handleDragOverList = (e: React.DragEvent) => {
    e.preventDefault();
    const container = fileListRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const edgeZone = 60;
    const speed = 12;

    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }

    if (e.clientY - rect.top < edgeZone) {
      scrollIntervalRef.current = window.setInterval(() => {
        container.scrollTop -= speed;
      }, 16);
    } else if (rect.bottom - e.clientY < edgeZone) {
      scrollIntervalRef.current = window.setInterval(() => {
        container.scrollTop += speed;
      }, 16);
    }
  };

  const stopAutoScroll = () => {
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }
  };

  const moveFileToFolder = (fileId: string, targetFolderId: string | undefined) => {
    setDownloadFiles((prev) =>
      prev.map((f) => f.id === fileId ? { ...f, folderId: targetFolderId } : f)
    );
  };

  const updateFileNote = (fileId: string, note: string) => {
    setDownloadFiles((prev) =>
      prev.map((f) => f.id === fileId ? { ...f, note } : f)
    );
  };

  const handleBatchUpload = async (files: FileList | File[]) => {
    const courseId = editing?.id || 'new-course';
    const fileArray = Array.from(files);

    for (const file of fileArray) {
      const fileId = crypto.randomUUID();
      const storagePath = `course-files/${courseId}/${fileId}-${file.name}`;
      const storageRef = ref(storage, storagePath);

      // 先加入列表（顯示上傳中）
      const newFile: DownloadFile = {
        id: fileId,
        name: file.name,
        url: '',
        storagePath: '',
        size: file.size,
      };
      setDownloadFiles((prev) => [...prev, newFile]);
      setUploadingFiles((prev) => new Map(prev).set(fileId, 0));

      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on('state_changed',
        (snapshot) => {
          const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          setUploadingFiles((prev) => new Map(prev).set(fileId, progress));
        },
        (error) => {
          console.error('Upload error:', error);
          setUploadingFiles((prev) => {
            const next = new Map(prev);
            next.delete(fileId);
            return next;
          });
          // 移除失敗的項目
          setDownloadFiles((prev) => prev.filter((f) => f.id !== fileId));
          alert(`「${file.name}」上傳失敗`);
        },
        () => {
          // 上傳完成：更新 storagePath
          setDownloadFiles((prev) =>
            prev.map((f) =>
              f.id === fileId
                ? { ...f, storagePath, size: file.size }
                : f
            )
          );
          setUploadingFiles((prev) => {
            const next = new Map(prev);
            next.delete(fileId);
            return next;
          });
        }
      );
    }
  };

  const getFileIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    if (['pdf'].includes(ext)) return '📄';
    if (['doc', 'docx'].includes(ext)) return '📝';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊';
    if (['ppt', 'pptx'].includes(ext)) return '📑';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return '🖼️';
    if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) return '🎬';
    if (['mp3', 'wav', 'flac'].includes(ext)) return '🎵';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '📦';
    return '📎';
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  };

  const handleSave = async () => {
    const courseData = {
      title,
      description,
      price,
      thumbnail,
      isPublished,
      chapters,
      prompts,
      noRefundResources: {
        lineGroupUrl,
        downloadFiles,
        downloadFolders,
      },
      createdAt: editing?.createdAt || Timestamp.now(),
    };

    if (isNew) {
      const id = crypto.randomUUID();
      await setDoc(doc(db, 'courses', id), { ...courseData, id });
    } else if (editing) {
      await updateDoc(doc(db, 'courses', editing.id), courseData);
    }

    await loadCourses();
    closeEditor();
  };

  const togglePublish = async (course: Course) => {
    await updateDoc(doc(db, 'courses', course.id), {
      isPublished: !course.isPublished,
    });
    await loadCourses();
  };

  if (loading) return <p className="text-gray-500">載入中...</p>;

  // Editor view
  if (isNew || editing) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">{isNew ? '新增課程' : '編輯課程'}</h2>
          <button onClick={closeEditor} className="text-gray-500 hover:underline">取消</button>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">課程標題</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border rounded-lg px-4 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">課程描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full border rounded-lg px-4 py-2"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">售價 (NT$)</label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                className="w-full border rounded-lg px-4 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">封面圖 URL</label>
              <input
                type="text"
                value={thumbnail}
                onChange={(e) => setThumbnail(e.target.value)}
                className="w-full border rounded-lg px-4 py-2"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
              className="w-4 h-4"
            />
            <label className="text-sm">發布上架</label>
          </div>

          {/* Chapters */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold">章節管理</h3>
              <button onClick={addChapter} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">
                新增章節
              </button>
            </div>
            <div className="space-y-3">
              {chapters.map((chapter, index) => (
                <div key={chapter.id} className="border rounded-lg p-4 flex gap-3 items-start">
                  <div className="flex flex-col gap-1">
                    <button onClick={() => moveChapter(index, -1)} className="text-gray-400 hover:text-gray-600 text-xs">&#9650;</button>
                    <span className="text-sm text-gray-400 text-center">{index + 1}</span>
                    <button onClick={() => moveChapter(index, 1)} className="text-gray-400 hover:text-gray-600 text-xs">&#9660;</button>
                  </div>
                  <div className="flex-1 grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-600 mb-1">章節標題</label>
                      <input
                        type="text"
                        placeholder="章節標題"
                        value={chapter.title}
                        onChange={(e) => updateChapter(index, 'title', e.target.value)}
                        className="border rounded px-3 py-1 w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">影片時長（秒）</label>
                      <input
                        type="number"
                        placeholder="時長（秒）"
                        value={chapter.duration || ''}
                        onChange={(e) => updateChapter(index, 'duration', Number(e.target.value))}
                        className="border rounded px-3 py-1 w-full"
                      />
                      <p className="text-xs text-gray-400 mt-0.5">例：900 = 15分鐘</p>
                    </div>
                    <div className="col-span-3">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Bunny.net 影片 ID</label>
                      <input
                        type="text"
                        placeholder="Bunny.net Video ID"
                        value={chapter.bunnyVideoId}
                        onChange={(e) => updateChapter(index, 'bunnyVideoId', e.target.value)}
                        className="border rounded px-3 py-1 w-full"
                      />
                      <p className="text-xs text-gray-400 mt-0.5">從 Bunny.net Stream 後台複製影片的 GUID</p>
                    </div>
                  </div>
                  <button onClick={() => removeChapter(index)} className="text-red-400 hover:text-red-600">
                    &times;
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 提示詞管理 */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold">提示詞管理</h3>
              <button
                onClick={() => setPrompts([...prompts, { id: crypto.randomUUID(), title: '', content: '', order: prompts.length + 1 }])}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm"
              >
                新增提示詞
              </button>
            </div>
            <div className="space-y-3">
              {prompts.map((prompt, index) => (
                <div key={prompt.id} className="border rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => {
                          if (index === 0) return;
                          const updated = [...prompts];
                          [updated[index], updated[index - 1]] = [updated[index - 1], updated[index]];
                          setPrompts(updated.map((p, i) => ({ ...p, order: i + 1 })));
                        }}
                        className="text-gray-400 hover:text-gray-600 text-xs"
                      >&#9650;</button>
                      <span className="text-sm text-gray-400 text-center">{index + 1}</span>
                      <button
                        onClick={() => {
                          if (index === prompts.length - 1) return;
                          const updated = [...prompts];
                          [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
                          setPrompts(updated.map((p, i) => ({ ...p, order: i + 1 })));
                        }}
                        className="text-gray-400 hover:text-gray-600 text-xs"
                      >&#9660;</button>
                    </div>
                    <div className="flex-1 space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">標題</label>
                        <input
                          type="text"
                          placeholder="提示詞標題"
                          value={prompt.title}
                          onChange={(e) => {
                            const updated = [...prompts];
                            updated[index] = { ...updated[index], title: e.target.value };
                            setPrompts(updated);
                          }}
                          className="border rounded px-3 py-2 w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">內容</label>
                        <textarea
                          placeholder="提示詞內容（使用者會一鍵複製此內容）"
                          value={prompt.content}
                          onChange={(e) => {
                            const updated = [...prompts];
                            updated[index] = { ...updated[index], content: e.target.value };
                            setPrompts(updated);
                          }}
                          rows={6}
                          className="border rounded px-3 py-2 w-full font-mono text-sm"
                        />
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (!confirm(`確定要刪除「${prompt.title || '此提示詞'}」嗎？`)) return;
                        setPrompts(prompts.filter((_, i) => i !== index).map((p, i) => ({ ...p, order: i + 1 })));
                      }}
                      className="text-red-400 hover:text-red-600 text-lg"
                    >&times;</button>
                  </div>
                </div>
              ))}
              {prompts.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">尚未新增提示詞</p>
              )}
            </div>
          </div>

          {/* 不退費使用區設定 */}
          <div className="border-t pt-4">
            <h3 className="font-bold mb-4">不退費使用區設定</h3>
            <p className="text-sm text-gray-500 mb-4">使用者使用以下資源後，將自動放棄七天退費權益</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">LINE 匿名社群連結</label>
                <input
                  type="url"
                  placeholder="https://line.me/ti/g2/..."
                  value={lineGroupUrl}
                  onChange={(e) => setLineGroupUrl(e.target.value)}
                  className="w-full border rounded-lg px-4 py-2"
                />
                <p className="text-xs text-gray-400 mt-0.5">留空則不顯示社群入口</p>
              </div>

              <div>
                <label className="text-sm font-medium block mb-3">檔案下載區</label>

                {/* 上傳按鈕區 */}
                <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center mb-4 hover:border-blue-400 transition-colors">
                  <p className="text-gray-400 text-sm mb-3">點擊下方按鈕上傳檔案，可拖曳檔案到資料夾中</p>
                  <div className="flex gap-3 justify-center flex-wrap">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                    >
                      選擇檔案
                    </button>
                    <button
                      type="button"
                      onClick={() => folderInputRef.current?.click()}
                      className="px-4 py-2 bg-gray-600 text-white rounded-lg text-sm font-medium hover:bg-gray-700"
                    >
                      上傳資料夾
                    </button>
                    <button
                      type="button"
                      onClick={addFolder}
                      className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600"
                    >
                      新增資料夾
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">支援批量上傳，檔案將儲存至 Firebase Storage</p>
                </div>

                {/* 隱藏的 file inputs */}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleBatchUpload(e.target.files);
                    }
                    e.target.value = '';
                  }}
                />
                <input
                  ref={folderInputRef}
                  type="file"
                  className="hidden"
                  {...{ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>}
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleBatchUpload(e.target.files);
                    }
                    e.target.value = '';
                  }}
                />

                {/* 檔案與資料夾列表 */}
                {downloadFiles.length === 0 && downloadFolders.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">尚未上傳檔案</p>
                ) : (
                  <div className="border rounded-xl overflow-hidden">
                    <div className="px-4 py-2 bg-gray-50 border-b">
                      <span className="text-xs text-gray-500">
                        {downloadFolders.length > 0 && `${downloadFolders.length} 個資料夾、`}
                        {downloadFiles.length} 個檔案，
                        {formatFileSize(downloadFiles.reduce((sum, f) => sum + f.size, 0))}
                      </span>
                    </div>
                    <div
                      ref={fileListRef}
                      className="max-h-[500px] overflow-y-auto"
                      onDragOver={handleDragOverList}
                      onDragLeave={stopAutoScroll}
                      onDrop={stopAutoScroll}
                      onDragEnd={stopAutoScroll}
                    >

                      {/* 根目錄檔案（可拖放到資料夾） */}
                      <div
                        className={`${dragOverFolderId === '__root__' ? 'bg-blue-50' : ''}`}
                        onDragOver={(e) => { e.preventDefault(); setDragOverFolderId('__root__'); }}
                        onDragLeave={() => setDragOverFolderId(null)}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (dragFileId) moveFileToFolder(dragFileId, undefined);
                          setDragOverFolderId(null);
                          setDragFileId(null);
                        }}
                      >
                        {downloadFiles.filter((f) => !f.folderId).map((file) => {
                          const isUploading = uploadingFiles.has(file.id);
                          const progress = uploadingFiles.get(file.id) || 0;
                          const isUploaded = !!file.storagePath;
                          return (
                            <div
                              key={file.id}
                              draggable
                              onDragStart={() => setDragFileId(file.id)}
                              onDragEnd={() => { setDragFileId(null); setDragOverFolderId(null); }}
                              className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50 group relative border-b cursor-grab active:cursor-grabbing"
                            >
                              {isUploading && (
                                <div className="absolute inset-0 bg-blue-50 transition-all" style={{ width: `${progress}%` }} />
                              )}
                              <div className="relative flex items-center gap-3 flex-1 min-w-0">
                                <span className="text-xl shrink-0">{getFileIcon(file.name)}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">{file.name}</p>
                                  <input
                                    type="text"
                                    placeholder="備註說明（選填）"
                                    value={file.note || ''}
                                    onChange={(e) => updateFileNote(file.id, e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    className="w-full text-xs text-gray-500 border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-400 outline-none py-0.5 bg-transparent placeholder-gray-300"
                                  />
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-400">{formatFileSize(file.size)}</span>
                                    {isUploading && <span className="text-xs text-blue-600 font-medium">上傳中 {progress}%</span>}
                                    {isUploaded && !isUploading && <span className="text-xs text-green-600">已上傳</span>}
                                    {!isUploaded && !isUploading && <span className="text-xs text-yellow-600">等待上傳</span>}
                                  </div>
                                </div>
                                <button
                                  onClick={() => removeDownloadFile(file.id)}
                                  className="text-red-400 hover:text-red-600 text-lg shrink-0"
                                >
                                  &times;
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* 資料夾 */}
                      {downloadFolders.map((folder) => {
                        const folderFiles = downloadFiles.filter((f) => f.folderId === folder.id);
                        const isDragOver = dragOverFolderId === folder.id;
                        const isCollapsed = collapsedFolders.has(folder.id);
                        return (
                          <div key={folder.id} className="border-b">
                            {/* 資料夾標頭（可拖放檔案進來） */}
                            <div
                              className={`px-4 py-3 flex items-center gap-3 group transition-colors cursor-pointer select-none ${isDragOver ? 'bg-amber-100' : 'bg-amber-50 hover:bg-amber-100'}`}
                              onClick={() => toggleFolder(folder.id)}
                              onDragOver={(e) => { e.preventDefault(); setDragOverFolderId(folder.id); }}
                              onDragLeave={() => setDragOverFolderId(null)}
                              onDrop={(e) => {
                                e.preventDefault();
                                if (dragFileId) {
                                  moveFileToFolder(dragFileId, folder.id);
                                  // 展開資料夾以顯示拖入的檔案
                                  setCollapsedFolders((prev) => { const next = new Set(prev); next.delete(folder.id); return next; });
                                }
                                setDragOverFolderId(null);
                                setDragFileId(null);
                              }}
                            >
                              <span className="text-sm text-gray-400 transition-transform" style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>&#9660;</span>
                              <span className="text-xl">{isCollapsed ? '📁' : '📂'}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold">{folder.name}</p>
                                <span className="text-xs text-gray-400">
                                  {folderFiles.length} 個檔案
                                  {folderFiles.length > 0 && `，${formatFileSize(folderFiles.reduce((s, f) => s + f.size, 0))}`}
                                </span>
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); removeFolder(folder.id); }}
                                className="text-red-400 hover:text-red-600 text-lg shrink-0"
                              >
                                &times;
                              </button>
                            </div>
                            {/* 資料夾內的檔案 */}
                            {!isCollapsed && folderFiles.map((file) => {
                              const isUploading = uploadingFiles.has(file.id);
                              const progress = uploadingFiles.get(file.id) || 0;
                              const isUploaded = !!file.storagePath;
                              return (
                                <div
                                  key={file.id}
                                  draggable
                                  onDragStart={() => setDragFileId(file.id)}
                                  onDragEnd={() => { setDragFileId(null); setDragOverFolderId(null); }}
                                  className="pl-12 pr-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 group relative border-b border-gray-100 cursor-grab active:cursor-grabbing"
                                >
                                  {isUploading && (
                                    <div className="absolute inset-0 bg-blue-50 transition-all" style={{ width: `${progress}%` }} />
                                  )}
                                  <div className="relative flex items-center gap-3 flex-1 min-w-0">
                                    <span className="text-lg shrink-0">{getFileIcon(file.name)}</span>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm truncate">{file.name}</p>
                                      <input
                                        type="text"
                                        placeholder="備註說明（選填）"
                                        value={file.note || ''}
                                        onChange={(e) => updateFileNote(file.id, e.target.value)}
                                        onClick={(e) => e.stopPropagation()}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        className="w-full text-xs text-gray-500 border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-400 outline-none py-0.5 bg-transparent placeholder-gray-300"
                                      />
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs text-gray-400">{formatFileSize(file.size)}</span>
                                        {isUploading && <span className="text-xs text-blue-600 font-medium">上傳中 {progress}%</span>}
                                        {isUploaded && !isUploading && <span className="text-xs text-green-600">已上傳</span>}
                                        {!isUploaded && !isUploading && <span className="text-xs text-yellow-600">等待上傳</span>}
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => removeDownloadFile(file.id)}
                                      className="text-red-400 hover:text-red-600 text-lg shrink-0"
                                    >
                                      &times;
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t">
            <button onClick={closeEditor} className="px-6 py-2 border rounded-lg hover:bg-gray-50">取消</button>
            <button onClick={handleSave} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              儲存
            </button>
          </div>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">課程管理</h2>
        <button onClick={() => openEditor()} className="bg-blue-600 text-white px-6 py-2 rounded-lg">
          新增課程
        </button>
      </div>

      <div className="space-y-4">
        {courses.map((course) => (
          <div key={course.id} className="bg-white rounded-xl p-6 shadow-sm flex items-center gap-4">
            <img
              src={course.thumbnail || '/placeholder-course.jpg'}
              alt={course.title}
              className="w-20 h-14 object-cover rounded"
            />
            <div className="flex-1">
              <h3 className="font-bold">{course.title}</h3>
              <p className="text-sm text-gray-500">
                NT$ {course.price.toLocaleString()} · {course.chapters.length} 章節
              </p>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm ${course.isPublished ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {course.isPublished ? '已上架' : '已下架'}
            </span>
            <button
              onClick={() => togglePublish(course)}
              className="text-sm text-blue-600 hover:underline"
            >
              {course.isPublished ? '下架' : '上架'}
            </button>
            <button
              onClick={() => openEditor(course)}
              className="text-sm text-gray-600 hover:underline"
            >
              編輯
            </button>
          </div>
        ))}

        {courses.length === 0 && (
          <div className="bg-white rounded-xl p-12 text-center">
            <p className="text-gray-500">尚無課程，點擊上方按鈕新增</p>
          </div>
        )}
      </div>
    </div>
  );
}
