import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMergedProjects, exportMergedProject, deleteMergedProject } from '../services/api';
import { MergedProject } from '../types';
import ConfirmDialog from '../components/ConfirmDialog';

/**
 * @component MergedProjectList
 * @description 合并项目列表页面组件，用于显示所有已保存的合并项目，
 * 允许用户查看合并项目的零部件或导出为Excel文件
 */
const MergedProjectList: React.FC = () => {
  // 状态管理
  const [mergedProjects, setMergedProjects] = useState<MergedProject[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<Record<number, boolean>>({});
  // 删除状态
  const [deleting, setDeleting] = useState<Record<number, boolean>>({});
  // 确认删除对话框状态
  const [confirmDelete, setConfirmDelete] = useState<{isOpen: boolean, projectId: number | null, projectName: string}>({isOpen: false, projectId: null, projectName: ''});
  // 路由导航hook
  const navigate = useNavigate();

  /**
   * @function fetchMergedProjects
   * @description 获取所有已保存的合并项目列表
   * @async
   */
  const fetchMergedProjects = async () => {
    try {
      setLoading(true);
      setError(null);
      const projects = await getMergedProjects();
      setMergedProjects(projects);
    } catch (err) {
      console.error('获取合并项目列表失败:', err);
      setError('获取合并项目列表失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  // 组件挂载时获取合并项目列表
  useEffect(() => {
    fetchMergedProjects();
  }, []);

  /**
   * @function handleViewParts
   * @description 查看指定合并项目的零部件
   * @param {number} mergedProjectId - 合并项目ID
   */
  const handleViewParts = async (mergedProjectId: number) => {
    try {
      // 导航到零部件查看页面，传递合并项目ID作为参数
      navigate(`/merged-project-parts/${mergedProjectId}`);
    } catch (err) {
      console.error(`查看合并项目 ${mergedProjectId} 的零部件失败:`, err);
      setError(`查看合并项目零部件失败，请稍后重试`);
    }
  };

  /**
   * @function handleExport
   * @description 导出指定合并项目为Excel文件
   * @param {number} mergedProjectId - 合并项目ID
   * @param {string} projectName - 合并项目名称
   */
  const handleExport = async (mergedProjectId: number, projectName: string) => {
    try {
      // 设置导出状态
      setExporting(prev => ({ ...prev, [mergedProjectId]: true }));
      
      // 调用API导出合并项目
      await exportMergedProject(mergedProjectId, projectName);
      
      // 导出成功，清除任何之前的错误
      setError(null);
    } catch (err: any) {
      console.error(`导出合并项目 ${mergedProjectId} 失败:`, err);
      // 显示更具体的错误信息
      setError(`导出合并项目失败: ${err.message || '请稍后重试'}`);
    } finally {
      // 清除导出状态
      setExporting(prev => ({ ...prev, [mergedProjectId]: false }));
    }
  };

  /**
   * @function handleBackToProjects
   * @description 返回到项目选择页面
   */
  const handleBackToProjects = () => {
    navigate('/');
  };

  /**
   * @function handleShowDeleteConfirm
   * @description 显示删除确认对话框
   * @param {number} projectId - 要删除的项目ID
   * @param {string} projectName - 要删除的项目名称
   */
  const handleShowDeleteConfirm = (projectId: number, projectName: string) => {
    setConfirmDelete({isOpen: true, projectId, projectName});
  };

  /**
   * @function handleCancelDelete
   * @description 取消删除操作
   */
  const handleCancelDelete = () => {
    setConfirmDelete({isOpen: false, projectId: null, projectName: ''});
  };

  /**
   * @function handleConfirmDelete
   * @description 确认删除项目
   */
  const handleConfirmDelete = async () => {
    if (!confirmDelete.projectId) return;
    
    try {
      // 设置删除状态
      setDeleting(prev => ({ ...prev, [confirmDelete.projectId!]: true }));
      
      // 调用API删除合并项目
      const result = await deleteMergedProject(confirmDelete.projectId);
      
      if (result.status === 'success') {
        // 删除成功，刷新项目列表
        fetchMergedProjects();
        // 显示成功消息
        setError(null);
      } else {
        // 删除失败，显示错误消息
        setError(`删除项目失败: ${result.message}`);
      }
    } catch (err) {
      console.error(`删除合并项目 ${confirmDelete.projectId} 失败:`, err);
      setError(`删除合并项目失败，请稍后重试`);
    } finally {
      // 清除删除状态和确认对话框
      setDeleting(prev => ({ ...prev, [confirmDelete.projectId!]: false }));
      setConfirmDelete({isOpen: false, projectId: null, projectName: ''});
    }
  };

  /**
   * @returns {JSX.Element} 渲染合并项目列表页面的UI组件
   */
  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* 确认删除对话框 */}
      <ConfirmDialog
        isOpen={confirmDelete.isOpen}
        title="确认删除"
        message={`确定要删除合并项目 "${confirmDelete.projectName}" 吗？此操作无法撤销。`}
        confirmText="删除"
        cancelText="取消"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
      
      {/* 页面标题和操作按钮区域 */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-blue-700 mb-2">零部件库管理系统</h1>
          <h2 className="text-xl text-gray-600 border-b pb-2">已保存的合并项目列表</h2>
        </div>
        {/* 返回按钮 */}
        <button
          onClick={handleBackToProjects}
          className="px-6 py-3 rounded-lg shadow-md font-medium text-lg flex items-center transition-all duration-200 bg-gray-600 text-white hover:bg-gray-700 hover:shadow-lg"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          返回项目列表
        </button>
      </div>
      
      {/* 错误提示区域，仅在有错误时显示 */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded-md shadow-md mb-6 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-3 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="font-medium">{error}</span>
        </div>
      )}
      
      {/* 加载状态显示或合并项目列表内容 */}
      {loading ? (
        /* 加载中状态显示加载动画 */
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          <span className="ml-3 text-lg text-gray-600">加载合并项目中...</span>
        </div>
      ) : (
        <div>
          <div className="mb-4">
            {/* 根据是否有合并项目显示不同内容 */}
            {mergedProjects.length === 0 ? (
              /* 无合并项目时显示空状态提示 */
              <div className="flex flex-col items-center justify-center py-16 bg-gray-50 rounded-lg border border-gray-200">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-gray-500 text-xl font-medium">没有已保存的合并项目</div>
                <div className="text-gray-400 mt-2">请先在项目列表页面选择并合并项目，然后保存</div>
                <button
                  onClick={handleBackToProjects}
                  className="mt-6 px-6 py-2 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 transition-colors duration-200 flex items-center font-medium"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                  </svg>
                  返回项目列表
                </button>
              </div>
            ) : (
              /* 有合并项目时显示项目卡片列表 */
              <div className="grid grid-cols-1 gap-4">
                {mergedProjects.map(project => (
                  <div 
                    key={project.id}
                    className="border p-5 rounded-lg shadow-md transition-all duration-200 hover:shadow-lg bg-white"
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="text-xl font-semibold text-blue-700">{project.merged_project_name}</h3>
                        <div className="mt-2 text-sm text-gray-600">
                          <div><span className="font-medium">创建时间:</span> {new Date(project.created_at).toLocaleString()}</div>
                          {project.creator_name && (
                            <div className="mt-1">
                              <span className="font-medium">创建人:</span> 
                              <span className="text-gray-800">
                                {project.creator_full_name || project.creator_name}
                              </span>
                            </div>
                          )}
                          <div className="mt-1">
                            <span className="font-medium">源项目:</span> 
                            <div className="ml-2 mt-1">
                              {project.source_projects.map((name, index) => (
                                <span key={index} className="inline-block bg-blue-100 text-blue-800 rounded-full px-3 py-1 text-xs font-semibold mr-2 mb-2">
                                  {name}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex space-x-3">
                        {/* 查看零部件按钮 */}
                        <button
                          onClick={() => handleViewParts(project.id)}
                          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors duration-200 flex items-center"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                            <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                          </svg>
                          查看零部件
                        </button>
                        {/* 导出Excel按钮 */}
                        <button
                          onClick={() => handleExport(project.id, project.merged_project_name)}
                          disabled={exporting[project.id]}
                          className={`px-4 py-2 rounded-md transition-colors duration-200 flex items-center ${exporting[project.id] ? 'bg-gray-400 text-gray-200 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'}`}
                        >
                          {exporting[project.id] ? (
                            <>
                              <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              导出中...
                            </>
                          ) : (
                            <>
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                              </svg>
                              导出Excel
                            </>
                          )}
                        </button>
                        {/* 删除项目按钮 */}
                        <button
                          onClick={() => handleShowDeleteConfirm(project.id, project.merged_project_name)}
                          disabled={deleting[project.id]}
                          className={`px-4 py-2 rounded-md transition-colors duration-200 flex items-center ${deleting[project.id] ? 'bg-gray-400 text-gray-200 cursor-not-allowed' : 'bg-red-600 text-white hover:bg-red-700'}`}
                        >
                          {deleting[project.id] ? (
                            <>
                              <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              删除中...
                            </>
                          ) : (
                            <>
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                              </svg>
                              删除项目
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MergedProjectList;