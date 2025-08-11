import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProjectNames, getAllProjects, uploadPartsExcel, getProjectNote, saveProjectNote, deleteProject, getUploadedFiles } from '../services/api';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ProjectNote, Project, UploadedFile, FileMapping } from '../types';
import ConfirmDialog from '../components/ConfirmDialog';
import FileMappingInfo from '../components/FileMappingInfo';

/**
 * @component ProjectSelection
 * @description 项目选择页面组件，用于显示所有可用项目，允许用户选择项目进行合并查看，
 * 上传Excel文件导入新项目，以及管理项目备注信息
 */

const ProjectSelection: React.FC = () => {
  // 所有可用项目名称列表
  const [projectNames, setProjectNames] = useState<string[]>([]);
  // 项目详细信息，包含文件ID
  const [projectDetails, setProjectDetails] = useState<Record<string, Project>>({});
  // 用户选中的项目列表（项目名称）
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  // 用户选中的项目文件ID列表
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  // 页面加载状态
  const [loading, setLoading] = useState<boolean>(true);
  // 错误信息
  const [error, setError] = useState<string | null>(null);
  // 文件上传状态
  const [uploading, setUploading] = useState<boolean>(false);
  // 上传结果状态，包含成功/失败信息和详情
  const [uploadSuccess, setUploadSuccess] = useState<{status: string, rows: number, details?: {filename: string, project_name: string, file_id: string, status: string, rows_imported?: number, error?: string}[]} | null>(null);
  // 文件上传输入框引用
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 项目备注信息，键为项目名，值为备注内容
  const [projectNotes, setProjectNotes] = useState<Record<string, string>>({});
  // 当前正在编辑的项目备注
  const [editingNote, setEditingNote] = useState<{project: string, note: string} | null>(null);
  // 备注保存状态
  const [savingNote, setSavingNote] = useState<boolean>(false);
  // 删除项目状态
  const [deleting, setDeleting] = useState<boolean>(false);
  // 确认删除对话框状态
  const [confirmDelete, setConfirmDelete] = useState<{isOpen: boolean, projectName: string}>({isOpen: false, projectName: ''});
  // 上传文件列表
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  // 上传文件加载状态
  const [loadingFiles, setLoadingFiles] = useState<boolean>(false);
  // 当前选中查看的文件ID
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  // 文件映射信息显示状态
  const [showFileMappings, setShowFileMappings] = useState<boolean>(false);
  // 路由导航hook
  const navigate = useNavigate();

  /**
   * @effect 组件挂载时获取项目列表、项目详细信息和项目备注
   * @description 在组件挂载后，从API获取所有可用项目名称、详细信息和对应的备注信息
   */
  useEffect(() => {
    const fetchProjectData = async () => {
      try {
        setLoading(true);
        // 获取所有项目名称
        const names = await getProjectNames();
        setProjectNames(names);
        
        // 获取所有项目详细信息
        const projects = await getAllProjects();
        const detailsObj: Record<string, Project> = {};
        
        // 将项目详细信息按项目名称组织成对象
        projects.forEach(project => {
          detailsObj[project.project_name] = project;
        });
        
        setProjectDetails(detailsObj);
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
        
        // 获取上传文件列表
        try {
          setLoadingFiles(true);
          const files = await getUploadedFiles();
          setUploadedFiles(files);
        } catch (err) {
          console.error('获取上传文件列表失败:', err);
        } finally {
          setLoadingFiles(false);
        }
      } catch (err) {
        setError('获取项目列表失败，请稍后重试');
        console.error('Error fetching project data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchProjectData();
  }, []);

  /**
   * @function handleProjectToggle
   * @description 切换项目选中状态，如果项目已选中则取消选中，否则添加到选中列表
   * 同时更新选中的项目名称列表和文件ID列表
   * @param {string} projectName - 要切换状态的项目名称
   */
  const handleProjectToggle = (projectName: string) => {
    // 更新选中的项目名称列表
    setSelectedProjects(prev => {
      if (prev.includes(projectName)) {
        return prev.filter(name => name !== projectName);
      } else {
        return [...prev, projectName];
      }
    });
    
    // 同时更新选中的文件ID列表
    setSelectedFileIds(prev => {
      const fileId = projectDetails[projectName]?.file_unique_id || '';
      if (!fileId) return prev; // 如果没有文件ID，不更新
      
      if (prev.includes(fileId)) {
        return prev.filter(id => id !== fileId);
      } else {
        return [...prev, fileId];
      }
    });
  };

  /**
   * @function handleMergeClick
   * @description 处理合并按钮点击事件，将选中的项目列表和文件ID列表作为参数导航到合并页面
   * @throws {Error} 如果没有选中任何项目，显示错误信息
   */
  const handleMergeClick = () => {
    if (selectedProjects.length === 0 || selectedFileIds.length === 0) {
      setError('请至少选择一个项目');
      return;
    }
    
    // 将选中的项目列表和文件ID列表序列化并编码为URL参数
    const projectsParam = encodeURIComponent(JSON.stringify(selectedProjects));
    const fileIdsParam = encodeURIComponent(JSON.stringify(selectedFileIds));
    navigate(`/merged-parts?projects=${projectsParam}&fileIds=${fileIdsParam}`);
  };

  /**
   * @function handleUploadClick
   * @description 处理上传按钮点击事件，触发隐藏的文件输入框点击
   */
  const handleUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  /**
   * @function handleFileChange
   * @description 处理文件选择变更事件，上传Excel文件并导入项目数据
   * @param {React.ChangeEvent<HTMLInputElement>} event - 文件输入框变更事件
   */
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;

    // 转换FileList为数组
    const filesArray = Array.from(fileList);
    
    // 验证所有文件格式，确保都是Excel文件
    const invalidFiles = filesArray.filter(file => !file.name.endsWith('.xlsx') && !file.name.endsWith('.xls'));
    if (invalidFiles.length > 0) {
      setError(`请确保所有上传的文件都是Excel格式（.xlsx或.xls）。以下文件格式不正确：${invalidFiles.map(f => f.name).join(', ')}`);
      return;
    }

    try {
      // 设置上传状态和清除之前的状态
      setUploading(true);
      setError(null);
      setUploadSuccess(null);
      
      // 调用API上传Excel文件
      const result = await uploadPartsExcel(filesArray);
      
      // 设置上传结果状态
      setUploadSuccess({
        status: result.status,
        rows: result.rows_imported,
        details: result.details
      });
      
      // 上传成功后重新获取项目列表
      const names = await getProjectNames();
      setProjectNames(names);
      
      // 获取所有项目详细信息
      const projects = await getAllProjects();
      const detailsObj: Record<string, Project> = {...projectDetails};
      
      // 将项目详细信息按项目名称组织成对象
      projects.forEach(project => {
        detailsObj[project.project_name] = project;
      });
      
      setProjectDetails(detailsObj);
      
      // 获取新项目的备注信息
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
      
      // 获取最新的上传文件列表
      try {
        const files = await getUploadedFiles();
        setUploadedFiles(files);
      } catch (err) {
        console.error('获取上传文件列表失败:', err);
      }
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
  
  /**
   * @function handleEditNote
   * @description 开始编辑指定项目的备注信息
   * @param {string} projectName - 要编辑备注的项目名称
   */
  const handleEditNote = (projectName: string) => {
    setEditingNote({
      project: projectName,
      note: projectNotes[projectName] || ''
    });
  };
  
  /**
   * @function handleSaveNote
   * @description 保存当前正在编辑的项目备注
   * @async
   */
  const handleSaveNote = async () => {
    if (!editingNote) return;
    
    try {
      setSavingNote(true);
      setError(null);
      
      // 查找上传成功的文件ID，如果是刚上传的项目，关联文件ID
      let fileUniqueId = '';
      if (uploadSuccess && uploadSuccess.details) {
        const projectDetail = uploadSuccess.details.find(d => d.project_name === editingNote.project && d.status === 'success');
        if (projectDetail) {
          fileUniqueId = projectDetail.file_id;
        }
      }
      
      // 调用API保存项目备注
      const result = await saveProjectNote({
        project_name: editingNote.project,
        file_unique_id: fileUniqueId,
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
  
  /**
   * @function handleShowDeleteConfirm
   * @description 显示删除确认对话框
   * @param {string} projectName - 要删除的项目名称
   * @param {React.MouseEvent} e - 点击事件对象
   */
  const handleShowDeleteConfirm = (projectName: string, e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止事件冒泡，避免触发项目选择
    setConfirmDelete({isOpen: true, projectName});
  };

  /**
   * @function handleCancelDelete
   * @description 取消删除操作
   */
  const handleCancelDelete = () => {
    setConfirmDelete({isOpen: false, projectName: ''});
  };

  /**
   * @function handleConfirmDelete
   * @description 确认删除项目
   * @async
   */
  const handleConfirmDelete = async () => {
    try {
      setDeleting(true);
      await deleteProject(confirmDelete.projectName);
      
      // 更新项目列表
      setProjectNames(prev => prev.filter(name => name !== confirmDelete.projectName));
      
      // 如果该项目在已选择列表中，也需要移除
      setSelectedProjects(prev => prev.filter(name => name !== confirmDelete.projectName));
      
      // 关闭确认对话框
      setConfirmDelete({isOpen: false, projectName: ''});
    } catch (err) {
      console.error('删除项目失败:', err);
      setError('删除项目失败，请重试');
    } finally {
      setDeleting(false);
    }
  };
  
  /**
   * @function handleViewFileMappings
   * @description 处理查看文件映射信息的操作，设置选中的文件ID并显示映射信息
   * @param {string} fileUniqueId - 要查看映射的文件唯一ID
   * @param {React.MouseEvent} e - 点击事件对象，用于阻止事件冒泡
   */
  const handleViewFileMappings = (fileUniqueId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止事件冒泡，避免触发项目选择
    setSelectedFileId(fileUniqueId);
    setShowFileMappings(true);
  };
  
  /**
   * @function handleCloseFileMappings
   * @description 关闭文件映射信息显示
   */
  const handleCloseFileMappings = () => {
    setShowFileMappings(false);
    setSelectedFileId(null);
  };
  
  /**
   * @function handleCancelEditNote
   * @description 取消编辑项目备注，不保存更改
   */
  const handleCancelEditNote = () => {
    setEditingNote(null);
  };

  /**
   * @returns {JSX.Element} 渲染项目选择页面的UI组件
   */
  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* 页面标题和操作按钮区域 */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-blue-700 mb-2">零部件库管理系统</h1>
          <h2 className="text-xl text-gray-600 border-b pb-2">选择项目进行合并查看</h2>
        </div>
        {/* 操作按钮区域：合并项目和上传Excel文件 */}
        <div className="flex items-center space-x-4">
          {/* 合并选中项目按钮 */}
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
          {/* 查看已保存的合并项目按钮 */}
          <button
            onClick={() => navigate('/merged-projects')}
            className="px-6 py-3 rounded-lg shadow-md font-medium text-lg flex items-center transition-all duration-200 bg-purple-600 text-white hover:bg-purple-700 hover:shadow-lg"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z" />
            </svg>
            已保存的合并项目
          </button>
          {/* 上传Excel文件按钮 */}
          <button
            onClick={handleUploadClick}
            disabled={uploading}
            className={`px-6 py-3 rounded-lg shadow-md font-semibold text-lg flex items-center transition-all duration-200 ${uploading ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700 hover:shadow-lg'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
            {uploading ? '上传中...' : '上传Excel文件（可多选）'}
          </button>
        </div>
        {/* 隐藏的文件上传输入框，通过按钮触发点击 */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".xlsx,.xls"
          className="hidden"
          multiple
        />
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
      
      {/* 上传结果提示区域，仅在上传完成后显示 */}
      {uploadSuccess && (
        <div className={`p-4 rounded-md shadow-md mb-6 border-l-4 ${uploadSuccess.status === 'success' || uploadSuccess.status === 'imported' ? 'bg-green-50 border-green-500 text-green-700' : uploadSuccess.status === 'partial_success' || uploadSuccess.status === 'partial' ? 'bg-yellow-50 border-yellow-500 text-yellow-700' : 'bg-red-50 border-red-500 text-red-700'}`}>
          {/* 上传状态图标和文字提示 */}
          <div className="flex items-center">
            {uploadSuccess.status === 'success' || uploadSuccess.status === 'imported' ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-3 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : uploadSuccess.status === 'partial_success' || uploadSuccess.status === 'partial' ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-3 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-3 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            <span className="font-medium">
              {uploadSuccess.status === 'success' || uploadSuccess.status === 'imported' ? 'Excel文件上传成功！' : 
               uploadSuccess.status === 'partial_success' || uploadSuccess.status === 'partial' ? '部分Excel文件上传成功！' : 
               'Excel文件上传失败！'}
              {(uploadSuccess.status !== 'error' && uploadSuccess.status !== 'failed') && `已导入 ${uploadSuccess.rows} 条数据。`}
            </span>
          </div>
          
          {/* 上传详细信息列表，显示每个文件的上传结果 */}
          {uploadSuccess.details && uploadSuccess.details.length > 0 && (
            <div className="mt-3 ml-9">
              <p className="font-medium mb-1">详细信息：</p>
              <ul className="list-disc list-inside space-y-1">
                {uploadSuccess.details.map((detail, index) => (
                  <li key={index} className={detail.status === 'imported' ? 'text-green-600' : 'text-red-600'}>
                    {detail.filename} ({detail.project_name}): 
                    {detail.status === 'imported' 
                      ? `成功导入 ${detail.rows_imported} 条记录，文件ID: ${detail.file_id.substring(0, 8)}...` 
                      : `导入失败 - ${detail.error || '未知错误'}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      
      {/* 加载状态显示或项目列表内容 */}
      {loading || uploading ? (
        /* 加载中状态显示加载动画 */
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          <span className="ml-3 text-lg text-gray-600">{uploading ? '上传Excel文件中...' : '加载项目中...'}</span>
        </div>
      ) : (
        <div>
          <div className="mb-4">
            {/* 根据是否有项目显示不同内容 */}
            {projectNames.length === 0 ? (
              /* 无项目时显示空状态提示 */
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
              /* 有项目时显示项目卡片网格 */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* 遍历所有项目名称，为每个项目创建卡片 */}
                {projectNames.map(name => (
                  <div 
                    key={name}
                    className={`border p-5 rounded-lg shadow-md transition-all duration-200 hover:shadow-lg ${selectedProjects.includes(name) ? 'bg-blue-50 border-blue-500' : 'hover:border-gray-300'}`}
                  >
                    <div className="cursor-pointer" onClick={() => handleProjectToggle(name)}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <div className={`w-5 h-5 rounded mr-3 flex items-center justify-center border ${selectedProjects.includes(name) ? 'bg-blue-500 border-blue-500' : 'border-gray-400'}`}>
                            {selectedProjects.includes(name) && (
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            )}
                          </div>
                          <span className="text-lg font-medium">{name}</span>
                        </div>
                        <button
                          onClick={(e) => handleShowDeleteConfirm(name, e)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-full transition-colors"
                          disabled={deleting}
                        >
                          {deleting && confirmDelete.projectName === name ? (
                            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          )}
                        </button>
                      </div>
                      {/* 文件ID显示 */}
                      {projectDetails[name] && projectDetails[name].file_unique_id && (
                        <div className="ml-8 mt-1 text-xs text-gray-500 flex items-center">
                          <span>文件ID: {projectDetails[name].file_unique_id.substring(0, 8)}...</span>
                          <button 
                            onClick={(e) => handleViewFileMappings(projectDetails[name].file_unique_id, e)}
                            className="ml-2 text-blue-500 hover:text-blue-700 flex items-center"
                            title="查看文件映射信息"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                    
                    {/* 项目备注区域 - 显示或编辑项目备注 */}
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      {/* 编辑模式 - 当前项目正在编辑备注时显示 */}
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
                        /* 查看模式 - 显示备注内容或添加备注提示 */
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
          
          {/* 上传文件历史记录 */}
          <div className="mt-10">
            <h2 className="text-xl font-semibold mb-4">上传文件历史记录</h2>
            {loadingFiles ? (
              <div className="flex justify-center items-center py-8">
                <svg className="animate-spin h-8 w-8 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="ml-2 text-gray-600">加载文件历史记录...</span>
              </div>
            ) : uploadedFiles.length === 0 ? (
              <div className="text-center py-8 text-gray-500">暂无上传文件记录</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">文件名</th>
                      <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">项目名称</th>
                      <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">文件大小</th>
                      <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">上传时间</th>
                      <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                      <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">导入行数/操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {uploadedFiles.map((file) => (
                      <tr key={file.file_unique_id} className="hover:bg-gray-50">
                        <td className="py-3 px-4 text-sm text-gray-900">{file.original_filename}</td>
                        <td className="py-3 px-4 text-sm text-gray-900">{file.project_name}</td>
                        <td className="py-3 px-4 text-sm text-gray-500">{formatFileSize(file.file_size)}</td>
                        <td className="py-3 px-4 text-sm text-gray-500">{new Date(file.upload_time).toLocaleString()}</td>
                        <td className="py-3 px-4 text-sm">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${file.status === 'imported' ? 'bg-green-100 text-green-800' : file.status === 'partial' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                            {file.status === 'imported' ? '成功' : file.status === 'partial' ? '部分成功' : '失败'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-500">
                          <div className="flex items-center">
                            <span>{file.rows_imported}</span>
                            {file.status === 'imported' && (
                              <button 
                                onClick={(e) => handleViewFileMappings(file.file_unique_id, e)}
                                className="ml-2 text-blue-500 hover:text-blue-700"
                                title="查看文件映射信息"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          
          {/* 合并按钮已移至页面顶部 */}
        </div>
      )}

      {/* 确认删除对话框 */}
      <ConfirmDialog
        isOpen={confirmDelete.isOpen}
        title="删除项目"
        message={`确定要删除项目 "${confirmDelete.projectName}"? 此操作不可撤销，项目中的所有零部件数据将被永久删除。`}
        confirmText="删除"
        cancelText="取消"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
      
      {/* 文件映射信息对话框 */}
      {showFileMappings && selectedFileId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] overflow-hidden">
            <div className="flex justify-between items-center border-b px-6 py-4">
              <h3 className="text-lg font-medium">文件映射信息</h3>
              <button 
                onClick={handleCloseFileMappings}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto p-2" style={{ maxHeight: 'calc(80vh - 4rem)' }}>
              <FileMappingInfo fileUniqueId={selectedFileId} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 格式化文件大小
 */
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * 导出项目选择组件作为默认导出
 */
export default ProjectSelection;