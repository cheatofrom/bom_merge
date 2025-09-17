import React, { useState, useEffect } from 'react';
import { getUsers, toggleUserStatus, getUserPermissions, grantPermission, revokePermission, register, deleteUser, User, Permission, RegisterRequest } from '../services/auth';
import { getAllCategories } from '../services/api';
import { Category } from '../types';
import ConfirmDialog from './ConfirmDialog';
import { useAuth } from '../contexts/AuthContext';

const UserManagement: React.FC = () => {
  const { user: currentUser, refreshUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userPermissions, setUserPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
  const [createUserForm, setCreateUserForm] = useState<RegisterRequest>({
    username: '',
    email: '',
    password: '',
    full_name: '',
    role: 'user'
  });
  const [createUserLoading, setCreateUserLoading] = useState(false);
  
  // 删除用户确认对话框
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  
  // 资源数据
  const [categories, setCategories] = useState<Category[]>([]);
  
  // 用户分类权限
  const [userCategories, setUserCategories] = useState<number[]>([]);

  useEffect(() => {
    loadUsers();
    loadResources();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const usersData = await getUsers();
      setUsers(usersData);
    } catch (err: any) {
      setError('获取用户列表失败');
      console.error('Load users error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadResources = async () => {
    try {
      const categoriesData = await getAllCategories();
      setCategories(categoriesData);
    } catch (err: any) {
      console.error('Load resources error:', err);
    }
  };

  const loadUserPermissions = async (userId: number) => {
    try {
      const response = await getUserPermissions(userId);
      setUserPermissions(response.permissions);
    } catch (err: any) {
      setError('获取用户权限失败');
      console.error('Load user permissions error:', err);
    }
  };

  const handleUserSelect = (user: User) => {
    setSelectedUser(user);
    loadUserPermissions(user.id);
    loadUserCategories(user.id);
  };

  const loadUserCategories = async (userId: number) => {
    try {
      const response = await getUserPermissions(userId);
      const categoryIds = response.permissions
        .filter(p => p.category_id)
        .map(p => p.category_id!);
      setUserCategories(categoryIds);
    } catch (err: any) {
      console.error('Load user categories error:', err);
    }
  };

  const handleToggleUserStatus = async (userId: number) => {
    try {
      await toggleUserStatus(userId);
      await loadUsers(); // 重新加载用户列表
    } catch (err: any) {
      setError('切换用户状态失败');
      console.error('Toggle user status error:', err);
    }
  };

  const handleSaveCategories = async () => {
    console.log('=== handleSaveCategories 开始执行 ===');
    console.log('selectedUser:', selectedUser);
    console.log('selectedCategories:', selectedCategories);
    console.log('userPermissions:', userPermissions);
    
    try {
      if (!selectedUser) {
        console.log('没有选中的用户，退出');
        return;
      }
      
      console.log('开始撤销现有权限');
      // 先撤销所有现有的分类权限
      const currentCategoryPermissions = userPermissions.filter(p => p.category_id);
      console.log('当前权限:', currentCategoryPermissions);
      
      for (const permission of currentCategoryPermissions) {
        console.log('正在撤销权限:', permission);
        try {
          const revokeResult = await revokePermission({
            user_id: selectedUser.id,
            category_id: permission.category_id
          });
          console.log('撤销权限成功:', revokeResult);
        } catch (revokeError) {
          console.error('撤销权限失败:', revokeError);
          throw revokeError;
        }
      }
      
      console.log('开始授予新权限');
      // 授予新选择的分类权限
      for (const categoryId of selectedCategories) {
        console.log('正在授予权限给分类:', categoryId);
        try {
          const grantResult = await grantPermission({
            user_id: selectedUser.id,
            category_id: categoryId,
            permission_type: 'view'
          });
          console.log('授予权限成功:', grantResult);
        } catch (grantError) {
          console.error('授予权限失败:', grantError);
          throw grantError;
        }
      }
      
      console.log('重新加载用户权限');
      try {
        await loadUserPermissions(selectedUser.id);
        console.log('loadUserPermissions 完成');
        await loadUserCategories(selectedUser.id);
        console.log('loadUserCategories 完成');
        
        // 如果修改的是当前登录用户的权限，刷新当前用户信息
        if (currentUser && selectedUser.id === currentUser.id) {
          console.log('刷新当前用户权限信息');
          await refreshUser();
        }
        
        // 通知用户权限已更新（可以通过WebSocket或其他方式实现实时通知）
        console.log(`用户 ${selectedUser.username} 的权限已更新`);
        
        // 强制清除浏览器缓存，确保下次访问时获取最新权限
        if ('caches' in window) {
          caches.keys().then(names => {
            names.forEach(name => {
              caches.delete(name);
            });
          });
        }
      } catch (loadError) {
        console.error('重新加载权限失败:', loadError);
        throw loadError;
      }
      
      console.log('关闭模态框并清理状态');
      setShowCategoryModal(false);
      setSelectedCategories([]);
      console.log('=== 权限保存完全成功 ===');
    } catch (err: any) {
      console.error('Save categories error:', err);
      console.error('Error details:', err.response?.data);
      setError(`保存分类权限失败: ${err.response?.data?.detail || err.message}`);
    }
  };

  const handleCategoryToggle = (categoryId: number) => {
    setSelectedCategories(prev => 
      prev.includes(categoryId)
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateUserLoading(true);
    setError(null);

    try {
      await register(createUserForm);
      setShowCreateUserModal(false);
      setCreateUserForm({
        username: '',
        email: '',
        password: '',
        full_name: '',
        role: 'user'
      });
      await loadUsers();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.response?.data?.error || '创建用户失败');
    } finally {
      setCreateUserLoading(false);
    }
  };

  const handleCreateUserFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setCreateUserForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    
    setDeleteLoading(true);
    try {
      await deleteUser(userToDelete.id);
      await loadUsers();
      setShowDeleteConfirm(false);
      setUserToDelete(null);
      // 如果删除的是当前选中的用户，清除选中状态
      if (selectedUser?.id === userToDelete.id) {
        setSelectedUser(null);
        setUserPermissions([]);
        setUserCategories([]);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || '删除用户失败');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleShowDeleteConfirm = (user: User) => {
    setUserToDelete(user);
    setShowDeleteConfirm(true);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">用户管理</h1>
      
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
          <button 
            onClick={() => setError(null)}
            className="float-right text-red-500 hover:text-red-700"
          >
            ×
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* 用户列表 */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900">用户列表</h2>
            <button
              onClick={() => setShowCreateUserModal(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
            >
              创建用户
            </button>
          </div>
          
          <div className="space-y-4">
            {users.map((user) => (
              <div 
                key={user.id} 
                className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                  selectedUser?.id === user.id 
                    ? 'border-indigo-500 bg-indigo-50' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => handleUserSelect(user)}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-medium text-gray-900">{user.username}</h3>
                    <p className="text-sm text-gray-500">{user.email}</p>
                    <div className="flex items-center mt-1">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        user.role === 'admin' 
                          ? 'bg-purple-100 text-purple-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {user.role === 'admin' ? '管理员' : '普通用户'}
                      </span>
                      <span className={`ml-2 inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        user.is_active 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {user.is_active ? '活跃' : '禁用'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex space-x-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleUserStatus(user.id);
                      }}
                      className={`px-3 py-1 text-sm rounded ${
                        user.is_active
                          ? 'bg-red-100 text-red-700 hover:bg-red-200'
                          : 'bg-green-100 text-green-700 hover:bg-green-200'
                      }`}
                    >
                      {user.is_active ? '禁用' : '启用'}
                    </button>
                    {user.role !== 'admin' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleShowDeleteConfirm(user);
                        }}
                        className="px-3 py-1 text-sm rounded bg-red-500 text-white hover:bg-red-600"
                        title="删除用户"
                      >
                        删除
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 用户权限管理 */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900">
              {selectedUser ? `${selectedUser.username} 的权限` : '选择用户查看权限'}
            </h2>
            {selectedUser && selectedUser.role !== 'admin' && (
              <button
                onClick={() => {
                  setSelectedCategories(userCategories);
                  setShowCategoryModal(true);
                }}
                className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
              >
                设置分类权限
              </button>
            )}
            {selectedUser && selectedUser.role === 'admin' && (
              <span className="text-sm text-gray-500 italic">
                管理员拥有所有分类权限
              </span>
            )}
          </div>

          {selectedUser ? (
            <div className="space-y-4">
              {selectedUser.role === 'admin' ? (
                <div className="space-y-2">
                  <h4 className="font-medium text-gray-900 mb-3">管理员权限 - 可访问所有分类:</h4>
                  {categories.map((category) => (
                    <div key={category.id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                      <div className="flex items-center">
                        <div 
                          className="w-4 h-4 rounded mr-3" 
                          style={{ backgroundColor: category.color }}
                        ></div>
                        <span className="text-gray-900">{category.name}</span>
                        <span className="ml-2 text-xs text-green-600 font-medium">✓ 管理员权限</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                userCategories.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">该用户暂无分类权限</p>
                ) : (
                  <div className="space-y-2">
                    <h4 className="font-medium text-gray-900 mb-3">可访问的分类:</h4>
                    {userCategories.map((categoryId) => {
                      const category = categories.find(c => c.id === categoryId);
                      return category ? (
                        <div key={categoryId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center">
                            <div 
                              className="w-4 h-4 rounded mr-3" 
                              style={{ backgroundColor: category.color }}
                            ></div>
                            <span className="text-gray-900">{category.name}</span>
                          </div>
                        </div>
                      ) : null;
                    })}
                  </div>
                )
              )}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">请从左侧选择一个用户</p>
          )}
        </div>
      </div>

      {/* 分类权限设置模态框 */}
      {showCategoryModal && selectedUser && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                为 {selectedUser.username} 设置分类权限
              </h3>
              
              <div className="space-y-3">
                <p className="text-sm text-gray-600 mb-4">选择用户可以访问的分类:</p>
                {categories.map((category) => (
                  <label key={category.id} className="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded">
                    <input
                      type="checkbox"
                      checked={selectedCategories.includes(category.id)}
                      onChange={() => handleCategoryToggle(category.id)}
                      className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                    />
                    <div 
                      className="w-4 h-4 rounded" 
                      style={{ backgroundColor: category.color }}
                    ></div>
                    <span className="text-gray-900">{category.name}</span>
                  </label>
                ))}
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowCategoryModal(false);
                    setSelectedCategories([]);
                  }}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSaveCategories();
                  }}
                  className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 创建用户模态框 */}
      {showCreateUserModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">创建新用户</h3>
            
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">用户名</label>
                <input
                  type="text"
                  name="username"
                  value={createUserForm.username}
                  onChange={handleCreateUserFormChange}
                  required
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="请输入用户名"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
                <input
                  type="email"
                  name="email"
                  value={createUserForm.email}
                  onChange={handleCreateUserFormChange}
                  required
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="请输入邮箱地址"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">密码</label>
                <input
                  type="password"
                  name="password"
                  value={createUserForm.password}
                  onChange={handleCreateUserFormChange}
                  required
                  minLength={6}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="请输入密码（至少6位）"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">姓名</label>
                <input
                  type="text"
                  name="full_name"
                  value={createUserForm.full_name}
                  onChange={handleCreateUserFormChange}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="请输入真实姓名（可选）"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">角色</label>
                <select
                  name="role"
                  value={createUserForm.role}
                  onChange={handleCreateUserFormChange}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="user">普通用户</option>
                  <option value="admin">管理员</option>
                </select>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateUserModal(false);
                    setCreateUserForm({
                      username: '',
                      email: '',
                      password: '',
                      full_name: '',
                      role: 'user'
                    });
                  }}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
                  disabled={createUserLoading}
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={createUserLoading}
                  className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {createUserLoading ? '创建中...' : '创建用户'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 删除用户确认对话框 */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="确认删除用户"
        message={`确定要删除用户 "${userToDelete?.username}" 吗？此操作不可撤销，将同时删除该用户的所有权限和相关数据。`}
        confirmText={deleteLoading ? "删除中..." : "删除"}
        cancelText="取消"
        onConfirm={handleDeleteUser}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setUserToDelete(null);
        }}
      />
    </div>
  );
};

export default UserManagement;