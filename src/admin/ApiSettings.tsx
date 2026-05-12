import { useEffect, useState, useCallback } from 'react';
import api from '../lib/api';

interface SettingKey {
  key: string;
  label: string;
  configured: boolean;
  maskedValue: string;
}

interface Category {
  id: string;
  label: string;
  keys: SettingKey[];
}

/** Services that support connection testing */
const TESTABLE_SERVICES: Record<string, string> = {
  newebpay: 'newebpay',
  ezpay: 'ezpay',
  lineLogin: 'line',
  lineMessaging: 'line',
  google: 'google',
  facebook: 'facebook',
  sendgrid: 'sendgrid',
  bunny: 'bunny',
};

/** Extra notes per key */
const KEY_NOTES: Record<string, string> = {
  NEWEBPAY_API_URL: '測試環境 ccore.newebpay.com / 正式環境 core.newebpay.com',
  FB_PIXEL_ID: '此為前端設定，儲存方式與其他金鑰不同',
};

export default function ApiSettings() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Track which fields are in edit mode
  const [editingKeys, setEditingKeys] = useState<Record<string, boolean>>({});
  // Track input values
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  // Track saving state per key
  const [savingKeys, setSavingKeys] = useState<Record<string, boolean>>({});
  // Track save results per key
  const [saveResults, setSaveResults] = useState<Record<string, { success: boolean; message: string }>>({});
  // Track collapsed categories
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // Track test results
  const [testingService, setTestingService] = useState('');
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get('/getApiSettings');
      setCategories(res.data.categories);
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入設定失敗');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleEdit = (key: string) => {
    setEditingKeys((prev) => ({ ...prev, [key]: true }));
    setInputValues((prev) => ({ ...prev, [key]: '' }));
    setSaveResults((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleCancel = (key: string) => {
    setEditingKeys((prev) => ({ ...prev, [key]: false }));
    setInputValues((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleSave = async (key: string) => {
    const value = inputValues[key];
    if (value === undefined) return;

    setSavingKeys((prev) => ({ ...prev, [key]: true }));
    setSaveResults((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

    try {
      await api.post('/updateApiSettings', { key, value });
      setSaveResults((prev) => ({ ...prev, [key]: { success: true, message: '儲存成功' } }));
      setEditingKeys((prev) => ({ ...prev, [key]: false }));
      // Reload to get updated masked values
      await loadSettings();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '儲存失敗';
      setSaveResults((prev) => ({ ...prev, [key]: { success: false, message: msg } }));
    } finally {
      setSavingKeys((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleTest = async (categoryId: string) => {
    const service = TESTABLE_SERVICES[categoryId];
    if (!service) return;

    setTestingService(categoryId);
    setTestResults((prev) => {
      const next = { ...prev };
      delete next[categoryId];
      return next;
    });

    try {
      const res = await api.post('/testApiConnection', { service });
      setTestResults((prev) => ({ ...prev, [categoryId]: res.data }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : '測試失敗';
      setTestResults((prev) => ({ ...prev, [categoryId]: { success: false, message: msg } }));
    } finally {
      setTestingService('');
    }
  };

  const toggleCollapse = (categoryId: string) => {
    setCollapsed((prev) => ({ ...prev, [categoryId]: !prev[categoryId] }));
  };

  const getCategoryStatus = (category: Category) => {
    const allConfigured = category.keys.every((k) => k.configured);
    const anyConfigured = category.keys.some((k) => k.configured);
    if (allConfigured) return 'configured';
    if (anyConfigured) return 'partial';
    return 'none';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-gray-500">載入中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-red-500">{error}</p>
        <button
          onClick={loadSettings}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          重試
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">API 串接設定</h2>
        <button
          onClick={loadSettings}
          className="px-3 py-1.5 text-sm bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
        >
          重新載入
        </button>
      </div>

      <p className="text-sm text-gray-500 mb-6">
        管理所有第三方 API 金鑰與憑證。修改後的設定會在下次 Cloud Function 執行時生效（最多 5 分鐘快取）。
      </p>

      <div className="space-y-4">
        {categories.map((category) => {
          const status = getCategoryStatus(category);
          const isCollapsed = collapsed[category.id];
          const testResult = testResults[category.id];
          const isTestable = !!TESTABLE_SERVICES[category.id];

          return (
            <div key={category.id} className="bg-white rounded-xl shadow-sm border border-gray-200">
              {/* Card header */}
              <div
                className="flex items-center justify-between px-6 py-4 cursor-pointer select-none"
                onClick={() => toggleCollapse(category.id)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg font-semibold">{category.label}</span>
                  {status === 'configured' && (
                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">
                      已設定
                    </span>
                  )}
                  {status === 'partial' && (
                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-100 text-yellow-700">
                      部分設定
                    </span>
                  )}
                  {status === 'none' && (
                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-500">
                      未設定
                    </span>
                  )}
                </div>
                <svg
                  className={`w-5 h-5 text-gray-400 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>

              {/* Card body */}
              {!isCollapsed && (
                <div className="border-t border-gray-100 px-6 py-4">
                  <div className="space-y-4">
                    {category.keys.map((setting) => {
                      const isEditing = editingKeys[setting.key];
                      const isSaving = savingKeys[setting.key];
                      const result = saveResults[setting.key];
                      const note = KEY_NOTES[setting.key];

                      return (
                        <div key={setting.key} className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <label className="text-sm font-medium text-gray-700 min-w-[140px]">
                              {setting.label}
                            </label>
                            <code className="text-xs text-gray-400">{setting.key}</code>
                          </div>

                          {note && (
                            <p className="text-xs text-amber-600 ml-0">{note}</p>
                          )}

                          <div className="flex items-center gap-2 flex-wrap">
                            {!isEditing ? (
                              <>
                                <span
                                  className={`font-mono text-sm px-3 py-1.5 rounded-md ${
                                    setting.configured
                                      ? 'bg-gray-100 text-gray-700'
                                      : 'bg-red-50 text-red-400'
                                  }`}
                                >
                                  {setting.configured ? setting.maskedValue : '未設定'}
                                </span>
                                <button
                                  onClick={() => handleEdit(setting.key)}
                                  className="px-3 py-1.5 text-xs bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100"
                                >
                                  編輯
                                </button>
                              </>
                            ) : (
                              <>
                                <input
                                  type="text"
                                  value={inputValues[setting.key] || ''}
                                  onChange={(e) =>
                                    setInputValues((prev) => ({ ...prev, [setting.key]: e.target.value }))
                                  }
                                  placeholder="輸入新值..."
                                  className="flex-1 min-w-[200px] max-w-[400px] px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                                  disabled={isSaving}
                                />
                                <button
                                  onClick={() => handleSave(setting.key)}
                                  disabled={isSaving || !inputValues[setting.key]}
                                  className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {isSaving ? '儲存中...' : '儲存'}
                                </button>
                                <button
                                  onClick={() => handleCancel(setting.key)}
                                  disabled={isSaving}
                                  className="px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 disabled:opacity-50"
                                >
                                  取消
                                </button>
                              </>
                            )}
                          </div>

                          {result && (
                            <p className={`text-xs ${result.success ? 'text-green-600' : 'text-red-500'}`}>
                              {result.message}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Test connection button */}
                  {isTestable && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleTest(category.id)}
                          disabled={testingService === category.id}
                          className="px-4 py-2 text-sm bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {testingService === category.id ? '測試中...' : '測試連線'}
                        </button>
                        {testResult && (
                          <span
                            className={`text-sm ${testResult.success ? 'text-green-600' : 'text-red-500'}`}
                          >
                            {testResult.message}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
