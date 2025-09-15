import axios from 'axios';

// 设置基础URL，确保与后端API端口一致
const API_BASE_URL = 'http://192.168.1.66:8596';

const authApi = axios.create({
  baseURL: API_BASE_URL,
});

// 请求拦截器 - 添加JWT token
authApi.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 防止多个请求同时刷新token的标志
let isRefreshing = false;
let failedQueue: Array<{resolve: Function, reject: Function}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  });
  
  failedQueue = [];
};

// 响应拦截器 - 处理token过期
authApi.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // 如果正在刷新token，将请求加入队列
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return authApi(originalRequest);
        }).catch(err => {
          return Promise.reject(err);
        });
      }
      
      originalRequest._retry = true;
      isRefreshing = true;
      
      try {
        const refreshToken = localStorage.getItem('refresh_token');
        if (!refreshToken) {
          throw new Error('No refresh token available');
        }
        
        const response = await authApi.post('/api/auth/refresh', {
          refresh_token: refreshToken
        });
        
        const { access_token } = response.data;
        localStorage.setItem('access_token', access_token);
        
        // 处理队列中的请求
        processQueue(null, access_token);
        
        // 重试原请求
        originalRequest.headers.Authorization = `Bearer ${access_token}`;
        return authApi(originalRequest);
      } catch (refreshError) {
        // 刷新失败，处理队列并清除认证信息
        processQueue(refreshError, null);
        clearAuth();
        
        // 只有在不是登录页面时才跳转
        if (!window.location.pathname.includes('/login')) {
          window.location.href = '/login';
        }
        
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    
    return Promise.reject(error);
  }
);

// 用户认证相关接口
export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  full_name?: string;
  role?: 'user' | 'admin';
}

export interface User {
  id: number;
  username: string;
  email: string;
  full_name?: string;
  role: 'user' | 'admin';
  is_active: boolean;
  created_at: string;
  last_login?: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

export interface Permission {
  id: number;
  category_id: number;
  permission_type: 'view' | 'edit';
  created_at: string;
  granted_by_username?: string;
  resource_type: 'category';
  resource_name?: string;
}

export interface PermissionGrant {
  user_id: number;
  category_id: number;
  permission_type: 'view' | 'edit';
}

export interface PermissionRevoke {
  user_id: number;
  category_id: number;
}

export interface PermissionCheck {
  resource_type: 'category';
  resource_id: string;
  permission: 'view' | 'edit';
}

export interface UserResources {
  categories: Array<{
    id: number;
    name: string;
    created_at: string;
    permission?: string;
  }>;
}

// 用户登录
export const login = async (credentials: LoginRequest): Promise<AuthResponse> => {
  const response = await authApi.post<AuthResponse>('/api/auth/login', credentials);
  
  // 保存token和用户信息到localStorage
  const { access_token, refresh_token, user } = response.data;
  localStorage.setItem('access_token', access_token);
  localStorage.setItem('refresh_token', refresh_token);
  localStorage.setItem('user_info', JSON.stringify(user));
  
  return response.data;
};

// 用户注册
export const register = async (userData: RegisterRequest): Promise<AuthResponse> => {
  const response = await authApi.post<AuthResponse>('/api/auth/register', userData);
  return response.data;
};

// 用户登出
export const logout = async (): Promise<void> => {
  try {
    await authApi.post('/api/auth/logout');
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    // 清除本地存储
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user_info');
  }
};

// 获取当前用户信息
export const getCurrentUser = async (): Promise<User> => {
  const response = await authApi.get<{user: User}>('/api/auth/me');
  return response.data.user;
};

// 刷新token
export const refreshToken = async (): Promise<{ access_token: string }> => {
  const refresh_token = localStorage.getItem('refresh_token');
  if (!refresh_token) {
    throw new Error('No refresh token available');
  }
  
  const response = await authApi.post<{ access_token: string }>('/api/auth/refresh', {
    refresh_token
  });
  
  localStorage.setItem('access_token', response.data.access_token);
  return response.data;
};

// 获取用户列表（管理员）
export const getUsers = async (): Promise<User[]> => {
  const response = await authApi.get<{users: User[], pagination: any}>('/api/auth/users');
  return response.data.users;
};

// 切换用户状态（管理员）
export const toggleUserStatus = async (userId: number): Promise<{ message: string }> => {
  const response = await authApi.patch<{ message: string }>(`/api/auth/users/${userId}/toggle-status`);
  return response.data;
};

// 删除用户
export const deleteUser = async (userId: number): Promise<{message: string}> => {
  const response = await authApi.delete<{message: string}>(`/api/auth/users/${userId}`);
  return response.data;
};

// 权限管理相关接口

// 授予权限
export const grantPermission = async (permissionData: PermissionGrant): Promise<{ message: string }> => {
  const response = await authApi.post<{ message: string }>('/api/permissions/grant', permissionData);
  return response.data;
};

// 撤销权限
export const revokePermission = async (permissionData: PermissionRevoke): Promise<{ message: string }> => {
  const response = await authApi.delete<{ message: string }>('/api/permissions/revoke', {
    data: permissionData
  });
  return response.data;
};

// 获取用户权限
export const getUserPermissions = async (userId: number): Promise<{ permissions: Permission[] }> => {
  const response = await authApi.get<{ permissions: Permission[] }>(`/api/permissions/user/${userId}`);
  return response.data;
};

// 获取当前用户可访问的资源
export const getMyResources = async (): Promise<UserResources> => {
  const response = await authApi.get<UserResources>('/api/permissions/my-resources');
  return response.data;
};

// 检查资源权限
export const checkPermission = async (permissionData: PermissionCheck): Promise<{
  has_permission: boolean;
  resource_type: string;
  resource_id: string;
  permission: string;
}> => {
  const response = await authApi.post('/api/permissions/check', permissionData);
  return response.data;
};

// 工具函数

// 检查用户是否已登录
export const isAuthenticated = (): boolean => {
  const token = localStorage.getItem('access_token');
  const userInfo = localStorage.getItem('user_info');
  return !!(token && userInfo);
};

// 检查token是否有效（通过解析JWT payload检查过期时间）
export const isTokenValid = (): boolean => {
  const token = localStorage.getItem('access_token');
  if (!token) return false;
  
  try {
    // 解析JWT token的payload部分
    const payload = JSON.parse(atob(token.split('.')[1]));
    const currentTime = Math.floor(Date.now() / 1000);
    
    // 检查token是否过期（留5分钟缓冲时间）
    return payload.exp && payload.exp > (currentTime + 300);
  } catch (error) {
    console.error('Token validation error:', error);
    return false;
  }
};

// 验证token有效性并尝试刷新
export const validateAndRefreshToken = async (): Promise<boolean> => {
  if (!isAuthenticated()) return false;
  
  // 如果token仍然有效，直接返回true
  if (isTokenValid()) return true;
  
  // 尝试刷新token
  try {
    await refreshToken();
    return true;
  } catch (error) {
    console.error('Token refresh failed:', error);
    clearAuth();
    return false;
  }
};

// 获取本地存储的用户信息
export const getStoredUser = (): User | null => {
  const userInfo = localStorage.getItem('user_info');
  return userInfo ? JSON.parse(userInfo) : null;
};

// 检查用户是否为管理员
export const isAdmin = (): boolean => {
  const user = getStoredUser();
  return user?.role === 'admin';
};

// 清除认证信息
export const clearAuth = (): void => {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user_info');
};

export default authApi;