import React, { useState, useEffect } from 'react';
import { getUsers, getUserPermissions, grantPermission, revokePermission, User, Permission } from '../services/auth';
import { getUploadedFiles } from '../services/api';
import { UploadedFile } from '../types';

interface PermissionSettingsProps {
  className?: string;
}

const PermissionSettings: React.FC<PermissionSettingsProps> = ({ className = '' }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [userPermissions, setUserPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  // 获取用户列表和文件列表
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [usersData, filesData] = await Promise.all([
          getUsers(),
          getUploadedFiles()
        ]);
        setUsers(usersData);
        setFiles(filesData);
      } catch (err) {
        setError('获取数据失败，请稍后重试');
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // 获取选中用户的权限
  useEffect(() => {
    const fetchUserPermissions = async () => {
      if (!selectedUser) {
        setUserPermissions([]);
        return;
      }

      try {
        const response = await getUserPermissions(parseInt(selectedUser));
        setUserPermissions(response.permissions);
      } catch (err) {
        setError('获取用户权限失败');
        console.error('Error fetching user permissions:', err);
      }
    };

    fetchUserPermissions();
  }, [selectedUser]);

  // 检查用户是否有特定分类的特定权限
  const hasPermission = (categoryId: string, permission: string): boolean => {
    return userPermissions.some(p => 
      p.resource_type === 'category' && 
      p.category_id === parseInt(categoryId) && 
      p.permission_type === permission
    );
  };

  // 切换权限
  const togglePermission = async (fileId: string, permission: string, currentHasPermission: boolean) => {
    if (!selectedUser) return;

    const updateKey = `${fileId}_${permission}`;
    setUpdating(updateKey);
    setError(null);
    setSuccess(null);

    try {
      if (currentHasPermission) {
        await revokePermission({
          user_id: parseInt(selectedUser),
          category_id: parseInt(fileId) // 现在使用category_id
        });
        setSuccess(`已撤销 ${permission} 权限`);
      } else {
        await grantPermission({
          user_id: parseInt(selectedUser),
          category_id: parseInt(fileId), // 现在使用category_id
          permission_type: permission as 'view' | 'edit'
        });
        setSuccess(`已授予 ${permission} 权限`);
      }

      // 刷新用户权限
      const response = await getUserPermissions(parseInt(selectedUser));
      setUserPermissions(response.permissions);

      // 清除成功消息
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError('权限操作失败，请稍后重试');
      console.error('Error toggling permission:', err);
    } finally {
      setUpdating(null);
    }
  };



  if (loading) {
    return (
      <div className={`flex justify-center items-center p-8 ${className}`}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">加载中...</span>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow-md p-6 ${className}`}>
      <h2 className="text-2xl font-bold text-gray-800 mb-6">权限设置</h2>

      {/* 错误提示 */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-600">{error}</p>
        </div>
      )}

      {/* 成功提示 */}
      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-md">
          <p className="text-green-600">{success}</p>
        </div>
      )}

      {/* 用户选择 */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          选择用户
        </label>
        <select
          value={selectedUser}
          onChange={(e) => setSelectedUser(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="">请选择用户</option>
          {users.map(user => (
            <option key={user.id} value={user.id.toString()}>
              {user.username} ({user.email})
            </option>
          ))}
        </select>
      </div>

      {/* 权限设置表格 */}
      {selectedUser && (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  项目名称
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  查看权限
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  编辑权限
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {files.map(file => (
                <tr key={file.category_id || file.file_unique_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {file.project_name}
                    </div>
                    <div className="text-sm text-gray-500">
                      {file.original_filename}
                    </div>
                  </td>
                  {['view', 'edit'].map(permission => {
                    const currentHasPermission = file.category_id ? hasPermission(file.category_id.toString(), permission) : false;
                    const updateKey = `${file.category_id}_${permission}`;
                    const isUpdating = updating === updateKey;

                    return (
                      <td key={permission} className="px-6 py-4 whitespace-nowrap text-center">
                        <button
                          onClick={() => togglePermission(file.category_id?.toString() || '', permission, currentHasPermission)}
                          disabled={isUpdating}
                          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                            currentHasPermission
                              ? 'bg-green-100 text-green-800 hover:bg-green-200'
                              : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                          } ${isUpdating ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          {isUpdating ? (
                            <svg className="animate-spin -ml-1 mr-2 h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          ) : (
                            <span className={`inline-block w-2 h-2 rounded-full mr-2 ${
                              currentHasPermission ? 'bg-green-500' : 'bg-gray-400'
                            }`}></span>
                          )}
                          {currentHasPermission ? '已授权' : '未授权'}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {files.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              暂无项目文件
            </div>
          )}
        </div>
      )}

      {!selectedUser && (
        <div className="text-center py-8 text-gray-500">
          请先选择一个用户来设置权限
        </div>
      )}
    </div>
  );
};

export default PermissionSettings;