import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Save, X, Palette } from 'lucide-react';
import { Category } from '../types';
import { getCategories, createCategory, updateCategory, deleteCategory } from '../services/api';

interface CategoryManagerProps {
  onClose?: () => void;
  onCategoryChange?: () => void;
  isModal?: boolean;
}

const CategoryManager: React.FC<CategoryManagerProps> = ({ onClose, onCategoryChange, isModal = true }) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  
  // 表单状态
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#3B82F6'
  });

  // 预定义颜色选项
  const colorOptions = [
    '#3B82F6', // blue
    '#10B981', // green
    '#F59E0B', // yellow
    '#EF4444', // red
    '#8B5CF6', // purple
    '#06B6D4', // cyan
    '#F97316', // orange
    '#84CC16', // lime
    '#EC4899', // pink
    '#6B7280'  // gray
  ];

  // 获取分类列表
  const fetchCategories = async () => {
    try {
      setLoading(true);
      const data = await getCategories();
      setCategories(data);
      setError(null);
    } catch (err) {
      setError('获取分类列表失败');
      console.error('Error fetching categories:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  // 重置表单
  const resetForm = () => {
    setFormData({ name: '', description: '', color: '#3B82F6' });
    setShowAddForm(false);
    setEditingId(null);
  };

  // 处理添加分类
  const handleAdd = async () => {
    console.log('handleAdd 被调用，formData:', formData);
    
    if (!formData.name.trim()) {
      setError('分类名称不能为空');
      return;
    }

    try {
      console.log('准备调用 createCategory API');
      const result = await createCategory(formData);
      console.log('createCategory API 调用成功:', result);
      
      await fetchCategories();
      resetForm();
      setError(null);
      onCategoryChange?.();
    } catch (err) {
      setError('创建分类失败');
      console.error('Error creating category:', err);
    }
  };

  // 处理编辑分类
  const handleEdit = (category: Category) => {
    setEditingId(category.id);
    setFormData({
      name: category.name,
      description: category.description || '',
      color: category.color || '#3B82F6'
    });
    setShowAddForm(false);
  };

  // 处理更新分类
  const handleUpdate = async () => {
    if (!formData.name.trim() || editingId === null) {
      setError('分类名称不能为空');
      return;
    }

    try {
      await updateCategory(editingId, formData);
      await fetchCategories();
      resetForm();
      setError(null);
      onCategoryChange?.();
    } catch (err) {
      setError('更新分类失败');
      console.error('Error updating category:', err);
    }
  };

  // 处理删除分类
  const handleDelete = async (id: number) => {
    try {
      await deleteCategory(id);
      await fetchCategories();
      setDeleteConfirm(null);
      setError(null);
      onCategoryChange?.();
    } catch (err) {
      setError('删除分类失败');
      console.error('Error deleting category:', err);
    }
  };

  if (loading) {
    const loadingContent = (
      <div className="flex items-center justify-center py-8">
        <div className="flex items-center space-x-2">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <span>加载中...</span>
        </div>
      </div>
    );

    if (!isModal) {
      return (
        <div className="container mx-auto px-4 py-8">
          {loadingContent}
        </div>
      );
    }

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6">
          {loadingContent}
        </div>
      </div>
    );
  }

  const content = (
    <div className={isModal ? "bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden" : "bg-white rounded-lg shadow-lg"}>
      {/* 头部 */}
      <div className="flex items-center justify-between p-6 border-b">
        <h2 className="text-xl font-semibold text-gray-800">分类管理</h2>
        {isModal && onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mx-6 mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      {/* 内容区域 */}
      <div className={`p-6 ${isModal ? 'overflow-y-auto max-h-[calc(90vh-120px)]' : ''}`}>
          {/* 添加按钮 */}
          <div className="mb-6">
            <button
              onClick={() => {
                console.log('添加分类按钮被点击');
                console.log('点击前 showAddForm:', showAddForm);
                setShowAddForm(true);
                setEditingId(null);
                // 只重置表单数据，不重置showAddForm状态
                setFormData({ name: '', description: '', color: '#3B82F6' });
                console.log('点击后设置 showAddForm 为 true');
              }}
              className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>添加分类</span>
            </button>
          </div>

          {/* 添加/编辑表单 */}
          {(() => {
            console.log('渲染时 showAddForm:', showAddForm, 'editingId:', editingId);
            return null;
          })()}
          {(showAddForm || editingId !== null) && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg border">
              <h3 className="text-lg font-medium mb-4">
                {editingId !== null ? '编辑分类' : '添加新分类'}
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    分类名称 *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="请输入分类名称"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    描述
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="请输入分类描述"
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Palette className="w-4 h-4 inline mr-1" />
                  颜色
                </label>
                <div className="flex flex-wrap gap-2">
                  {colorOptions.map((color) => (
                    <button
                      key={color}
                      onClick={() => setFormData({ ...formData, color })}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        formData.color === color
                          ? 'border-gray-800 scale-110'
                          : 'border-gray-300 hover:border-gray-500'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex space-x-2 mt-4">
                <button
                  onClick={() => {
                    console.log('保存按钮被点击，editingId:', editingId);
                    if (editingId !== null) {
                      handleUpdate();
                    } else {
                      handleAdd();
                    }
                  }}
                  className="flex items-center space-x-1 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors"
                >
                  <Save className="w-4 h-4" />
                  <span>{editingId !== null ? '更新' : '保存'}</span>
                </button>
                <button
                  onClick={resetForm}
                  className="flex items-center space-x-1 bg-gray-500 text-white px-4 py-2 rounded-md hover:bg-gray-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                  <span>取消</span>
                </button>
              </div>
            </div>
          )}

          {/* 分类列表 */}
          <div className="space-y-3">
            {categories.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                暂无分类，请添加新分类
              </div>
            ) : (
              categories.map((category) => (
                <div
                  key={category.id}
                  className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: category.color }}
                    />
                    <div>
                      <h4 className="font-medium text-gray-800">{category.name}</h4>
                      {category.description && (
                        <p className="text-sm text-gray-600">{category.description}</p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleEdit(category)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                      title="编辑"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(category.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
      </div>
    </div>
  );

  if (!isModal) {
    return (
      <div className="container mx-auto px-4 py-8">
        {content}
        {/* 删除确认对话框 */}
        {deleteConfirm !== null && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold mb-4">确认删除</h3>
              <p className="text-gray-600 mb-6">
                确定要删除这个分类吗？删除后无法恢复。
              </p>
              <div className="flex space-x-3 justify-end">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      {content}
      {/* 删除确认对话框 */}
      {deleteConfirm !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">确认删除</h3>
            <p className="text-gray-600 mb-6">
              确定要删除这个分类吗？删除后无法恢复。
            </p>
            <div className="flex space-x-3 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CategoryManager;