import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Navbar from './components/Navbar';
import Login from './components/Login';
import Register from './pages/Register';
import UserManagement from './components/UserManagement';
import CategoryManager from './components/CategoryManager';
import ProjectSelection from './pages/ProjectSelection';
import MergedParts from './pages/MergedParts';
import MergedProjectList from './pages/MergedProjectList';
import MergedProjectParts from './pages/MergedProjectParts';
import './App.css';

function App() {
  return (
    <AuthProvider>
      <div className="App">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/*" element={
            <ProtectedRoute>
              <Navbar />
              <Routes>
                <Route path="/" element={<ProjectSelection />} />
                <Route path="/merged-parts" element={<MergedParts />} />
                <Route path="/merged-projects" element={<MergedProjectList />} />
                <Route path="/merged-project-parts/:mergedProjectId" element={<MergedProjectParts />} />
                <Route path="/categories" element={
                  <ProtectedRoute requireAdmin={true}>
                    <CategoryManager isModal={false} />
                  </ProtectedRoute>
                } />
                <Route path="/admin/users" element={
                  <ProtectedRoute requireAdmin={true}>
                    <UserManagement />
                  </ProtectedRoute>
                } />
              </Routes>
            </ProtectedRoute>
          } />
        </Routes>
      </div>
    </AuthProvider>
  );
}

export default App;
