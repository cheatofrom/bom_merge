import React, { useEffect, useState } from 'react';
import { getFileMappingsByFileId } from '../services/api';
import { FileMapping } from '../types';

interface FileMappingInfoProps {
  fileUniqueId: string;
}

const FileMappingInfo: React.FC<FileMappingInfoProps> = ({ fileUniqueId }) => {
  const [mappings, setMappings] = useState<FileMapping[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMappings = async () => {
      if (!fileUniqueId) return;
      
      try {
        setLoading(true);
        const data = await getFileMappingsByFileId(fileUniqueId);
        setMappings(data);
        setError(null);
      } catch (err) {
        console.error('获取文件映射失败:', err);
        setError('获取文件映射信息失败');
      } finally {
        setLoading(false);
      }
    };

    fetchMappings();
  }, [fileUniqueId]);

  if (loading) {
    return (
      <div className="p-4 flex justify-center items-center">
        <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-blue-500"></div>
        <span className="ml-2 text-gray-600">加载映射信息...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-red-500">
        <p>{error}</p>
      </div>
    );
  }

  if (mappings.length === 0) {
    return (
      <div className="p-4 text-gray-500">
        <p>没有找到相关的映射信息</p>
      </div>
    );
  }

  // 按实体类型分组显示映射
  const projectMappings = mappings.filter(m => m.entity_type === 'project');
  const partMappings = mappings.filter(m => m.entity_type === 'part');

  return (
    <div className="p-4 bg-white rounded-lg shadow">
      <h3 className="text-lg font-medium mb-4">文件映射信息</h3>
      
      {projectMappings.length > 0 && (
        <div className="mb-4">
          <h4 className="text-md font-medium mb-2">项目映射</h4>
          <div className="bg-gray-50 p-3 rounded">
            {projectMappings.map((mapping, index) => (
              <div key={index} className="mb-2 last:mb-0">
                <p><span className="font-medium">项目名称:</span> {mapping.entity_id}</p>
                {mapping.mapping_data && (
                  <div className="ml-4 text-sm text-gray-600">
                    <p>上传批次: {mapping.mapping_data.upload_batch}</p>
                    <p>导入行数: {mapping.mapping_data.rows_count}</p>
                    <p>工作表: {mapping.mapping_data.sheet_name}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {partMappings.length > 0 && (
        <div>
          <h4 className="text-md font-medium mb-2">零件映射 ({partMappings.length})</h4>
          <div className="max-h-60 overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">零件编号</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">零件名称</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">层级</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {partMappings.map((mapping, index) => (
                  <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">{mapping.entity_id}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">
                      {mapping.mapping_data?.part_name || '-'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">
                      {mapping.mapping_data?.level || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileMappingInfo;