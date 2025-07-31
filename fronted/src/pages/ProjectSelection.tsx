import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProjectNames, uploadPartsExcel, getProjectNote, saveProjectNote } from '../services/api';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ProjectNote } from '../types';

const ProjectSelection: React.FC = () => {
  const [projectNames, setProjectNames] = useState<string[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadSuccess, setUploadSuccess] = useState<{status: string, rows: number} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [projectNotes, setProjectNotes] = useState<Record<string, string>>({});
  const [editingNote, setEditingNote] = useState<{project: string, note: string} | null>(null);
  const [savingNote, setSavingNote] = useState<boolean>(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchProjectNames = async () => {
      try {
        setLoading(true);
        const names = await getProjectNames();
        setProjectNames(names);
        setError(null);
        
        // 获取所有项目的备注
        const notesObj: Record<string, string> = {};
        for (const name of names) {
          try {
            const note = await getProjectNote(name);
            notesObj[name] = note.note || '';
          } catch (err) {
            console.error(`获取项目 ${name} 的备注失败:`, err);
            notesObj[name] = '';
          }
        }
        setProjectNotes(notesObj);
      } catch (err) {
        setError('获取项目列表失败，请稍后重试');
        console.error('Error fetching project names:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchProjectNames();
  }, []);

  const handleProjectToggle = (projectName: string) => {
    setSelectedProjects(prev => {
      if (prev.includes(projectName)) {
        return prev.filter(name => name !== projectName);
      } else {
        return [...prev, projectName];
      }
    });
  };

  const handleMergeClick = () => {
    if (selectedProjects.length === 0) {
      setError('请至少选择一个项目');
      return;
    }
    
    const projectsParam = encodeURIComponent(JSON.stringify(selectedProjects));
    navigate(`/merged-parts?projects=${projectsParam}`);
  };

  const handleUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setError('请上传Excel文件（.xlsx或.xls格式）');
      return;
    }

    try {
      setUploading(true);
      setError(null);
      setUploadSuccess(null);
      
      const result = await uploadPartsExcel(file);
      
      setUploadSuccess({
        status: result.status,
        rows: result.rows_imported
      });
      
      // 重新获取项目列表
      const names = await getProjectNames();
      setProjectNames(names);
      
      // 获取新项目的备注
      const notesObj = {...projectNotes};
      for (const name of names) {
        if (!notesObj[name]) {
          try {
            const note = await getProjectNote(name);
            notesObj[name] = note.note || '';
          } catch (err) {
            console.error(`获取项目 ${name} 的备注失败:`, err);
            notesObj[name] = '';
          }
        }
      }
      setProjectNotes(notesObj);
    } catch (err) {
      console.error('上传Excel文件失败:', err);
      setError('上传Excel文件失败，请稍后重试');
    } finally {
      setUploading(false);
      // 清空文件输入，以便可以重新上传同一个文件
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };
  
  // 开始编辑项目备注
  const handleEditNote = (projectName: string) => {
    setEditingNote({
      project: projectName,
      note: projectNotes[projectName] || ''
    });
  };
  
  // 保存项目备注
  const handleSaveNote = async () => {
    if (!editingNote) return;
    
    try {
      setSavingNote(true);
      setError(null);
      
      const result = await saveProjectNote({
        project_name: editingNote.project,
        note: editingNote.note
      });
      
      // 更新本地备注状态
      setProjectNotes(prev => ({
        ...prev,
        [editingNote.project]: result.note
      }));
      
      // 关闭编辑模式
      setEditingNote(null);
    } catch (err) {
      console.error('保存项目备注失败:', err);
      setError('保存项目备注失败，请稍后重试');
    } finally {
      setSavingNote(false);
    }
  };
  
  // 取消编辑备注
  const handleCancelEditNote = () => {
    setEditingNote(null);
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-blue-700 mb-2">零部件库管理系统</h1>
          <h2 className="text-xl text-gray-600 border-b pb-2">选择项目进行合并查看</h2>
        </div>
        <button
          onClick={handleUploadClick}
          disabled={uploading}
          className={`px-6 py-3 rounded-lg shadow-md font-semibold text-lg flex items-center transition-all duration-200 ${uploading ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700 hover:shadow-lg'}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
          {uploading ? '上传中...' : '上传Excel文件'}
        </button>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".xlsx,.xls"
          className="hidden"
        />
      </div>
      
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded-md shadow-md mb-6 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-3 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="font-medium">{error}</span>
        </div>
      )}
      
      {uploadSuccess && (
        <div className="bg-green-50 border-l-4 border-green-500 text-green-700 p-4 rounded-md shadow-md mb-6 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-3 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="font-medium">Excel文件上传成功！已导入 {uploadSuccess.rows} 条数据。</span>
        </div>
      )}
      
      {loading || uploading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          <span className="ml-3 text-lg text-gray-600">{uploading ? '上传Excel文件中...' : '加载项目中...'}</span>
        </div>
      ) : (
        <div>
          <div className="mb-4">
            {projectNames.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 bg-gray-50 rounded-lg border border-gray-200">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-gray-500 text-xl font-medium">没有可用的项目</div>
                <div className="text-gray-400 mt-2">请点击右上角的"上传Excel文件"按钮上传项目数据</div>
                <button
                  onClick={handleUploadClick}
                  className="mt-6 px-6 py-2 bg-green-600 text-white rounded-lg shadow-md hover:bg-green-700 transition-colors duration-200 flex items-center font-medium"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                  上传Excel文件
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projectNames.map(name => (
                  <div 
                    key={name}
                    className={`border p-5 rounded-lg shadow-md transition-all duration-200 hover:shadow-lg ${selectedProjects.includes(name) ? 'bg-blue-50 border-blue-500' : 'hover:border-gray-300'}`}
                  >
                    <div className="flex items-center cursor-pointer" onClick={() => handleProjectToggle(name)}>
                      <div className={`w-5 h-5 rounded mr-3 flex items-center justify-center border ${selectedProjects.includes(name) ? 'bg-blue-500 border-blue-500' : 'border-gray-400'}`}>
                        {selectedProjects.includes(name) && (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                      <span className="text-lg font-medium">{name}</span>
                    </div>
                    
                    {/* 项目备注区域 */}
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      {editingNote && editingNote.project === name ? (
                        <div>
                          <textarea
                            className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            rows={3}
                            placeholder="添加项目备注..."
                            value={editingNote.note}
                            onChange={(e) => setEditingNote({...editingNote, note: e.target.value})}
                            disabled={savingNote}
                          />
                          <div className="flex justify-end mt-2 space-x-2">
                            <button
                              onClick={handleCancelEditNote}
                              disabled={savingNote}
                              className="px-3 py-1 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
                            >
                              取消
                            </button>
                            <button
                              onClick={handleSaveNote}
                              disabled={savingNote}
                              className="px-3 py-1 text-sm text-white bg-blue-500 rounded-md hover:bg-blue-600 transition-colors flex items-center"
                            >
                              {savingNote ? (
                                <>
                                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                  保存中...
                                </>
                              ) : '保存'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div 
                          className="min-h-[40px] text-sm text-gray-600 hover:bg-gray-50 p-2 rounded-md cursor-pointer flex items-start"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditNote(name);
                          }}
                        >
                          {projectNotes[name] ? (
                            <div className="flex-1">
                              <div className="font-medium text-gray-700 mb-1">备注:</div>
                              <div className="whitespace-pre-wrap">{projectNotes[name]}</div>
                            </div>
                          ) : (
                            <div className="flex items-center text-gray-400">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                              点击添加备注
                            </div>
                          )}
                          <div className="text-blue-500 ml-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="flex justify-center mt-8">
            <button
              onClick={handleMergeClick}
              disabled={selectedProjects.length === 0}
              className={`px-6 py-3 rounded-lg shadow-md font-medium text-lg flex items-center transition-all duration-200 ${selectedProjects.length === 0 ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-lg'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              合并选中项目
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectSelection;