import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getMergedProjectParts, exportMergedProject, deleteMergedPart } from '../services/api';
import { MergedPart } from '../types';
import ConfirmDialog from '../components/ConfirmDialog';

/**
 * @component MergedProjectParts
 * @description 合并项目零部件页面组件，用于显示指定合并项目的所有零部件
 */
const MergedProjectParts: React.FC = () => {
  const { mergedProjectId } = useParams<{ mergedProjectId: string }>();
  const [parts, setParts] = useState<MergedPart[]>([]);
  const [projectInfo, setProjectInfo] = useState<{ name: string, id: number } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState<string>('');
  
  // 分页状态
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(30);
  
  // 导出状态
  const [exporting, setExporting] = useState<boolean>(false);
  
  // 删除状态
  const [deleting, setDeleting] = useState<Record<number, boolean>>({});
  const [confirmDelete, setConfirmDelete] = useState<{isOpen: boolean, partId: number | null, partName: string, partCode: string}>({isOpen: false, partId: null, partName: '', partCode: ''});
  
  const navigate = useNavigate();

  // 获取合并项目零部件
  useEffect(() => {
    const fetchMergedProjectParts = async () => {
      if (!mergedProjectId) {
        setError('未指定合并项目ID');
        setParts([]);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        
        const projectIdNum = parseInt(mergedProjectId, 10);
        if (isNaN(projectIdNum)) {
          setError('无效的合并项目ID');
          return;
        }
        
        const partsData = await getMergedProjectParts(projectIdNum);
        
        if (partsData && partsData.parts && partsData.project) {
          setParts(partsData.parts);
          setProjectInfo({
            name: partsData.project.merged_project_name,
            id: partsData.project.id
          });
        } else {
          setError('获取合并项目零部件失败');
        }
      } catch (err) {
        console.error('获取合并项目零部件失败:', err);
        setError('获取合并项目零部件失败，请稍后重试');
      } finally {
        setLoading(false);
      }
    };

    fetchMergedProjectParts();
  }, [mergedProjectId]);

  // 处理搜索过滤
  const filteredParts = useMemo(() => {
    if (!searchText.trim()) return parts;
    
    const lowerSearchText = searchText.toLowerCase();
    return parts.filter(part => {
      return (
        (part.part_code && part.part_code.toLowerCase().includes(lowerSearchText)) ||
        (part.part_name && part.part_name.toLowerCase().includes(lowerSearchText)) ||
        (part.spec && part.spec.toLowerCase().includes(lowerSearchText)) ||
        (part.material && part.material.toLowerCase().includes(lowerSearchText)) ||
        (part.remark && part.remark.toLowerCase().includes(lowerSearchText)) ||
        (part.serial_number && part.serial_number.toLowerCase().includes(lowerSearchText)) ||
        (part.erp_inventory_number && part.erp_inventory_number.toLowerCase().includes(lowerSearchText)) ||
        (part.status_type && part.status_type.toLowerCase().includes(lowerSearchText)) ||
        (part.parent_part && part.parent_part.toLowerCase().includes(lowerSearchText)) ||
        (part.factory && part.factory.toLowerCase().includes(lowerSearchText)) ||
        (part.pbom_description && part.pbom_description.toLowerCase().includes(lowerSearchText))
      );
    });
  }, [parts, searchText]);

  // 计算分页数据
  const paginatedParts = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredParts.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredParts, currentPage, itemsPerPage]);

  // 计算总页数
  const totalPages = useMemo(() => {
    return Math.ceil(filteredParts.length / itemsPerPage);
  }, [filteredParts, itemsPerPage]);

  // 生成页码数组
  const pageNumbers = useMemo(() => {
    const pages = [];
    const maxPageButtons = 5; // 最多显示的页码按钮数
    
    if (totalPages <= maxPageButtons) {
      // 如果总页数小于等于最大按钮数，显示所有页码
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // 否则，显示当前页附近的页码
      let startPage = Math.max(1, currentPage - Math.floor(maxPageButtons / 2));
      let endPage = startPage + maxPageButtons - 1;
      
      if (endPage > totalPages) {
        endPage = totalPages;
        startPage = Math.max(1, endPage - maxPageButtons + 1);
      }
      
      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }
    }
    
    return pages;
  }, [totalPages, currentPage]);

  /**
   * @function handlePageChange
   * @description 处理页码变更
   * @param {number} pageNumber - 目标页码
   */
  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  /**
   * @function handleItemsPerPageChange
   * @description 处理每页显示条目数变更
   * @param {React.ChangeEvent<HTMLSelectElement>} event - 选择框变更事件
   */
  const handleItemsPerPageChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setItemsPerPage(Number(event.target.value));
    setCurrentPage(1); // 重置到第一页
  };

  /**
   * @function handleBackToList
   * @description 返回到合并项目列表页面
   */
  const handleBackToList = () => {
    navigate('/merged-projects');
  };

  /**
   * @function handleShowDeleteConfirm
   * @description 显示删除确认对话框
   * @param {number} partId - 要删除的零部件ID
   * @param {string} partName - 零部件名称
   * @param {string} partCode - 零部件编号
   */
  const handleShowDeleteConfirm = (partId: number, partName: string, partCode: string) => {
    setConfirmDelete({isOpen: true, partId, partName, partCode});
  };

  /**
   * @function handleCancelDelete
   * @description 取消删除操作
   */
  const handleCancelDelete = () => {
    setConfirmDelete({isOpen: false, partId: null, partName: '', partCode: ''});
  };

  /**
   * @function handleConfirmDelete
   * @description 确认删除零部件
   */
  const handleConfirmDelete = async () => {
    if (!confirmDelete.partId) return;
    
    try {
      // 设置删除状态
      setDeleting(prev => ({ ...prev, [confirmDelete.partId!]: true }));
      
      // 调用API删除零部件
      const result = await deleteMergedPart(confirmDelete.partId);
      
      if (result.status === 'success') {
        // 删除成功，从列表中移除该零部件
        setParts(prevParts => prevParts.filter(part => part.id !== confirmDelete.partId));
        // 显示成功消息
        setError(null);
      } else {
        // 删除失败，显示错误消息
        setError(`删除零部件失败: ${result.message}`);
      }
    } catch (err) {
      console.error(`删除零部件 ${confirmDelete.partId} 失败:`, err);
      setError(`删除零部件失败，请稍后重试`);
    } finally {
      // 清除删除状态和确认对话框
      setDeleting(prev => ({ ...prev, [confirmDelete.partId!]: false }));
      setConfirmDelete({isOpen: false, partId: null, partName: '', partCode: ''});
    }
  };

  /**
   * @function handleExport
   * @description 导出合并项目为Excel文件
   */
  const handleExport = async () => {
    if (!projectInfo) return;
    
    try {
      setExporting(true);
      await exportMergedProject(projectInfo.id, projectInfo.name);
      
      // 导出成功，清除任何之前的错误
      setError(null);
    } catch (err: any) {
      console.error(`导出合并项目 ${projectInfo.id} 失败:`, err);
      // 显示更具体的错误信息
      setError(`导出合并项目失败: ${err.message || '请稍后重试'}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="w-full min-h-screen bg-gray-50 py-6">
      {/* 确认删除对话框 */}
      <ConfirmDialog
        isOpen={confirmDelete.isOpen}
        title="确认删除零部件"
        message={`确定要删除零部件 "${confirmDelete.partName}"(编号: ${confirmDelete.partCode}) 吗？此操作无法撤销。`}
        confirmText="删除"
        cancelText="取消"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
      
      {/* 页面内容容器 */}
      <div className="px-4 sm:px-6 lg:px-8">
        {/* 页面标题和操作按钮区域 */}
        <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-blue-700 mb-2">零部件库管理系统</h1>
          <h2 className="text-xl text-gray-600 border-b pb-2">
            {projectInfo ? `合并项目: ${projectInfo.name}` : '合并项目零部件'}
          </h2>
        </div>
        <div className="flex space-x-3">
          {/* 导出Excel按钮 */}
          {projectInfo && (
            <button
              onClick={handleExport}
              disabled={exporting || loading}
              className={`px-4 py-2 rounded-md shadow-md transition-colors duration-200 flex items-center ${exporting || loading ? 'bg-gray-400 text-gray-200 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700 hover:shadow-lg'}`}
            >
              {exporting ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  导出中...
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                  导出Excel
                </>
              )}
            </button>
          )}
          {/* 返回按钮 */}
          <button
            onClick={handleBackToList}
            className="px-4 py-2 bg-gray-600 text-white rounded-md shadow-md hover:bg-gray-700 hover:shadow-lg transition-colors duration-200 flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
            返回列表
          </button>
        </div>
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
      
      {/* 搜索和分页控件 */}
      <div className="flex justify-between items-center mb-4">
        <div className="w-1/3">
          <input
            type="text"
            placeholder="搜索零部件..."
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value);
              setCurrentPage(1); // 搜索时重置到第一页
            }}
          />
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-gray-600">每页显示:</span>
          <select
            value={itemsPerPage}
            onChange={handleItemsPerPageChange}
            className="border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="30">30</option>
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="200">200</option>
          </select>
          <span className="text-gray-600 ml-4">
            显示 {filteredParts.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} - 
            {Math.min(currentPage * itemsPerPage, filteredParts.length)} 条，共 {filteredParts.length} 条
          </span>
        </div>
      </div>
      
      {/* 加载状态显示或零部件表格 */}
      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          <span className="ml-3 text-lg text-gray-600">加载零部件中...</span>
        </div>
      ) : (
        <div>
          {/* 零部件表格 */}
          <div className="overflow-x-auto bg-white rounded-lg shadow -mx-4 sm:-mx-6 lg:-mx-8" style={{ maxHeight: '70vh', width: '100%', maxWidth: '100vw' }}>
            <table className="w-full divide-y divide-gray-200" style={{ tableLayout: 'auto', minWidth: '1500px' }}>
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr className="bg-gray-50">
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '5%' }}>层级</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '8%' }}>零件号</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '10%' }}>零件名称</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '8%' }}>规格型号</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '5%' }}>版本</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '8%' }}>材料</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '6%' }}>单层级用量</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '6%' }}>单重(kg)</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '6%' }}>总重(kg)</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '6%' }}>零件属性</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '5%' }}>图幅</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '6%' }}>参考号</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '6%' }}>采购状态</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '8%' }}>工艺路线</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '10%' }}>备注</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '5%' }}>序号</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '8%' }}>ERP存货号</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '6%' }}>状态类型</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '6%' }}>母件</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '5%' }}>工厂</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '10%' }}>PBOM说明</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '5%' }}>操作</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedParts.length > 0 ? (
                  paginatedParts.map((part, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900">{part.level}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{part.part_code}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{part.part_name}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{part.spec}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{part.version}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{part.material}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{part.unit_count_per_level}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{part.unit_weight_kg}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{part.total_weight_kg}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{part.part_property}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{part.drawing_size}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{part.reference_number}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{part.purchase_status}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{part.process_route}</td>
                      <td className="px-6 py-4 text-sm text-gray-900 break-words" style={{ maxWidth: '200px' }}>{part.remark}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{part.serial_number}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{part.erp_inventory_number}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{part.status_type}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{part.parent_part}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{part.factory}</td>
                      <td className="px-6 py-4 text-sm text-gray-900 break-words" style={{ maxWidth: '200px' }}>{part.pbom_description}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <button
                          onClick={() => handleShowDeleteConfirm(part.id, part.part_name, part.part_code)}
                          disabled={deleting[part.id]}
                          className={`p-2 rounded-md transition-colors duration-200 ${deleting[part.id] ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-red-100 text-red-600 hover:bg-red-200'}`}
                          title="删除零部件"
                        >
                          {deleting[part.id] ? (
                            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={16} className="px-6 py-4 text-center text-sm text-gray-500">
                      {searchText ? '没有找到匹配的零部件' : '没有零部件数据'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          {/* 分页控件 */}
          {filteredParts.length > 0 && (
            <div className="flex justify-between items-center mt-4">
              <div>
                <span className="text-sm text-gray-700">
                  显示第 <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> 至 
                  <span className="font-medium">{Math.min(currentPage * itemsPerPage, filteredParts.length)}</span> 条，
                  共 <span className="font-medium">{filteredParts.length}</span> 条
                </span>
              </div>
              <div className="flex space-x-1">
                {/* 首页按钮 */}
                <button
                  onClick={() => handlePageChange(1)}
                  disabled={currentPage === 1}
                  className={`px-3 py-1 rounded-md ${currentPage === 1 ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'}`}
                >
                  首页
                </button>
                {/* 上一页按钮 */}
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className={`px-3 py-1 rounded-md ${currentPage === 1 ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'}`}
                >
                  上一页
                </button>
                {/* 页码按钮 */}
                {pageNumbers.map(number => (
                  <button
                    key={number}
                    onClick={() => handlePageChange(number)}
                    className={`px-3 py-1 rounded-md ${currentPage === number ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'}`}
                  >
                    {number}
                  </button>
                ))}
                {/* 下一页按钮 */}
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className={`px-3 py-1 rounded-md ${currentPage === totalPages ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'}`}
                >
                  下一页
                </button>
                {/* 末页按钮 */}
                <button
                  onClick={() => handlePageChange(totalPages)}
                  disabled={currentPage === totalPages}
                  className={`px-3 py-1 rounded-md ${currentPage === totalPages ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'}`}
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

export default MergedProjectParts;