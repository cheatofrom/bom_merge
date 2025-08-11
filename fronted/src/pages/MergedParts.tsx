import React, { useEffect, useState, useMemo } from 'react'; 
import { useLocation, useNavigate } from 'react-router-dom'; 
import { mergeParts, mergePartsByFileIds, updateParts, saveMergedProject } from '../services/api';
import { Part } from '../types';
import ConfirmDialog from '../components/ConfirmDialog';

// 定义冲突零件类型
interface ConflictInfo {
  partCode: string;
  conflictFields: string[];
}

const MergedParts: React.FC = () => {
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [projectNames, setProjectNames] = useState<string[]>([]);
  const [searchText, setSearchText] = useState<string>('');
  const [conflictParts, setConflictParts] = useState<Record<string, ConflictInfo>>({});
  
  // 分页状态
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(15);
  
  // 编辑模式状态
  const [editMode, setEditMode] = useState<boolean>(false);
  // 存储编辑过的数据
  const [editedParts, setEditedParts] = useState<Record<number, Partial<Part>>>({});
  // 保存状态
  const [saving, setSaving] = useState<boolean>(false);
  // 保存结果消息
  const [saveMessage, setSaveMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  // 保存合并项目状态
  const [savingMergedProject, setSavingMergedProject] = useState<boolean>(false);
  // 保存合并项目名称
  const [mergedProjectName, setMergedProjectName] = useState<string>('');
  // 显示保存合并项目对话框
  const [showSaveDialog, setShowSaveDialog] = useState<boolean>(false);
  const location = useLocation();
  const navigate = useNavigate();

  // 存储源文件ID列表
  const [sourceFileIds, setSourceFileIds] = useState<string[]>([]);
  
  useEffect(() => {
    const fetchMergedParts = async () => {
      try {
        setLoading(true);
        const searchParams = new URLSearchParams(location.search);
        const projectsParam = searchParams.get('projects');
        const fileIdsParam = searchParams.get('fileIds');

        if (!projectsParam || !fileIdsParam) {
          setError('未指定项目名称或文件ID');
          setParts([]);
          setProjectNames([]);
          return;
        }

        const selectedProjects = JSON.parse(decodeURIComponent(projectsParam)) as string[];
        const selectedFileIds = JSON.parse(decodeURIComponent(fileIdsParam)) as string[];
        setProjectNames(selectedProjects);
        setSourceFileIds(selectedFileIds);

        // 优先使用文件ID进行合并，如果失败则回退到使用项目名称
        let mergedParts;
        try {
          mergedParts = await mergePartsByFileIds(selectedFileIds);
        } catch (error) {
          console.error('通过文件ID合并失败，尝试使用项目名称合并:', error);
          mergedParts = await mergeParts(selectedProjects);
        }
        setParts(mergedParts);
        
        // 检测零件号相同但其他字段不一致的情况
        const conflicts: Record<string, ConflictInfo> = {};
        const partCodeMap: Record<string, Part[]> = {};
        
        // 按零件号分组
        mergedParts.forEach(part => {
          if (part.part_code) {
            if (!partCodeMap[part.part_code]) {
              partCodeMap[part.part_code] = [];
            }
            partCodeMap[part.part_code].push(part);
          }
        });
        
        // 检查每组中是否有冲突
        Object.entries(partCodeMap).forEach(([partCode, partsGroup]) => {
          if (partsGroup.length > 1) {
            // 检查除了project_name, upload_batch, id, created_at外的其他字段是否有不一致
            const conflictFields: string[] = [];
            
            // 需要比较的字段列表
            const fieldsToCompare = [
              'level', 'part_name', 'spec', 'version', 'material',
              'unit_count_per_level', 'unit_weight_kg', 'total_weight_kg',
              'part_property', 'drawing_size', 'reference_number',
              'purchase_status', 'process_route', 'remark'
            ];
            
            // 检查每个字段是否有不一致
            fieldsToCompare.forEach(field => {
              // 获取该字段的所有不同值
              const uniqueValues = new Set<string>();
              
              partsGroup.forEach(part => {
                // 对于level字段，确保进行数值比较
                if (field === 'level') {
                  // 将level转换为整数进行比较
                  const numValue = parseInt(String(part[field as keyof Part] || '0'), 10);
                  uniqueValues.add(String(numValue));
                } else {
                  const value = typeof part[field as keyof Part] === 'number'
                    ? String(part[field as keyof Part])
                    : String(part[field as keyof Part] || ''); // 处理null或undefined
                  uniqueValues.add(value);
                }
              });
              
              // 如果有多个不同的值，则标记为冲突
              if (uniqueValues.size > 1) {
                conflictFields.push(field);
              }
            });
            
            // 如果有冲突字段，记录下来
            if (conflictFields.length > 0) {
              conflicts[partCode] = {
                partCode,
                conflictFields
              };
            }
          }
        });
        
        setConflictParts(conflicts);
        setError(null);
      } catch (err) {
        setError('获取合并零部件失败，请稍后重试');
        setParts([]);
        console.error('Error fetching merged parts:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchMergedParts();
  }, [location.search]);

  // 搜索过滤，针对零件名称、零件代号和其他字段
  const filteredParts = useMemo(() => {
    if (!searchText.trim()) return parts;
    const searchLower = searchText.trim().toLowerCase();
    return parts.filter(part =>
      // 搜索零件名称
      (part.part_name && part.part_name.toLowerCase().includes(searchLower)) ||
      // 搜索零件代号
      (part.part_code && part.part_code.toLowerCase().includes(searchLower)) ||
      // 搜索规格
      (part.spec && part.spec.toLowerCase().includes(searchLower)) ||
      // 搜索材料
      (part.material && part.material.toLowerCase().includes(searchLower)) ||
      // 搜索备注
      (part.remark && part.remark.toLowerCase().includes(searchLower))
    );
  }, [parts, searchText]);
  
  // 计算总页数
  const totalPages = useMemo(() => {
    return Math.ceil(filteredParts.length / itemsPerPage);
  }, [filteredParts, itemsPerPage]);
  
  // 获取当前页的数据
  const currentPageData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredParts.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredParts, currentPage, itemsPerPage]);
  
  // 页码变化处理函数
  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };
  
  // 每页显示数量变化处理函数
  const handleItemsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setItemsPerPage(Number(e.target.value));
    setCurrentPage(1); // 重置到第一页
  };

  const handleBackClick = () => {
    navigate('/');
  };
  
  // 处理单元格值变更
  const handleCellChange = (partId: number, field: keyof Part, value: any) => {
    setEditedParts(prev => ({
      ...prev,
      [partId]: {
        ...(prev[partId] || {}),
        [field]: value
      }
    }));
  };
  
  // 处理保存更改
  const handleSaveChanges = async () => {
    try {
      setSaving(true);
      setSaveMessage(null);
      
      // 准备要更新的数据
      const partsToUpdate = Object.entries(editedParts).map(([partId, changes]) => ({
        id: parseInt(partId),
        ...changes
      }));
      
      // 调用API更新数据
      const result = await updateParts(partsToUpdate);
      
      // 更新本地数据
      setParts(prevParts => 
        prevParts.map(part => {
          const changes = editedParts[part.id];
          if (changes) {
            return { ...part, ...changes };
          }
          return part;
        })
      );
      
      // 清空编辑状态
      setEditedParts({});
      setSaveMessage({
        type: 'success',
        text: `成功更新 ${result.updated_count} 个零部件`
      });
      
      // 重新检查冲突
      checkForConflicts(parts.map(part => {
        const changes = editedParts[part.id];
        if (changes) {
          return { ...part, ...changes };
        }
        return part;
      }));
      
    } catch (err) {
      console.error('保存更改失败:', err);
      setSaveMessage({
        type: 'error',
        text: '保存更改失败，请稍后重试'
      });
    } finally {
      setSaving(false);
    }
  };
  
  // 检查零件冲突
  const checkForConflicts = (partsData: Part[]) => {
    const conflicts: Record<string, ConflictInfo> = {};
    const partCodeMap: Record<string, Part[]> = {};
    
    // 按零件号分组
    partsData.forEach(part => {
      if (part.part_code) {
        if (!partCodeMap[part.part_code]) {
          partCodeMap[part.part_code] = [];
        }
        partCodeMap[part.part_code].push(part);
      }
    });
    
    // 检查每组中是否有冲突
    Object.entries(partCodeMap).forEach(([partCode, partsGroup]) => {
      if (partsGroup.length > 1) {
        // 检查除了project_name, upload_batch, id, created_at外的其他字段是否有不一致
        const conflictFields: string[] = [];
        
        // 需要比较的字段列表
        const fieldsToCompare = [
          'level', 'part_name', 'spec', 'version', 'material',
          'unit_count_per_level', 'unit_weight_kg', 'total_weight_kg',
          'part_property', 'drawing_size', 'reference_number',
          'purchase_status', 'process_route', 'remark'
        ];
        
        // 检查每个字段是否有不一致
        fieldsToCompare.forEach(field => {
          // 获取该字段的所有不同值
          const uniqueValues = new Set<string>();
          
          partsGroup.forEach(part => {
            // 对于level字段，确保进行数值比较
            if (field === 'level') {
              // 将level转换为整数进行比较
              const numValue = parseInt(String(part[field as keyof Part] || '0'), 10);
              uniqueValues.add(String(numValue));
            } else {
              const value = typeof part[field as keyof Part] === 'number'
                ? String(part[field as keyof Part])
                : String(part[field as keyof Part] || ''); // 处理null或undefined
              uniqueValues.add(value);
            }
          });
          
          // 如果有多个不同的值，则标记为冲突
          if (uniqueValues.size > 1) {
            conflictFields.push(field);
          }
        });
        
        // 如果有冲突字段，记录下来
        if (conflictFields.length > 0) {
          conflicts[partCode] = {
            partCode,
            conflictFields
          };
        }
      }
    });
    
    setConflictParts(conflicts);
  };

  // 处理保存合并项目
  const handleSaveMergedProject = async () => {
    if (!mergedProjectName.trim()) {
      setSaveMessage({
        type: 'error',
        text: '请输入合并项目名称'
      });
      return;
    }

    try {
      setSavingMergedProject(true);
      setSaveMessage(null);
      
      const result = await saveMergedProject(mergedProjectName, projectNames, parts, sourceFileIds);
      
      if (result.status === 'success') {
        setSaveMessage({
          type: 'success',
          text: `成功保存合并项目 "${mergedProjectName}", 项目ID: ${result.merged_project_id}`
        });
        // 关闭对话框
        setShowSaveDialog(false);
        // 清空项目名称
        setMergedProjectName('');
      } else {
        setSaveMessage({
          type: 'error',
          text: result.message || '保存合并项目失败'
        });
      }
    } catch (err: unknown) {
      console.error('保存合并项目失败:', err);
      setSaveMessage({
        type: 'error',
        text: (err as Error)?.message || '保存合并项目失败，请稍后重试'
      });
    } finally {
      setSavingMergedProject(false);
    }
  };

  return (
    <div className="w-full min-h-screen bg-gray-50 px-4 sm:px-6 lg:px-8 py-6">
      {/* 保存合并项目对话框 */}
      <ConfirmDialog
        isOpen={showSaveDialog}
        title="保存为合并项目"
        message={
          <div className="mt-2">
            <p className="text-sm text-gray-500 mb-4">
              请输入合并项目名称，系统将保存当前合并结果为新的合并项目。
            </p>
            <div className="mt-2">
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="请输入合并项目名称"
                value={mergedProjectName}
                onChange={(e) => setMergedProjectName(e.target.value)}
              />
            </div>
          </div>
        }
        confirmText={savingMergedProject ? "保存中..." : "保存"}
        cancelText="取消"
        onConfirm={handleSaveMergedProject}
        onCancel={() => {
          setShowSaveDialog(false);
          setMergedProjectName('');
        }}
      />
      
      {/* 取消最大宽度限制，父容器铺满全屏 */}
      <div className="mx-0">
        <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
          <h1 className="text-3xl font-bold text-blue-700">合并零部件列表</h1>
          <div className="flex gap-3">
            {/* 编辑模式切换按钮 */}
            <button
              onClick={() => setEditMode(!editMode)}
              className={`px-5 py-2 rounded-lg transition-colors duration-200 shadow-md flex items-center whitespace-nowrap ${
                editMode ? 'bg-yellow-500 hover:bg-yellow-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-10 10a2 2 0 01-1.414.586H4a1 1 0 01-1-1v-1a2 2 0 01.586-1.414l10-10z" />
              </svg>
              {editMode ? '退出编辑模式' : '进入编辑模式'}
            </button>
            
            {/* 保存按钮 */}
            {editMode && (
              <button
                onClick={handleSaveChanges}
                disabled={saving || Object.keys(editedParts).length === 0}
                className={`px-5 py-2 rounded-lg transition-colors duration-200 shadow-md flex items-center whitespace-nowrap ${
                  saving || Object.keys(editedParts).length === 0
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
              >
                {saving ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    保存中...
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    保存更改 ({Object.keys(editedParts).length})
                  </>
                )}
              </button>
            )}
            
            {/* 保存为合并项目按钮 */}
            <button
              onClick={() => setShowSaveDialog(true)}
              disabled={parts.length === 0 || savingMergedProject}
              className={`px-5 py-2 rounded-lg transition-colors duration-200 shadow-md flex items-center whitespace-nowrap ${
                parts.length === 0 || savingMergedProject
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-purple-600 hover:bg-purple-700 text-white'
              }`}
            >
              {savingMergedProject ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  保存中...
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M7.707 10.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V6h5a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2h5v5.586l-1.293-1.293zM9 4a1 1 0 012 0v2H9V4z" />
                  </svg>
                  保存为合并项目
                </>
              )}
            </button>
            
            {/* 返回按钮 */}
            <button
              onClick={handleBackClick}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 shadow-md flex items-center whitespace-nowrap"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
              </svg>
              返回项目选择
            </button>
          </div>
        </div>
        
        {/* 保存结果消息 */}
        {saveMessage && (
          <div className={`mb-6 p-4 rounded-lg shadow-md border-l-4 ${
            saveMessage.type === 'success' 
              ? 'bg-green-50 border-green-500 text-green-700' 
              : 'bg-red-50 border-red-500 text-red-700'
          }`}>
            <div className="flex items-center">
              {saveMessage.type === 'success' ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-3 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-3 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              <span className="font-medium">{saveMessage.text}</span>
            </div>
          </div>
        )}

        {/* 冲突提示 */}
        {Object.keys(conflictParts).length > 0 && (
          <div className="mb-6 bg-red-50 p-4 rounded-lg shadow-md border-l-4 border-red-500">
            <h2 className="text-xl font-semibold text-red-700 mb-2">检测到零件冲突</h2>
            <p className="text-red-600">
              系统检测到<strong>{Object.keys(conflictParts).length}</strong>个零件号在不同项目中存在信息不一致的情况。
              这些零件已在表格中用红色背景标记，冲突的字段用红色文字标记。
            </p>
          </div>
        )}

        {/* 已选项目 */}
        {projectNames.length > 0 && (
          <div className="mb-6 bg-white p-4 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold text-gray-700 mb-3 border-b pb-2">已选项目</h2>
            <div className="flex flex-wrap gap-3 mt-2">
              {projectNames.map(name => (
                <span key={name} className="bg-blue-100 text-blue-800 px-4 py-2 rounded-lg shadow-sm font-medium flex items-center whitespace-nowrap">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  {name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 搜索框 */}
        <div className="mb-4 max-w-md">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="搜索零件名称、代号、规格、材料或备注..."
              className="w-full pl-10 pr-10 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
            {searchText && (
              <div 
                className="absolute inset-y-0 right-0 pr-3 flex items-center cursor-pointer text-gray-400 hover:text-gray-600"
                onClick={() => setSearchText('')}
                title="清空搜索"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
            )}
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded-md shadow-md mb-6 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-3 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-medium">{error}</span>
          </div>
        )}

        {/* 加载状态 */}
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            <span className="ml-3 text-lg text-gray-600">正在加载零部件数据...</span>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border shadow-md bg-white">
            {/* 数据为空时提示 */}
            {filteredParts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 bg-gray-50 rounded-lg border border-gray-200">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-gray-500 text-xl font-medium">没有找到零部件数据</div>
                <div className="text-gray-400 mt-2">请确认所选项目中包含零部件信息或搜索关键字</div>
              </div>
            ) : (
              <table className="min-w-[1200px] w-full table-auto border-collapse text-sm text-gray-800">
                <thead>
                  <tr className="bg-blue-50">
                    {[
                      '层级', '零件代号', '零件名称', '规格', '版本号', '材料',
                      '单层级用量', '单重(kg)', '总重(kg)', '零件属性', '图幅',
                      '参考号', '采购状态', '工艺路线', '备注', '项目名称'
                    ].map((header, idx) => (
                      <th
                        key={idx}
                        className="border border-gray-300 px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase whitespace-nowrap"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {currentPageData.map((part, index) => {
                    // 检查当前零件是否有冲突
                    const hasConflict = part.part_code && conflictParts.hasOwnProperty(part.part_code);
                    const conflictInfo = hasConflict ? conflictParts[part.part_code] : null;
                    
                    console.log(`零件 ${part.part_code}:`, {
                      hasConflict,
                      inConflictParts: part.part_code in conflictParts,
                      conflictInfo,
                      rowIndex: index,
                      rowClass: hasConflict ? 'bg-red-100' : (index % 2 === 0 ? 'bg-white' : 'bg-gray-100')
                    });
                    
                    // 行样式：如果有冲突，使用更明显的红色背景；否则使用灰白相间的斑马纹
                    const rowClassName = hasConflict 
                      ? "hover:bg-red-200 bg-red-100 !bg-red-100 transition-colors duration-150" 
                      : index % 2 === 0 
                        ? "hover:bg-gray-50 bg-white transition-colors duration-150" 
                        : "hover:bg-gray-50 bg-gray-100 transition-colors duration-150";
                    

                    
                    return (
                      <tr 
                        key={`${part.id}-${index}`} 
                        className={rowClassName}
                        style={hasConflict ? { backgroundColor: '#fee2e2' } : undefined}
                      >
                        {/* 层级 */}
                        <td className="border px-4 py-2 text-center whitespace-nowrap">
                          {editMode ? (
                            <input
                              type="text"
                              className="w-full px-2 py-1 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                              value={editedParts[part.id]?.level !== undefined ? editedParts[part.id].level : part.level}
                              onChange={(e) => handleCellChange(part.id, 'level', e.target.value)}
                            />
                          ) : (
                            <span className={hasConflict && conflictInfo?.conflictFields.includes('level') ? 'text-red-600 font-bold' : ''}>
                              {part.level}
                            </span>
                          )}
                        </td>
                        
                        {/* 零件代号 - 不可编辑 */}
                        <td className="border px-4 py-2 text-center whitespace-nowrap">{part.part_code}</td>
                        
                        {/* 零件名称 */}
                        <td className="border px-4 py-2 text-center whitespace-nowrap">
                          {editMode ? (
                            <input
                              type="text"
                              className="w-full px-2 py-1 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                              value={editedParts[part.id]?.part_name !== undefined ? editedParts[part.id].part_name : part.part_name}
                              onChange={(e) => handleCellChange(part.id, 'part_name', e.target.value)}
                            />
                          ) : (
                            <span className={hasConflict && conflictInfo?.conflictFields.includes('part_name') ? 'text-red-600 font-bold' : ''}>
                              {part.part_name}
                            </span>
                          )}
                        </td>
                        
                        {/* 规格 */}
                        <td className="border px-4 py-2 text-center whitespace-nowrap">
                          {editMode ? (
                            <input
                              type="text"
                              className="w-full px-2 py-1 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                              value={editedParts[part.id]?.spec !== undefined ? editedParts[part.id].spec : part.spec}
                              onChange={(e) => handleCellChange(part.id, 'spec', e.target.value)}
                            />
                          ) : (
                            <span className={hasConflict && conflictInfo?.conflictFields.includes('spec') ? 'text-red-600 font-bold' : ''}>
                              {part.spec}
                            </span>
                          )}
                        </td>
                        
                        {/* 版本号 */}
                        <td className="border px-4 py-2 text-center whitespace-nowrap">
                          {editMode ? (
                            <input
                              type="text"
                              className="w-full px-2 py-1 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                              value={editedParts[part.id]?.version !== undefined ? editedParts[part.id].version : part.version}
                              onChange={(e) => handleCellChange(part.id, 'version', e.target.value)}
                            />
                          ) : (
                            <span className={hasConflict && conflictInfo?.conflictFields.includes('version') ? 'text-red-600 font-bold' : ''}>
                              {part.version}
                            </span>
                          )}
                        </td>
                        
                        {/* 材料 */}
                        <td className="border px-4 py-2 text-center whitespace-nowrap">
                          {editMode ? (
                            <input
                              type="text"
                              className="w-full px-2 py-1 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                              value={editedParts[part.id]?.material !== undefined ? editedParts[part.id].material : part.material}
                              onChange={(e) => handleCellChange(part.id, 'material', e.target.value)}
                            />
                          ) : (
                            <span className={hasConflict && conflictInfo?.conflictFields.includes('material') ? 'text-red-600 font-bold' : ''}>
                              {part.material}
                            </span>
                          )}
                        </td>
                        
                        {/* 单层级用量 */}
                        <td className="border px-4 py-2 text-center whitespace-nowrap">
                          {editMode ? (
                            <input
                              type="text"
                              className="w-full px-2 py-1 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                              value={editedParts[part.id]?.unit_count_per_level !== undefined ? editedParts[part.id].unit_count_per_level : part.unit_count_per_level}
                              onChange={(e) => handleCellChange(part.id, 'unit_count_per_level', e.target.value)}
                            />
                          ) : (
                            <span className={hasConflict && conflictInfo?.conflictFields.includes('unit_count_per_level') ? 'text-red-600 font-bold' : ''}>
                              {part.unit_count_per_level}
                            </span>
                          )}
                        </td>
                        
                        {/* 单重(kg) */}
                        <td className="border px-4 py-2 text-center whitespace-nowrap">
                          {editMode ? (
                            <input
                              type="text"
                              className="w-full px-2 py-1 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                              value={editedParts[part.id]?.unit_weight_kg !== undefined ? editedParts[part.id].unit_weight_kg : part.unit_weight_kg}
                              onChange={(e) => handleCellChange(part.id, 'unit_weight_kg', e.target.value)}
                            />
                          ) : (
                            <span className={hasConflict && conflictInfo?.conflictFields.includes('unit_weight_kg') ? 'text-red-600 font-bold' : ''}>
                              {part.unit_weight_kg}
                            </span>
                          )}
                        </td>
                        
                        {/* 总重(kg) */}
                        <td className="border px-4 py-2 text-center whitespace-nowrap">
                          {editMode ? (
                            <input
                              type="number"
                              step="0.001"
                              className="w-full px-2 py-1 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                              value={editedParts[part.id]?.total_weight_kg !== undefined ? editedParts[part.id].total_weight_kg : part.total_weight_kg}
                              onChange={(e) => handleCellChange(part.id, 'total_weight_kg', parseFloat(e.target.value) || 0)}
                            />
                          ) : (
                            <span className={hasConflict && conflictInfo?.conflictFields.includes('total_weight_kg') ? 'text-red-600 font-bold' : ''}>
                              {part.total_weight_kg}
                            </span>
                          )}
                        </td>
                        
                        {/* 零件属性 */}
                        <td className="border px-4 py-2 text-center whitespace-nowrap">
                          {editMode ? (
                            <input
                              type="text"
                              className="w-full px-2 py-1 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                              value={editedParts[part.id]?.part_property !== undefined ? editedParts[part.id].part_property : part.part_property}
                              onChange={(e) => handleCellChange(part.id, 'part_property', e.target.value)}
                            />
                          ) : (
                            <span className={hasConflict && conflictInfo?.conflictFields.includes('part_property') ? 'text-red-600 font-bold' : ''}>
                              {part.part_property}
                            </span>
                          )}
                        </td>
                        
                        {/* 图幅 */}
                        <td className="border px-4 py-2 text-center whitespace-nowrap">
                          {editMode ? (
                            <input
                              type="text"
                              className="w-full px-2 py-1 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                              value={editedParts[part.id]?.drawing_size !== undefined ? editedParts[part.id].drawing_size : part.drawing_size}
                              onChange={(e) => handleCellChange(part.id, 'drawing_size', e.target.value)}
                            />
                          ) : (
                            <span className={hasConflict && conflictInfo?.conflictFields.includes('drawing_size') ? 'text-red-600 font-bold' : ''}>
                              {part.drawing_size}
                            </span>
                          )}
                        </td>
                        
                        {/* 参考号 */}
                        <td className="border px-4 py-2 text-center whitespace-nowrap">
                          {editMode ? (
                            <input
                              type="text"
                              className="w-full px-2 py-1 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                              value={editedParts[part.id]?.reference_number !== undefined ? editedParts[part.id].reference_number : part.reference_number}
                              onChange={(e) => handleCellChange(part.id, 'reference_number', e.target.value)}
                            />
                          ) : (
                            <span className={hasConflict && conflictInfo?.conflictFields.includes('reference_number') ? 'text-red-600 font-bold' : ''}>
                              {part.reference_number}
                            </span>
                          )}
                        </td>
                        
                        {/* 采购状态 */}
                        <td className="border px-4 py-2 text-center whitespace-nowrap">
                          {editMode ? (
                            <input
                              type="text"
                              className="w-full px-2 py-1 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                              value={editedParts[part.id]?.purchase_status !== undefined ? editedParts[part.id].purchase_status : part.purchase_status}
                              onChange={(e) => handleCellChange(part.id, 'purchase_status', e.target.value)}
                            />
                          ) : (
                            <span className={hasConflict && conflictInfo?.conflictFields.includes('purchase_status') ? 'text-red-600 font-bold' : ''}>
                              {part.purchase_status}
                            </span>
                          )}
                        </td>
                        
                        {/* 工艺路线 */}
                        <td className="border px-4 py-2 text-center whitespace-nowrap">
                          {editMode ? (
                            <input
                              type="text"
                              className="w-full px-2 py-1 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                              value={editedParts[part.id]?.process_route !== undefined ? editedParts[part.id].process_route : part.process_route}
                              onChange={(e) => handleCellChange(part.id, 'process_route', e.target.value)}
                            />
                          ) : (
                            <span className={hasConflict && conflictInfo?.conflictFields.includes('process_route') ? 'text-red-600 font-bold' : ''}>
                              {part.process_route}
                            </span>
                          )}
                        </td>
                        
                        {/* 备注 */}
                        <td className="border px-4 py-2 text-center whitespace-nowrap">
                          {editMode ? (
                            <input
                              type="text"
                              className="w-full px-2 py-1 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                              value={editedParts[part.id]?.remark !== undefined ? editedParts[part.id].remark : part.remark}
                              onChange={(e) => handleCellChange(part.id, 'remark', e.target.value)}
                            />
                          ) : (
                            <span className={hasConflict && conflictInfo?.conflictFields.includes('remark') ? 'text-red-600 font-bold' : ''}>
                              {part.remark}
                            </span>
                          )}
                        </td>
                        
                        {/* 项目名称 - 不可编辑 */}
                        <td className="border px-4 py-2 text-center whitespace-nowrap">{part.project_name}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            
            {/* 分页控件 */}
            {filteredParts.length > 0 && (
              <div className="mt-6 flex flex-col sm:flex-row justify-between items-center bg-white p-4 border-t">
                <div className="flex items-center mb-4 sm:mb-0">
                  <span className="text-sm text-gray-700 mr-4">
                    显示 {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredParts.length)} 条，共 {filteredParts.length} 条
                  </span>
                  <select
                    className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={itemsPerPage}
                    onChange={handleItemsPerPageChange}
                  >
                    {[15, 20, 50, 100].map(value => (
                      <option key={value} value={value}>
                        每页 {value} 条
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => handlePageChange(1)}
                    disabled={currentPage === 1}
                    className={`px-3 py-1 rounded-md ${currentPage === 1 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white text-blue-600 hover:bg-blue-50'} border`}
                  >
                    首页
                  </button>
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className={`px-3 py-1 rounded-md ${currentPage === 1 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white text-blue-600 hover:bg-blue-50'} border`}
                  >
                    上一页
                  </button>
                  
                  {/* 页码按钮 */}
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    // 计算显示哪些页码
                    let pageNum: number;
                    if (totalPages <= 5) {
                      // 总页数少于5，显示所有页码
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      // 当前页靠近开始，显示1-5
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      // 当前页靠近结束，显示最后5页
                      pageNum = totalPages - 4 + i;
                    } else {
                      // 当前页在中间，显示当前页及其前后2页
                      pageNum = currentPage - 2 + i;
                    }
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => handlePageChange(pageNum)}
                        className={`px-3 py-1 rounded-md border ${currentPage === pageNum ? 'bg-blue-600 text-white' : 'bg-white text-blue-600 hover:bg-blue-50'}`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className={`px-3 py-1 rounded-md ${currentPage === totalPages ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white text-blue-600 hover:bg-blue-50'} border`}
                  >
                    下一页
                  </button>
                  <button
                    onClick={() => handlePageChange(totalPages)}
                    disabled={currentPage === totalPages}
                    className={`px-3 py-1 rounded-md ${currentPage === totalPages ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white text-blue-600 hover:bg-blue-50'} border`}
                  >
                    末页
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MergedParts;
