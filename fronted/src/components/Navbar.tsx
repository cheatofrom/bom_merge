import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { logout } from '../services/auth';

const Navbar: React.FC = () => {
  const { user, logout: contextLogout, isAdmin } = useAuth();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // 判断当前路径是否匹配
  const isCurrentPath = (path: string) => {
    return location.pathname === path;
  };

  // 获取导航链接的样式类名
  const getNavLinkClass = (path: string) => {
    const baseClass = "px-3 py-2 text-sm font-medium transition-all duration-200 relative";
    if (isCurrentPath(path)) {
      return `${baseClass} text-indigo-600 font-semibold`;
    }
    return `${baseClass} text-gray-700 hover:text-indigo-600`;
  };

  // 获取下横线样式
  const getUnderlineClass = (path: string) => {
    if (isCurrentPath(path)) {
      return "absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 transform scale-x-100 transition-transform duration-200";
    }
    return "absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 transform scale-x-0 hover:scale-x-100 transition-transform duration-200";
  };

  const handleLogout = async () => {
    try {
      await logout();
      contextLogout();
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
      // 即使API调用失败，也要清除本地状态
      contextLogout();
      navigate('/login');
    }
  };

  if (!user) {
    return null;
  }

  return (
    <nav className="bg-white shadow-lg border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="flex-shrink-0">
              <h1 className="text-xl font-bold text-gray-900">BOM 合并系统</h1>
            </Link>
            
            <div className="hidden md:ml-6 md:flex md:space-x-8">
              <Link
                to="/"
                className={getNavLinkClass('/')}
              >
                <div className="flex items-center">
                  <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  项目列表
                </div>
                <div className={getUnderlineClass('/')}></div>
              </Link>
              
              <Link
                to="/merged-projects"
                className={getNavLinkClass('/merged-projects')}
              >
                <div className="flex items-center">
                  <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  合并项目
                </div>
                <div className={getUnderlineClass('/merged-projects')}></div>
              </Link>
              
              {isAdmin() && (
                <>
                  <Link
                    to="/categories"
                    className={getNavLinkClass('/categories')}
                  >
                    <div className="flex items-center">
                      <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a1.994 1.994 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                      </svg>
                      分类管理
                    </div>
                    <div className={getUnderlineClass('/categories')}></div>
                  </Link>
                  <Link
                    to="/admin/users"
                    className={getNavLinkClass('/admin/users')}
                  >
                    <div className="flex items-center">
                      <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                      </svg>
                      用户管理
                    </div>
                    <div className={getUnderlineClass('/admin/users')}></div>
                  </Link>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center">
            <div className="relative">
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center text-sm rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <div className="flex items-center space-x-3">
                  <div className="flex-shrink-0">
                    <div className="h-8 w-8 rounded-full bg-indigo-500 flex items-center justify-center">
                      <span className="text-sm font-medium text-white">
                        {user.username?.charAt(0).toUpperCase() || 'U'}
                      </span>
                    </div>
                  </div>
                  <div className="hidden md:block">
                    <div className="text-sm font-medium text-gray-900">{user.full_name || user.username || '用户'}</div>
                    <div className="text-xs text-gray-500">
                      {user.role === 'admin' ? '管理员' : '普通用户'}
                    </div>
                  </div>
                  <svg
                    className="h-5 w-5 text-gray-400"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              </button>

              {isDropdownOpen && (
                <div className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
                  <div className="py-1">
                    <div className="px-4 py-2 text-sm text-gray-700 border-b border-gray-100">
                      <div className="font-medium">{user.full_name || user.username}</div>
                      <div className="text-xs text-gray-500">{user.email}</div>
                    </div>
                    
                    <Link
                      to="/profile"
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      onClick={() => setIsDropdownOpen(false)}
                    >
                      个人资料
                    </Link>
                    
                    {isAdmin() && (
                      <Link
                        to="/admin/users"
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        onClick={() => setIsDropdownOpen(false)}
                      >
                        用户管理
                      </Link>
                    )}
                    
                    <button
                      onClick={() => {
                        setIsDropdownOpen(false);
                        handleLogout();
                      }}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      退出登录
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 移动端菜单 */}
      <div className="md:hidden">
        <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 border-t border-gray-200">
          <Link
            to="/"
            className="text-gray-900 hover:text-indigo-600 block px-3 py-2 rounded-md text-base font-medium"
          >
            项目列表
          </Link>
          
          <Link
            to="/merged-projects"
            className="text-gray-900 hover:text-indigo-600 block px-3 py-2 rounded-md text-base font-medium"
          >
            合并项目
          </Link>
          
          {isAdmin() && (
            <>
              <Link
                to="/categories"
                className="text-gray-900 hover:text-indigo-600 block px-3 py-2 rounded-md text-base font-medium"
              >
                分类管理
              </Link>
              <Link
                to="/admin/users"
                className="text-gray-900 hover:text-indigo-600 block px-3 py-2 rounded-md text-base font-medium"
              >
                用户管理
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;