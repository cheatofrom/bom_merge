import axios from 'axios';
import { Part, Project, ProjectNote } from '../types';

// 设置基础URL，确保与后端API端口一致
const API_BASE_URL = 'http://192.168.1.66:8596';

const api = axios.create({
  baseURL: API_BASE_URL,
});

// 获取所有项目名称
export const getProjectNames = async (): Promise<string[]> => {
  const response = await api.get<string[]>('/project_names');
  return response.data;
};

// 获取所有项目
export const getAllProjects = async (): Promise<Project[]> => {
  const response = await api.get<Project[]>('/projects');
  return response.data;
};

// 获取零部件
export const getParts = async (projectName?: string): Promise<Part[]> => {
  const url = projectName ? `/parts?project_name=${projectName}` : '/parts';
  const response = await api.get<Part[]>(url);
  return response.data;
};

// 合并多个项目的零部件
export const mergeParts = async (projectNames: string[]): Promise<Part[]> => {
  const response = await api.post<Part[]>('/merge_parts', { project_names: projectNames });
  return response.data;
};

// 上传Excel文件
export const uploadPartsExcel = async (files: File[], projectName?: string): Promise<{status: string, rows_imported: number, details?: {filename: string, project_name: string, file_id: string, status: string, rows_imported?: number, error?: string}[]}> => {
  const formData = new FormData();
  
  // 添加多个文件
  files.forEach(file => {
    formData.append('files', file);
  });
  
  if (projectName) {
    formData.append('project_name', projectName);
  }
  
  const response = await api.post<{status: string, rows_imported: number, details?: {filename: string, project_name: string, file_id: string, status: string, rows_imported?: number, error?: string}[]}>('/upload_parts_excel', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  
  return response.data;
};

// 获取项目备注
export const getProjectNote = async (projectName: string): Promise<ProjectNote> => {
  const response = await api.get<ProjectNote>(`/project_notes/${projectName}`);
  return response.data;
};

// 获取所有项目备注
export const getAllProjectNotes = async (): Promise<ProjectNote[]> => {
  const response = await api.get<ProjectNote[]>('/project_notes');
  return response.data;
};

// 保存项目备注
export const saveProjectNote = async (projectNote: ProjectNote): Promise<ProjectNote> => {
  const response = await api.post<ProjectNote>('/project_notes', projectNote);
  return response.data;
};

// 更新零部件
export const updateParts = async (parts: Partial<Part>[]): Promise<{status: string, updated_count: number}> => {
  const response = await api.post<{status: string, updated_count: number}>('/update_parts', { parts });
  return response.data;
};
