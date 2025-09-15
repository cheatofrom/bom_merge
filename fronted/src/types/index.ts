// 零部件类型定义
export interface Part {
  id: number;
  level: number;
  part_code: string;
  part_name: string;
  spec: string;
  version: string;
  material: string;
  unit_count_per_level: string;
  unit_weight_kg: string;
  total_weight_kg: number;
  part_property: string;
  drawing_size: string;
  reference_number: string;
  purchase_status: string;
  process_route: string;
  remark: string;
  upload_batch: string;
  project_name: string;
  file_unique_id: string;
  created_at: string;
}

// 项目类型定义
export interface Project {
  project_name: string;
  upload_batch: string;
  file_unique_id: string;
  category_id?: number;
}

// 项目备注类型定义
export interface ProjectNote {
  id?: number;
  project_name: string;
  file_unique_id?: string;
  note: string;
  created_at?: string;
  updated_at?: string;
}

// 合并项目类型定义
export interface MergedProject {
  id: number;
  merged_project_name: string;
  source_projects: string[];
  created_at: string;
  created_by?: number;
  creator_name?: string;
  creator_full_name?: string;
}

// 合并零部件类型定义
export interface MergedPart {
  id: number;
  merged_project_id: number;
  level: number;
  part_code: string;
  part_name: string;
  spec: string;
  version: string;
  material: string;
  unit_count_per_level: string;
  unit_weight_kg: string;
  total_weight_kg: number;
  part_property: string;
  drawing_size: string;
  reference_number: string;
  purchase_status: string;
  process_route: string;
  remark: string;
  created_at: string;
  updated_at: string;
}

// 上传文件类型定义
export interface UploadedFile {
  id: number;
  file_unique_id: string;
  original_filename: string;
  file_size: number;
  file_type: string;
  upload_time: string;
  project_name: string;
  status: string;
  rows_imported: number;
  error_message?: string;
  category_id?: number;
}

// 项目分类类型定义
export interface Category {
  id: number;
  name: string;
  description?: string;
  color?: string;
  created_at: string;
  updated_at: string;
}

// 项目分类关联类型定义
export interface ProjectCategory {
  id: number;
  project_name: string;
  file_unique_id: string;
  category_id: number;
  created_at: string;
}

// 文件映射类型定义
export interface FileMapping {
  id: number;
  file_unique_id: string;
  entity_type: string; // 'project', 'part', 等
  entity_id: string;
  mapping_type: string; // 'excel_import', 'part_in_excel', 等
  mapping_data: Record<string, any>;
  created_at: string;
  updated_at: string;
}