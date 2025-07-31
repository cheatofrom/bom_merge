import React, { useEffect, useState, useMemo } from 'react'; 
import { useLocation, useNavigate } from 'react-router-dom'; 
import { mergeParts } from '../services/api';
import { Part } from '../types';

const MergedParts: React.FC = () => {
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [projectNames, setProjectNames] = useState<string[]>([]);
  const [searchText, setSearchText] = useState<string>('');
  
  // 分页状态
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchMergedParts = async () => {
      try {
        setLoading(true);
        const searchParams = new URLSearchParams(location.search);
        const projectsParam = searchParams.get('projects');

        if (!projectsParam) {
          setError('未指定项目名称');
          setParts([]);
          setProjectNames([]);
          return;
        }

        const selectedProjects = JSON.parse(decodeURIComponent(projectsParam)) as string[];
        setProjectNames(selectedProjects);

        const mergedParts = await mergeParts(selectedProjects);
        setParts(mergedParts);
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

  // 搜索过滤，针对零件名称
  const filteredParts = useMemo(() => {
    if (!searchText.trim()) return parts;
    return parts.filter(part =>
      part.part_name.toLowerCase().includes(searchText.trim().toLowerCase())
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

  return (
    <div className="w-full min-h-screen bg-gray-50 px-4 sm:px-6 lg:px-8 py-6">
      
      {/* 取消最大宽度限制，父容器铺满全屏 */}
      <div className="mx-0">
        <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
          <h1 className="text-3xl font-bold text-blue-700">合并零部件列表</h1>
          <div className="flex gap-3">
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
          <input
            type="text"
            placeholder="搜索零件名称..."
            className="w-full px-4 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
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
                      '参考号', '采购状态', '工艺路线', '项目名称', '备注'
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
                <tbody className="divide-y divide-gray-200">
                  {currentPageData.map((part, index) => (
                    <tr key={`${part.id}-${index}`} className="hover:bg-gray-50 transition-colors duration-150">
                      <td className="border px-4 py-2 text-center whitespace-nowrap">{part.level}</td>
                      <td className="border px-4 py-2 text-center whitespace-nowrap">{part.part_code}</td>
                      <td className="border px-4 py-2 text-center whitespace-nowrap">{part.part_name}</td>
                      <td className="border px-4 py-2 text-center whitespace-nowrap">{part.spec}</td>
                      <td className="border px-4 py-2 text-center whitespace-nowrap">{part.version}</td>
                      <td className="border px-4 py-2 text-center whitespace-nowrap">{part.material}</td>
                      <td className="border px-4 py-2 text-center whitespace-nowrap">{part.unit_count_per_level}</td>
                      <td className="border px-4 py-2 text-center whitespace-nowrap">{part.unit_weight_kg}</td>
                      <td className="border px-4 py-2 text-center whitespace-nowrap">{part.total_weight_kg}</td>
                      <td className="border px-4 py-2 text-center whitespace-nowrap">{part.part_property}</td>
                      <td className="border px-4 py-2 text-center whitespace-nowrap">{part.drawing_size}</td>
                      <td className="border px-4 py-2 text-center whitespace-nowrap">{part.reference_number}</td>
                      <td className="border px-4 py-2 text-center whitespace-nowrap">{part.purchase_status}</td>
                      <td className="border px-4 py-2 text-center whitespace-nowrap">{part.process_route}</td>
                      <td className="border px-4 py-2 text-center whitespace-nowrap">{part.remark}</td>
                      <td className="border px-4 py-2 text-center whitespace-nowrap">{part.project_name}</td>
                    </tr>
                  ))}
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
                    {[10, 20, 50, 100].map(value => (
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
