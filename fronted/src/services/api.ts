import axios from 'axios';
import { Part, Project, ProjectNote, MergedProject, MergedPart, UploadedFile, FileMapping } from '../types';

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

// 合并多个项目的零部件（通过项目名称）
export const mergeParts = async (projectNames: string[]): Promise<Part[]> => {
  const response = await api.post<Part[]>('/merge_parts', { project_names: projectNames });
  return response.data;
};

// 合并多个项目的零部件（通过文件唯一ID）
export const mergePartsByFileIds = async (fileUniqueIds: string[]): Promise<Part[]> => {
  const response = await api.post<Part[]>('/merge_parts_by_file_ids', { file_unique_ids: fileUniqueIds });
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
  // 使用encodeURIComponent确保URL中的特殊字符（如空格、中文等）被正确编码
  const encodedProjectName = encodeURIComponent(projectName);
  try {
    const response = await api.get<ProjectNote>(`/project_notes/${encodedProjectName}`);
    return response.data;
  } catch (error) {
    // 如果路径参数方式失败，尝试使用查询参数方式
    console.log(`通过路径参数获取项目备注失败，尝试使用查询参数方式: ${projectName}`);
    const response = await api.get<ProjectNote>(`/project_notes/by_name?project_name=${encodedProjectName}`);
    return response.data;
  }
};

// 获取所有项目备注
export const getAllProjectNotes = async (): Promise<ProjectNote[]> => {
  const response = await api.get<ProjectNote[]>('/project_notes');
  return response.data;
};

// 获取上传文件列表
export const getUploadedFiles = async (projectName?: string): Promise<UploadedFile[]> => {
  const url = projectName ? `/uploaded_files?project_name=${projectName}` : '/uploaded_files';
  const response = await api.get<UploadedFile[]>(url);
  return response.data;
};

// 获取单个上传文件信息
export const getUploadedFile = async (fileUniqueId: string): Promise<UploadedFile> => {
  const response = await api.get<UploadedFile>(`/uploaded_files/${fileUniqueId}`);
  return response.data;
};

// 更新文件名
export const updateFileName = async (fileUniqueId: string, newFilename: string): Promise<{status: string, message: string, file: UploadedFile}> => {
  const response = await api.put<{status: string, message: string, file: UploadedFile}>(`/uploaded_files/${fileUniqueId}/rename?new_filename=${encodeURIComponent(newFilename)}`);
  return response.data;
};

// 更新项目名称
export const updateProjectName = async (fileUniqueId: string, newProjectName: string): Promise<{status: string, message: string, file: UploadedFile}> => {
  const response = await api.put<{status: string, message: string, file: UploadedFile}>(`/uploaded_files/${fileUniqueId}/update_project?new_project_name=${encodeURIComponent(newProjectName)}`);
  return response.data;
};

// 获取文件映射
export const getFileMappings = async (fileUniqueId?: string, entityType?: string, entityId?: string): Promise<FileMapping[]> => {
  let url = '/file_mappings';
  const params: Record<string, string> = {};
  
  if (fileUniqueId) {
    params.file_unique_id = fileUniqueId;
  }
  if (entityType) {
    params.entity_type = entityType;
  }
  if (entityId) {
    params.entity_id = entityId;
  }
  
  // 如果有参数，添加到URL
  if (Object.keys(params).length > 0) {
    const queryParams = new URLSearchParams(params);
    url = `${url}?${queryParams.toString()}`;
  }
  
  const response = await api.get<FileMapping[]>(url);
  return response.data;
};

// 获取指定文件的映射
export const getFileMappingsByFileId = async (fileUniqueId: string): Promise<FileMapping[]> => {
  const response = await api.get<FileMapping[]>(`/file_mappings/${fileUniqueId}`);
  return response.data;
};

// 保存项目备注
export const saveProjectNote = async (projectNote: ProjectNote): Promise<ProjectNote> => {
  try {
    const response = await api.post<ProjectNote>('/project_notes', projectNote);
    return response.data;
  } catch (error) {
    console.error(`保存项目备注失败: ${projectNote.project_name}`, error);
    throw error;
  }
};

// 更新零部件
export const updateParts = async (parts: Partial<Part>[]): Promise<{status: string, updated_count: number}> => {
  const response = await api.post<{status: string, updated_count: number}>('/update_parts', { parts });
  return response.data;
};

// 保存合并项目
export const saveMergedProject = async (mergedProjectName: string, sourceProjects: string[], parts: Part[], sourceFileIds?: string[]): Promise<{status: string, merged_project_id: number, message: string}> => {
  const response = await api.post<{status: string, merged_project_id: number, message: string}>('/save_merged_project', {
    merged_project_name: mergedProjectName,
    source_projects: sourceProjects,
    source_file_ids: sourceFileIds,
    parts: parts
  });
  return response.data;
};

// 获取所有合并项目
export const getMergedProjects = async (): Promise<MergedProject[]> => {
  const response = await api.get<MergedProject[]>('/merged_projects');
  return response.data;
};

// 获取合并项目的零部件
export const getMergedProjectParts = async (mergedProjectId: number): Promise<{parts: MergedPart[], project: MergedProject}> => {
  const response = await api.get<{parts: MergedPart[], project: MergedProject}>(`/merged_project_parts/${mergedProjectId}`);
  return response.data;
};

// 删除合并项目
export const deleteMergedProject = async (mergedProjectId: number): Promise<{status: string, message: string}> => {
  const response = await api.delete<{status: string, message: string}>(`/merged_projects/${mergedProjectId}`);
  return response.data;
};

// 删除合并项目中的零部件
export const deleteMergedPart = async (partId: number): Promise<{status: string, message: string}> => {
  const response = await api.delete<{status: string, message: string}>(`/merged_parts/${partId}`);
  return response.data;
};

// 导出合并项目为Excel
export const exportMergedProject = async (mergedProjectId: number, projectName?: string): Promise<Blob> => {
  try {
    const response = await api.get(`/export_merged_project/${mergedProjectId}`, {
      responseType: 'blob'
    });
    
    // 检查响应内容类型
    const contentType = response.headers['content-type'];
    if (contentType && contentType.includes('application/json')) {
      // 如果服务器返回的是JSON错误而不是文件，则解析错误
      const reader = new FileReader();
      return new Promise((resolve, reject) => {
        reader.onload = () => {
          try {
            const errorJson = JSON.parse(reader.result as string);
            reject(new Error(errorJson.message || '导出失败'));
          } catch (e) {
            reject(new Error('导出失败，服务器返回了无效的响应'));
          }
        };
        reader.onerror = () => reject(new Error('读取响应失败'));
        reader.readAsText(response.data);
      });
    }
    
    // 处理文件下载
    const blob = new Blob([response.data], { 
      type: contentType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName || `合并项目_${mergedProjectId}`}_零部件清单.xlsx`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }, 100);
    
    return response.data;
  } catch (error) {
    console.error('导出Excel文件失败:', error);
    throw error;
  }
};

// 删除普通项目
export const deleteProject = async (projectName: string): Promise<{status: string, message: string}> => {
  const response = await api.delete<{status: string, message: string}>(`/projects/${projectName}`);
  return response.data;
};
