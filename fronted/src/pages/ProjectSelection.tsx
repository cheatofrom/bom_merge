import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProjectNames, getAllProjects, getUserProjects, uploadPartsExcel, getProjectNote, saveProjectNote, getUploadedFiles, updateProjectName, deleteProjectByFileId, getUserCategories } from '../services/api';
import { checkPermission } from '../services/auth';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ProjectNote, Project, UploadedFile, FileMapping, Category } from '../types';
import { useAuth } from '../contexts/AuthContext';
import ConfirmDialog from '../components/ConfirmDialog';
import FileMappingInfo from '../components/FileMappingInfo';


/**
 * @component ProjectSelection
 * @description 项目选择页面组件，用于显示所有可用项目，允许用户选择项目进行合并查看，
 * 上传Excel文件导入新项目，以及管理项目备注信息
 */

const ProjectSelection: React.FC = () => {
  // 所有可用项目名称列表
  const [, setProjectNames] = useState<string[]>([]);
  // 项目详细信息，以文件ID为键
  const [projectDetails, setProjectDetails] = useState<Record<string, Project>>({});
  // 用户选中的项目文件ID列表（主要选择状态）
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
  // 项目备注信息，以文件ID为键
  const [projectNotes, setProjectNotes] = useState<Record<string, string>>({});
  // 当前正在编辑的项目备注
  const [editingNote, setEditingNote] = useState<{fileId: string, note: string} | null>(null);
  // 备注保存状态
  const [savingNote, setSavingNote] = useState<boolean>(false);
  // 删除项目状态
  const [deleting, setDeleting] = useState<boolean>(false);
  // 确认删除对话框状态
  const [confirmDelete, setConfirmDelete] = useState<{isOpen: boolean, fileId: string, projectName: string}>({isOpen: false, fileId: '', projectName: ''});
  // 上传文件列表
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  // 上传文件加载状态
  const [loadingFiles] = useState<boolean>(false);
  // 当前选中查看的文件ID
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  // 文件映射信息显示状态
  const [showFileMappings, setShowFileMappings] = useState<boolean>(false);
  // 当前正在编辑的项目名称
  const [editingProjectName, setEditingProjectName] = useState<{oldName: string, newName: string, fileId: string} | null>(null);
  // 项目名称保存状态
  const [savingProjectName, setSavingProjectName] = useState<boolean>(false);
  // 分页状态
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage] = useState<number>(10); // 每页显示10条记录
  // 分类相关状态
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [loadingCategories, setLoadingCategories] = useState<boolean>(false);


  // 路由导航hook
  const navigate = useNavigate();

  // 认证相关状态
  const { isAdmin } = useAuth();
  const [hasPermission, setHasPermission] = useState<Record<string, boolean>>({});

  /**
   * @effect 组件挂载时获取项目列表、项目详细信息和项目备注
   * @description 在组件挂载后，根据用户权限获取可访问的项目信息
   */
  useEffect(() => {
    const fetchProjectData = async () => {
      try {
        setLoading(true);
        setLoadingCategories(true);
        
        // 获取用户有权限的分类
        const categoriesData = await getUserCategories();
        setCategories(categoriesData);
        
        // 如果有分类且当前没有选中分类，自动选中第一个分类
        if (categoriesData.length > 0 && selectedCategoryId === null) {
          setSelectedCategoryId(categoriesData[0].id.toString());
        }
        
        let projects: Project[] = [];
        let names: string[] = [];
        
        if (isAdmin()) {
          // 管理员可以访问所有项目
          names = await getProjectNames();
          projects = await getAllProjects();
        } else {
          // 普通用户只能访问有权限的项目
          projects = await getUserProjects();
          names = projects.map(project => project.project_name);
        }
        
        setProjectNames(names);
        
        const detailsObj: Record<string, Project> = {};
        
        // 将项目详细信息按文件ID组织成对象
        projects.forEach(project => {
          if (project.file_unique_id) {
            detailsObj[project.file_unique_id] = project;
          }
        });
        
        setProjectDetails(detailsObj);
        setError(null);
        
        // 获取上传文件列表
        const files = await getUploadedFiles();
        setUploadedFiles(files);
        
        // 获取所有项目的备注，以文件ID为键
        const notesObj: Record<string, string> = {};
        for (const file of files) {
          try {
            const note = await getProjectNote(file.project_name);
            notesObj[file.file_unique_id] = note.note || '';
          } catch (err) {
            console.error(`获取项目 ${file.project_name} 的备注失败:`, err);
            notesObj[file.file_unique_id] = '';
          }
        }
        setProjectNotes(notesObj);
        
        // 检查删除权限（仅对非管理员用户）
        if (!isAdmin()) {
          const permissionsObj: Record<string, boolean> = {};
          for (const file of files) {
            try {
              // 检查分类的编辑权限（用于删除操作）
              if (file.category_id) {
                const result = await checkPermission({
                  resource_type: 'category',
                  resource_id: file.category_id.toString(),
                  permission: 'edit'
                });
                permissionsObj[`delete_${file.file_unique_id}`] = result.has_permission;
              } else {
                // 没有分类的文件默认无删除权限
                permissionsObj[`delete_${file.file_unique_id}`] = false;
              }
            } catch (err) {
              console.error(`检查项目 ${file.project_name} 删除权限失败:`, err);
              permissionsObj[`delete_${file.file_unique_id}`] = false;
            }
          }
          setHasPermission(permissionsObj);
        }

      } catch (err) {
        setError('获取项目列表失败，请稍后重试');
        console.error('Error fetching project data:', err);
      } finally {
        setLoading(false);
        setLoadingCategories(false);
      }
    };

    fetchProjectData();
  }, [isAdmin, selectedCategoryId]);

  /**
   * @function handleProjectToggle
   * @description 切换项目选中状态，基于文件ID进行操作
   * @param {string} fileId - 要切换状态的文件ID
   */
  const handleProjectToggle = (fileId: string) => {
    setSelectedFileIds(prev => {
      if (prev.includes(fileId)) {
        return prev.filter(id => id !== fileId);
      } else {
        return [...prev, fileId];
      }
    });
  };

  /**
   * @function handleMergeClick
   * @description 处理合并按钮点击事件，基于选中的文件ID列表导航到合并页面
   * @throws {Error} 如果没有选中任何项目，显示错误信息
   */
  const handleMergeClick = () => {
    if (selectedFileIds.length === 0) {
      setError('请至少选择一个项目');
      return;
    }
    
    // 根据选中的文件ID获取对应的项目名称
    const selectedProjects = selectedFileIds.map(fileId => {
      const project = projectDetails[fileId];
      return project ? project.project_name : '';
    }).filter(name => name !== '');
    
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

    // 普通用户必须选择分类才能上传文件
    if (!isAdmin() && !selectedCategoryId) {
      setError('请先选择一个分类再上传文件');
      return;
    }

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
      
      // 使用当前选中的分类ID
      const categoryId = selectedCategoryId;
      
      // 添加日志记录分类ID的选择和传递
      console.log('前端上传文件 - 分类信息:', {
        selectedCategoryId,
        finalCategoryId: categoryId,
        parsedCategoryId: categoryId ? parseInt(categoryId as string) : undefined,
        filesCount: filesArray.length,
        fileNames: filesArray.map(f => f.name)
      });
      
      // 调用API上传Excel文件，传入分类ID
      const result = await uploadPartsExcel(filesArray, undefined, categoryId ? parseInt(categoryId as string) : undefined);
      
      // 设置上传结果状态
      setUploadSuccess({
        status: result.status,
        rows: result.rows_imported,
        details: result.details
      });
      
      // 上传成功后重新获取项目列表
      let projects: Project[] = [];
      let names: string[] = [];
      
      if (isAdmin()) {
        // 管理员可以访问所有项目
        names = await getProjectNames();
        projects = await getAllProjects();
      } else {
        // 普通用户只能访问有权限的项目
        projects = await getUserProjects();
        names = projects.map(project => project.project_name);
      }
      
      setProjectNames(names);
      
      const detailsObj: Record<string, Project> = {};
      
      // 将项目详细信息按文件ID组织成对象
      projects.forEach(project => {
        if (project.file_unique_id) {
          detailsObj[project.file_unique_id] = project;
        }
      });
      
      setProjectDetails(detailsObj);
      
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
   * @param {string} fileId - 要编辑备注的文件ID
   */
  const handleEditNote = (fileId: string) => {
    setEditingNote({
      fileId: fileId,
      note: projectNotes[fileId] || ''
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
      
      // 根据文件ID获取项目信息
      const project = projectDetails[editingNote.fileId];
      if (!project) {
        setError('找不到对应的项目信息');
        return;
      }
      
      // 调用API保存项目备注
      const result = await saveProjectNote({
        project_name: project.project_name,
        file_unique_id: editingNote.fileId,
        note: editingNote.note
      });
      
      // 更新本地备注状态
      setProjectNotes(prev => ({
        ...prev,
        [editingNote.fileId]: result.note
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
   * @param {string} fileId - 要删除的文件ID
   * @param {string} projectName - 要删除的项目名称
   * @param {React.MouseEvent} e - 点击事件对象
   */
  const handleShowDeleteConfirm = async (fileId: string, projectName: string, e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止事件冒泡，避免触发项目选择
    
    // 检查删除权限
     if (!isAdmin()) {
       try {
         // 找到对应的文件信息以获取分类ID
          const file = uploadedFiles.find((f: UploadedFile) => f.file_unique_id === fileId);
         if (file && file.category_id) {
           const result = await checkPermission({
             resource_type: 'category',
             resource_id: file.category_id.toString(),
             permission: 'edit'
           });
           if (!result.has_permission) {
             setError('您没有权限删除此项目');
             return;
           }
         } else {
           setError('无法确定项目分类，无法删除');
           return;
         }
       } catch (err) {
         setError('检查权限失败，请稍后重试');
         return;
       }
     }
    
    setConfirmDelete({isOpen: true, fileId, projectName});
  };

  /**
   * @function handleCancelDelete
   * @description 取消删除操作
   */
  const handleCancelDelete = () => {
    setConfirmDelete({isOpen: false, fileId: '', projectName: ''});
  };

  /**
   * @function handleConfirmDelete
   * @description 确认删除项目
   * @async
   */
  const handleConfirmDelete = async () => {
    try {
      setDeleting(true);
      await deleteProjectByFileId(confirmDelete.fileId);
      
      // 更新项目列表
      setProjectNames(prev => prev.filter(name => name !== confirmDelete.projectName));
      
      // 如果该文件ID在已选择列表中，也需要移除
      setSelectedFileIds(prev => prev.filter(id => id !== confirmDelete.fileId));
      
      // 更新上传文件列表
      setUploadedFiles(prev => prev.filter(file => file.file_unique_id !== confirmDelete.fileId));
      
      // 移除项目详细信息和备注
      setProjectDetails(prev => {
        const newDetails = {...prev};
        delete newDetails[confirmDelete.fileId];
        return newDetails;
      });
      
      setProjectNotes(prev => {
        const newNotes = {...prev};
        delete newNotes[confirmDelete.fileId];
        return newNotes;
      });
      
      // 关闭确认对话框
      setConfirmDelete({isOpen: false, fileId: '', projectName: ''});
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
   * @description 关闭文件映射信息对话框
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
   * @function handleEditProjectName
   * @description 开始编辑指定项目的名称
   * @param {string} projectName - 要编辑名称的项目名称
   * @param {string} fileUniqueId - 项目对应的文件唯一ID
   * @param {React.MouseEvent} e - 点击事件对象
   */
  const handleEditProjectName = (projectName: string, fileUniqueId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止事件冒泡，避免触发项目选择
    setEditingProjectName({
      oldName: projectName,
      newName: projectName,
      fileId: fileUniqueId
    });
  };
  
  /**
   * @function handleSaveProjectName
   * @description 保存当前正在编辑的项目名称
   * @async
   */
  const handleSaveProjectName = async () => {
    if (!editingProjectName) return;
    
    try {
      setSavingProjectName(true);
      setError(null);
      
      // 调用API更新项目名称
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const result = await updateProjectName(editingProjectName.fileId, editingProjectName.newName);
      
      // 重新获取最新的项目名称列表和项目详细信息
      const names = await getProjectNames();
      setProjectNames(names);
      
      const projects = await getAllProjects();
      const detailsObj: Record<string, Project> = {};
      
      // 将项目详细信息按文件ID组织成对象
      projects.forEach(project => {
        if (project.file_unique_id) {
          detailsObj[project.file_unique_id] = project;
        }
      });
      
      setProjectDetails(detailsObj);
      
      // 重新获取上传文件列表
      const files = await getUploadedFiles();
      setUploadedFiles(files);
      
      // 重新获取项目备注（以文件ID为键，项目名称更新不影响备注）
      const notesObj: Record<string, string> = {};
      for (const file of files) {
        try {
          const note = await getProjectNote(file.project_name);
          notesObj[file.file_unique_id] = note.note || '';
        } catch (err) {
          console.error(`获取项目 ${file.project_name} 的备注失败:`, err);
          notesObj[file.file_unique_id] = '';
        }
      }
      setProjectNotes(notesObj);
      
      // 关闭编辑模式
      setEditingProjectName(null);
    } catch (err) {
      console.error('更新项目名称失败:', err);
      setError('更新项目名称失败，请稍后重试');
    } finally {
      setSavingProjectName(false);
    }
  };
  
  /**
   * @function handleCancelEditProjectName
   * @description 取消编辑项目名称，不保存更改
   */
  const handleCancelEditProjectName = () => {
    setEditingProjectName(null);
  };

  /**
   * @function getPaginatedFiles
   * @description 获取当前页的文件列表
   * @returns {UploadedFile[]} 当前页的文件列表
   */
  const getPaginatedFiles = (): UploadedFile[] => {
    const filteredFiles = getFilteredFiles();
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredFiles.slice(startIndex, endIndex);
  };

  /**
   * @function getFilteredFiles
   * @description 根据选中的分类过滤文件
   * @returns {UploadedFile[]} 过滤后的文件列表
   */
  const getFilteredFiles = () => {
    if (!selectedCategoryId) {
      // 管理员没有选中分类时显示所有文件
      if (isAdmin()) {
        return uploadedFiles;
      }
      // 普通用户没有选中分类时不显示任何文件（避免显示无权限的文件）
      return [];
    }
    return uploadedFiles.filter(file => file.category_id === parseInt(selectedCategoryId));
  };

  /**
   * @function getTotalPages
   * @description 计算总页数
   * @returns {number} 总页数
   */
  const getTotalPages = () => {
    const filteredFiles = getFilteredFiles();
    return Math.ceil(filteredFiles.length / itemsPerPage);
  };

  /**
   * @function handlePageChange
   * @description 处理页码变更
   * @param {number} page - 目标页码
   */
  const handlePageChange = (page: number) => {
    const totalPages = getTotalPages();
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  /**
   * @function handlePrevPage
   * @description 处理上一页
   */
  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  /**
   * @function handleNextPage
   * @description 处理下一页
   */
  const handleNextPage = () => {
    const totalPages = getTotalPages();
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  /**
   * @returns {JSX.Element} 渲染项目选择页面的UI组件
   */
  return (
    <div className="flex h-screen bg-gray-50">
      {/* 左侧分类导航栏 */}
      <div className="w-64 bg-white shadow-lg border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">项目分类</h2>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {loadingCategories ? (
            <div className="flex justify-center items-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-blue-500"></div>
              <span className="ml-2 text-sm text-gray-600">加载分类中...</span>
            </div>
          ) : (
            <div className="p-2">
              {/* 分类列表 */}
              {categories.map(category => {
                const categoryFileCount = uploadedFiles.filter(file => file.category_id === category.id).length;
                return (
                  <button
                    key={category.id}
                    onClick={() => {
                      setSelectedCategoryId(category.id.toString());
                      setCurrentPage(1);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-md mb-1 transition-colors duration-200 ${
                      selectedCategoryId === category.id.toString()
                        ? 'bg-blue-100 text-blue-700 border border-blue-300'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <div className="flex items-center">
                      <div 
                        className="w-3 h-3 rounded-full mr-2" 
                        style={{ backgroundColor: category.color || '#6B7280' }}
                      ></div>
                      <span className="font-medium truncate">{category.name}</span>
                      <span className="ml-auto text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded-full">
                        {categoryFileCount}
                      </span>
                    </div>
                    {category.description && (
                      <div className="text-xs text-gray-500 mt-1 ml-5 truncate">
                        {category.description}
                      </div>
                    )}
                  </button>
                );
              })}
              
              {categories.length === 0 && !loadingCategories && (
                <div className="text-center py-8 text-gray-500">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <div className="text-sm">暂无分类</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* 右侧主要内容区域 */}
       <div className="flex-1 flex flex-col overflow-hidden">
         <div className="bg-white border-b border-gray-200 p-6">
           {/* 页面标题和操作按钮区域 */}
           <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-bold text-blue-700 mb-2">零部件库管理系统</h1>
          <h2 className="text-xl text-gray-600 border-b pb-2">选择项目进行合并查看</h2>
        </div>
        
        {/* 已选项目显示区域 */}
        <div className="flex-1 mx-8">
          {selectedFileIds.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center mb-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600 mr-2" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                </svg>
                <span className="text-sm font-medium text-blue-700">已选择 {selectedFileIds.length} 个项目：</span>
              </div>
              <div className="max-h-32 overflow-y-auto">
                <div className="space-y-1">
                  {selectedFileIds.map(fileId => {
                    const file = uploadedFiles.find(f => f.file_unique_id === fileId);
                    return file ? (
                      <div key={fileId} className="flex items-center justify-between bg-white rounded px-3 py-2 text-sm">
                        <span className="text-gray-700 font-medium">{file.project_name}</span>
                        <button
                          onClick={() => handleProjectToggle(fileId)}
                          className="text-red-500 hover:text-red-700 ml-2"
                          title="移除选择"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    ) : null;
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* 操作按钮区域：合并项目和上传Excel文件 */}
        <div className="flex items-center space-x-4">
          {/* 合并选中项目按钮 */}
          <button
            onClick={handleMergeClick}
            disabled={selectedFileIds.length === 0}
            className={`px-6 py-3 rounded-lg shadow-md font-medium text-lg flex items-center transition-all duration-200 ${selectedFileIds.length === 0 ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-lg'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            合并选中项目
          </button>
          {/* 上传Excel文件区域 - 所有用户可见 */}
          <button
            onClick={handleUploadClick}
            disabled={uploading || (!isAdmin() && !selectedCategoryId)}
            className={`px-6 py-3 rounded-lg shadow-md font-semibold text-lg flex items-center transition-all duration-200 ${
              uploading || (!isAdmin() && !selectedCategoryId)
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                : 'bg-green-600 text-white hover:bg-green-700 hover:shadow-lg'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
            {uploading ? '上传中...' : selectedCategoryId ? `上传到 ${categories.find(c => c.id.toString() === selectedCategoryId)?.name || '当前分类'}` : isAdmin() ? '上传Excel文件（可多选）' : '请先选择分类'}
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
      
          </div>
          
          {/* 主要内容滚动区域 */}
          <div className="flex-1 overflow-y-auto p-6">
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
            {getFilteredFiles().length === 0 ? (
              /* 无项目时显示空状态提示 */
              <div className="flex flex-col items-center justify-center py-16 bg-gray-50 rounded-lg border border-gray-200">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-gray-500 text-xl font-medium">
                  {!isAdmin() && categories.length === 0 ? '您暂无分类权限' : 
                   uploadedFiles.length === 0 ? '没有可用的项目' : 
                   '该分类下没有项目'}
                </div>
                <div className="text-gray-400 mt-2">
                  {!isAdmin() && categories.length === 0 
                    ? '请联系管理员为您分配分类权限' 
                    : uploadedFiles.length === 0 
                      ? isAdmin() ? '请点击右上角的"上传Excel文件"按钮上传项目数据' : '请联系管理员上传项目数据或为您分配权限'
                      : selectedCategoryId ? '请选择其他分类或上传新项目到此分类' : '请选择分类查看项目'
                  }
                </div>
                {uploadedFiles.length === 0 && isAdmin() && (
                  <button
                    onClick={handleUploadClick}
                    className="mt-6 px-6 py-2 bg-green-600 text-white rounded-lg shadow-md hover:bg-green-700 transition-colors duration-200 flex items-center font-medium"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                    上传Excel文件
                  </button>
                )}
              </div>
            ) : (
              /* 有项目时显示项目卡片网格 */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* 遍历筛选后的文件，为每个文件创建卡片 */}
                {getFilteredFiles().map(file => (
                  <div 
                    key={file.file_unique_id}
                    className={`border p-5 rounded-lg shadow-md transition-all duration-200 hover:shadow-lg ${selectedFileIds.includes(file.file_unique_id) ? 'bg-blue-50 border-blue-500' : 'hover:border-gray-300'}`}
                  >
                    <div className="cursor-pointer" onClick={() => handleProjectToggle(file.file_unique_id)}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <div className={`w-5 h-5 rounded mr-3 flex items-center justify-center border ${selectedFileIds.includes(file.file_unique_id) ? 'bg-blue-500 border-blue-500' : 'border-gray-400'}`}>
                            {selectedFileIds.includes(file.file_unique_id) && (
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            )}
                          </div>
                          {/* 编辑项目名称模式 */}
                          {editingProjectName && editingProjectName.fileId === file.file_unique_id ? (
                            <div className="flex-1" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="text"
                                className="w-full p-1 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={editingProjectName.newName}
                                onChange={(e) => setEditingProjectName({...editingProjectName, newName: e.target.value})}
                                autoFocus
                                disabled={savingProjectName}
                              />
                            </div>
                          ) : (
                            <span className="text-lg font-medium">{file.project_name}</span>
                          )}
                        </div>
                        <div className="flex items-center space-x-1">
                          {/* 编辑项目名称模式下的保存和取消按钮 */}
                          {editingProjectName && editingProjectName.fileId === file.file_unique_id ? (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCancelEditProjectName();
                                }}
                                disabled={savingProjectName}
                                className="p-1.5 text-gray-500 hover:bg-gray-100 rounded transition-colors"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSaveProjectName();
                                }}
                                disabled={savingProjectName || !editingProjectName.newName.trim() || editingProjectName.newName === editingProjectName.oldName}
                                className={`p-1.5 rounded transition-colors ${savingProjectName || !editingProjectName.newName.trim() || editingProjectName.newName === editingProjectName.oldName ? 'text-gray-400 cursor-not-allowed' : 'text-green-500 hover:bg-green-50'}`}
                              >
                                {savingProjectName ? (
                                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                ) : (
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </button>
                            </>
                          ) : (
                            <>
                              {/* 编辑名称按钮 */}
                              <button
                                onClick={(e) => handleEditProjectName(file.project_name, file.file_unique_id, e)}
                                className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-full transition-colors"
                                title="编辑项目名称"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              {/* 删除按钮 - 仅管理员或有删除权限的用户可见 */}
                              {(isAdmin() || hasPermission[`delete_${file.file_unique_id}`]) && (
                                <button
                                  onClick={(e) => handleShowDeleteConfirm(file.file_unique_id, file.project_name, e)}
                                  className="p-1.5 text-red-500 hover:bg-red-50 rounded-full transition-colors"
                                  disabled={deleting}
                                >
                                  {deleting && confirmDelete.fileId === file.file_unique_id ? (
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
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      {/* 文件ID显示 */}
                      <div className="ml-8 mt-1 text-xs text-gray-500 flex items-center">
                        <span>文件ID: {file.file_unique_id.substring(0, 8)}...</span>
                        <button 
                          onClick={(e) => handleViewFileMappings(file.file_unique_id, e)}
                          className="ml-2 text-blue-500 hover:text-blue-700 flex items-center"
                          title="查看文件映射信息"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </button>
                      </div>
                    </div>
                    
                    {/* 项目备注区域 - 显示或编辑项目备注 */}
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      {/* 编辑模式 - 当前项目正在编辑备注时显示 */}
                      {editingNote && editingNote.fileId === file.file_unique_id ? (
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
                            handleEditNote(file.file_unique_id);
                          }}
                        >
                          {projectNotes[file.file_unique_id] ? (
                            <div className="flex-1">
                              <div className="font-medium text-gray-700 mb-1">备注:</div>
                              <div className="whitespace-pre-wrap">{projectNotes[file.file_unique_id]}</div>
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
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">上传文件历史记录</h2>
              {uploadedFiles.length > 0 && (
                <div className="text-sm text-gray-500">
                  共 {uploadedFiles.length} 条记录，每页显示 {itemsPerPage} 条
                </div>
              )}
            </div>
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
              <div>
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
                      {getPaginatedFiles().map((file) => (
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
                
                {/* 分页控件 */}
                {getTotalPages() > 1 && (
                  <div className="flex items-center justify-between mt-4 px-4 py-3 bg-white border border-gray-200 rounded-lg">
                    <div className="flex items-center text-sm text-gray-700">
                      <span>
                        显示第 {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, uploadedFiles.length)} 条，
                        共 {uploadedFiles.length} 条记录
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      {/* 上一页按钮 */}
                      <button
                        onClick={handlePrevPage}
                        disabled={currentPage === 1}
                        className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                          currentPage === 1
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        上一页
                      </button>
                      
                      {/* 页码按钮 */}
                      <div className="flex items-center space-x-1">
                        {Array.from({ length: getTotalPages() }, (_, i) => i + 1).map((page) => {
                          // 只显示当前页附近的页码
                          const totalPages = getTotalPages();
                          if (
                            page === 1 ||
                            page === totalPages ||
                            (page >= currentPage - 2 && page <= currentPage + 2)
                          ) {
                            return (
                              <button
                                key={page}
                                onClick={() => handlePageChange(page)}
                                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                                  page === currentPage
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                                }`}
                              >
                                {page}
                              </button>
                            );
                          } else if (
                            (page === currentPage - 3 && currentPage > 4) ||
                            (page === currentPage + 3 && currentPage < totalPages - 3)
                          ) {
                            return (
                              <span key={page} className="px-2 py-1 text-gray-400">
                                ...
                              </span>
                            );
                          }
                          return null;
                        })}
                      </div>
                      
                      {/* 下一页按钮 */}
                      <button
                        onClick={handleNextPage}
                        disabled={currentPage === getTotalPages()}
                        className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                          currentPage === getTotalPages()
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        下一页
                      </button>
                      
                      {/* 页码跳转 */}
                      <div className="flex items-center ml-4">
                        <span className="text-sm text-gray-700 mr-2">跳转到</span>
                        <input
                          type="number"
                          min="1"
                          max={getTotalPages()}
                          className="w-16 px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              const page = parseInt((e.target as HTMLInputElement).value);
                              if (page >= 1 && page <= getTotalPages()) {
                                handlePageChange(page);
                                (e.target as HTMLInputElement).value = '';
                              }
                            }
                          }}
                          placeholder={currentPage.toString()}
                        />
                        <span className="text-sm text-gray-700 ml-2">页</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* 合并按钮已移至页面顶部 */}
        </div>
      )}
        </div>
      </div>

      {/* 确认删除对话框 */}
      <ConfirmDialog
        isOpen={!!confirmDelete.fileId}
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