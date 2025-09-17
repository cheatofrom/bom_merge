import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { User, isAuthenticated, getStoredUser, clearAuth, getCurrentUser, validateAndRefreshToken, isTokenValid } from '../services/auth';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (user: User) => void;
  logout: () => void;
  isAdmin: () => boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const tokenCheckInterval = useRef<NodeJS.Timeout | null>(null);

  const handleLogout = useCallback(() => {
    setUser(null);
    setLoading(false); // 确保登出时停止加载状态
    clearAuth();
    if (tokenCheckInterval.current) {
      clearInterval(tokenCheckInterval.current);
      tokenCheckInterval.current = null;
    }
  }, []);

  const initializeAuth = useCallback(async () => {
    try {
      if (isAuthenticated()) {
        // 验证并刷新token
        const isValid = await validateAndRefreshToken();
        
        if (isValid) {
          // Token有效，获取用户信息
          const storedUser = getStoredUser();
          if (storedUser) {
            setUser(storedUser);
            
            // 验证并更新用户信息
            try {
              const currentUser = await getCurrentUser();
              setUser(currentUser);
              localStorage.setItem('user_info', JSON.stringify(currentUser));
            } catch (error) {
              console.error('Failed to get current user:', error);
              // 如果获取用户信息失败，使用本地存储的信息
            }
          }
        } else {
          // Token无效或刷新失败，清除认证状态
          handleLogout();
        }
      }
    } catch (error) {
      console.error('Auth initialization error:', error);
      handleLogout();
    } finally {
      setLoading(false);
    }
  }, [handleLogout]);

  // 定期检查token有效性
  const startTokenValidationCheck = useCallback(() => {
    // 清除之前的定时器
    if (tokenCheckInterval.current) {
      clearInterval(tokenCheckInterval.current);
    }
    
    // 每5分钟检查一次token有效性
    tokenCheckInterval.current = setInterval(async () => {
      if (user && isAuthenticated()) {
        if (!isTokenValid()) {
          console.log('Token将要过期，尝试刷新...');
          const isValid = await validateAndRefreshToken();
          if (!isValid) {
            console.log('Token刷新失败，用户将被登出');
            handleLogout();
          }
        }
      }
    }, 5 * 60 * 1000); // 5分钟
  }, [user, handleLogout]);
  
  const stopTokenValidationCheck = useCallback(() => {
    if (tokenCheckInterval.current) {
      clearInterval(tokenCheckInterval.current);
      tokenCheckInterval.current = null;
    }
  }, []);

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);
  
  // 页面可见性变化时检查token
  const handleVisibilityChange = useCallback(async () => {
    if (!document.hidden && user && isAuthenticated()) {
      // 页面变为可见时检查token有效性
      const isValid = await validateAndRefreshToken();
      if (!isValid) {
        console.log('页面激活时发现token无效，用户将被登出');
        handleLogout();
      }
    }
  }, [user, handleLogout]);
  
  // 当用户登录时启动token检查，登出时停止
  useEffect(() => {
    if (user) {
      startTokenValidationCheck();
      // 监听页面可见性变化
      document.addEventListener('visibilitychange', handleVisibilityChange);
    } else {
      stopTokenValidationCheck();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
    
    // 组件卸载时清理定时器和事件监听器
    return () => {
      stopTokenValidationCheck();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, startTokenValidationCheck, stopTokenValidationCheck, handleVisibilityChange]);

  const handleLogin = (userData: User) => {
    setUser(userData);
  };

  const checkIsAdmin = (): boolean => {
    return user?.role === 'admin';
  };

  const refreshUser = useCallback(async () => {
    try {
      if (isAuthenticated()) {
        const currentUser = await getCurrentUser();
        setUser(currentUser);
        localStorage.setItem('user_info', JSON.stringify(currentUser));
      }
    } catch (error) {
      console.error('Refresh user error:', error);
      handleLogout();
    }
  }, [handleLogout]);

  const value: AuthContextType = {
    user,
    loading,
    login: handleLogin,
    logout: handleLogout,
    isAdmin: checkIsAdmin,
    refreshUser
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;